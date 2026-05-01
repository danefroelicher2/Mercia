import { CronJob } from 'cron';
import { getLLM } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';
import { sendPush } from '../services/pushNotifications';

// ============================================
// DAILY SUMMARY JOB
// Runs at 6:00 AM EST every day.
// Reads task_completion_history for yesterday,
// computes stats, calls Groq for a short narrative,
// and upserts into weekly_summaries (same table/schema
// as before — only the cadence and data source change).
// ============================================

export function startDailySummaryJob(): CronJob {
  const job = new CronJob(
    '0 6 * * *',
    async () => {
      console.log('\n[DAILY-SUMMARY] ========================================');
      console.log('[DAILY-SUMMARY] Starting daily summary generation');
      console.log('[DAILY-SUMMARY] ========================================\n');
      try {
        await runDailySummaryGeneration();
      } catch (error) {
        console.error('[DAILY-SUMMARY] Unhandled error:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Daily summary job scheduled for 6:00 AM ET');
  return job;
}

export async function runDailySummaryGeneration(): Promise<{ usersProcessed: number; duration: number }> {
  const startTime = Date.now();
  const yesterday = getYesterdayDateString(); // YYYY-MM-DD
  const dayOfWeek = getDayOfWeekForDate(yesterday); // lowercase, e.g. 'monday'

  console.log(`[DAILY-SUMMARY] Generating summaries for ${yesterday} (${dayOfWeek})`);

  const supabase = getSupabase();

  // Get every distinct user who has routine tasks set up
  const { data: userRows, error: usersError } = await supabase
    .schema('oasis')
    .from('routine_tasks')
    .select('user_id');

  if (usersError) {
    console.error('[DAILY-SUMMARY] Failed to fetch user IDs:', usersError);
    return { usersProcessed: 0, duration: 0 };
  }

  const userIds = [...new Set((userRows || []).map((r: any) => r.user_id as string))];
  console.log(`[DAILY-SUMMARY] Processing ${userIds.length} users`);

  let usersProcessed = 0;
  for (const userId of userIds) {
    try {
      await generateSummaryForUser(userId, yesterday, dayOfWeek, supabase);
      usersProcessed++;
    } catch (err) {
      console.error(`[DAILY-SUMMARY] Error processing user ${userId}:`, err);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`[DAILY-SUMMARY] Done — ${usersProcessed}/${userIds.length} users in ${duration}s`);
  return { usersProcessed, duration };
}

async function generateSummaryForUser(
  userId: string,
  date: string,       // YYYY-MM-DD — yesterday
  dayOfWeek: string,  // lowercase, matches routine_tasks.day_of_week
  supabase: ReturnType<typeof getSupabase>
): Promise<void> {

  // ── 1. Task completion history for yesterday ──────────────────────────────
  const { data: completedRows } = await supabase
    .schema('oasis')
    .from('task_completion_history')
    .select('task_id, task_text, task_type')
    .eq('user_id', userId)
    .eq('snapshot_date', date)
    .eq('completed', true);

  // ── 2. All tasks defined for yesterday's day-of-week (for totals) ─────────
  const { data: allTaskRows } = await supabase
    .schema('oasis')
    .from('routine_tasks')
    .select('id, text, type')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek);

  const completedTasks = completedRows || [];
  const allTasks = allTaskRows || [];

  // ── 3. Gym log for yesterday ───────────────────────────────────────────────
  const { data: gymRows } = await supabase
    .schema('oasis')
    .from('gym_workout_log')
    .select('workout_group')
    .eq('user_id', userId)
    .eq('logged_date', date);

  // ── 4. Question answered yesterday ────────────────────────────────────────
  const { data: questionRows } = await supabase
    .schema('oasis')
    .from('user_activity_log')
    .select('id')
    .eq('user_id', userId)
    .eq('activity_date', date)
    .eq('activity_type', 'question_answered')
    .limit(1);

  // ── 5. Current weekly + monthly goal state (with text) ───────────────────
  const { data: weeklyGoalRows } = await supabase
    .schema('oasis')
    .from('routine_goals')
    .select('id, text, completed')
    .eq('user_id', userId)
    .eq('type', 'weekly');

  const { data: monthlyGoalRows } = await supabase
    .schema('oasis')
    .from('routine_goals')
    .select('id, text, completed')
    .eq('user_id', userId)
    .eq('type', 'monthly');

  // ── 6. Previous daily summary for improvement comparison ──────────────────
  const { data: prevRow } = await supabase
    .schema('oasis')
    .from('weekly_summaries')
    .select('overall_percentage, weekly_goals_completed, monthly_goals_completed')
    .eq('user_id', userId)
    .lt('week_end_date', date)
    .order('week_end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 7. Compute stats ───────────────────────────────────────────────────────
  const nonNegTasks = allTasks.filter((t: any) => t.type === 'non-negotiable');

  const completedIds = new Set(completedTasks.map((t: any) => t.task_id));

  const nonnegTotal     = nonNegTasks.length;
  const nonnegCompleted = nonNegTasks.filter((t: any) => completedIds.has(t.id)).length;
  const nonnegPct       = nonnegTotal > 0 ? Math.round((nonnegCompleted / nonnegTotal) * 100) : 0;

  // Weekly goals
  const weeklyGoals = weeklyGoalRows || [];
  const weeklyGoalsTotal     = weeklyGoals.length;
  const weeklyGoalsCompleted = weeklyGoals.filter((g: any) => g.completed).length;
  const weeklyGoalsPct       = weeklyGoalsTotal > 0 ? Math.round((weeklyGoalsCompleted / weeklyGoalsTotal) * 100) : 0;
  const completedWeeklyGoalTexts = weeklyGoals
    .filter((g: any) => g.completed)
    .map((g: any) => g.text as string);

  // Monthly goals
  const monthlyGoals = monthlyGoalRows || [];
  const monthlyGoalsTotal     = monthlyGoals.length;
  const monthlyGoalsCompleted = monthlyGoals.filter((g: any) => g.completed).length;
  const monthlyGoalsPct       = monthlyGoalsTotal > 0 ? Math.round((monthlyGoalsCompleted / monthlyGoalsTotal) * 100) : 0;
  const completedMonthlyGoalTexts = monthlyGoals
    .filter((g: any) => g.completed)
    .map((g: any) => g.text as string);

  const gymLogged  = (gymRows || []).length > 0;
  const gymGroup   = gymLogged ? (gymRows![0] as any).workout_group : null;
  const questionAnswered = (questionRows || []).length > 0;

  // Tasks missed = tasks scheduled for this day that weren't completed (with type)
  const tasksMissedFrequently = allTasks
    .filter((t: any) => !completedIds.has(t.id))
    .map((t: any) => ({ task_id: t.id, task_name: t.text, times_missed: 1, day: dayOfWeek, task_type: t.type }));

  // Overall percentage = average of nonneg + weekly goals
  const activePctSources = [
    ...(nonnegTotal > 0 ? [nonnegPct] : []),
    ...(weeklyGoalsTotal > 0 ? [weeklyGoalsPct] : []),
  ];
  const overallPct = activePctSources.length > 0
    ? Math.round(activePctSources.reduce((a, b) => a + b, 0) / activePctSources.length)
    : 0;

  // Yesterday's overall for performance comparison
  const yesterdayOverallPct = prevRow ? Number(prevRow.overall_percentage || 0) : 0;

  // Performance delta
  let improvementPct = 0;
  let isImprovement = false;
  if (prevRow && activePctSources.length > 0) {
    const diff = overallPct - yesterdayOverallPct;
    improvementPct = Math.abs(Math.round(diff));
    isImprovement  = diff >= 0;
  }

  // Goal changes vs yesterday
  const prevWeeklyGoalsCompleted = prevRow ? Number(prevRow.weekly_goals_completed || 0) : 0;
  const prevMonthlyGoalsCompleted = prevRow ? Number(prevRow.monthly_goals_completed || 0) : 0;
  const weeklyGoalsChangeToday  = weeklyGoalsCompleted - prevWeeklyGoalsCompleted;
  const monthlyGoalsChangeToday = monthlyGoalsCompleted - prevMonthlyGoalsCompleted;

  const hasData = nonnegCompleted > 0 || gymLogged || questionAnswered;

  // ── 7b. Weekly missed tasks (non-negotiables, Monday of this week → yesterday) ──
  const weekDates = getDatesFromMondayToDate(date);
  const weekStart = weekDates[0];

  const [{ data: allNonNegRows }, { data: weekCompletionRows }] = await Promise.all([
    supabase
      .schema('oasis')
      .from('routine_tasks')
      .select('id, text, day_of_week')
      .eq('user_id', userId)
      .eq('type', 'non-negotiable'),
    supabase
      .schema('oasis')
      .from('task_completion_history')
      .select('task_id, snapshot_date')
      .eq('user_id', userId)
      .gte('snapshot_date', weekStart)
      .lte('snapshot_date', date)
      .eq('completed', true),
  ]);

  const weekCompletedSet = new Set(
    (weekCompletionRows || []).map((c: any) => `${c.task_id}::${c.snapshot_date}`)
  );

  const weekMissedMap = new Map<string, { task_id: string; task_name: string; times_missed: number }>();

  for (const d of weekDates) {
    const dow = getDayOfWeekForDate(d);
    const tasksForDay = (allNonNegRows || []).filter((t: any) => t.day_of_week === dow);
    for (const task of tasksForDay as any[]) {
      if (!weekCompletedSet.has(`${task.id}::${d}`)) {
        const existing = weekMissedMap.get(task.id);
        if (existing) {
          existing.times_missed++;
        } else {
          weekMissedMap.set(task.id, { task_id: task.id, task_name: task.text, times_missed: 1 });
        }
      }
    }
  }

  const weeklyMissedTasks = Array.from(weekMissedMap.values())
    .sort((a, b) => b.times_missed - a.times_missed);

  // ── 8. Groq narrative (skip if no data) ───────────────────────────────────
  let narrative: string | null = null;
  if (hasData) {
    try {
      const llm = getLLM();
      const prompt = buildNarrativePrompt({
        dayOfWeek,
        nonnegCompleted,
        nonnegTotal,
        tasksMissed: tasksMissedFrequently.map((t: any) => t.task_name),
        gymLogged,
        gymGroup,
        questionAnswered,
      });

      narrative = await llm.chat(
        [
          {
            role: 'system',
            content:
              'You are Mercia, a personal AI coach. Write short, direct daily summaries. ' +
              'Be specific and honest. Never use generic filler. Never use the word "navigate".',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.65, maxTokens: 120 }
      );
      console.log(`[DAILY-SUMMARY] Narrative generated for user ${userId}`);
    } catch (err) {
      console.error(`[DAILY-SUMMARY] Groq call failed for user ${userId}:`, err);
    }
  }

  // ── 9. Upsert into weekly_summaries (same table, same schema) ─────────────
  // week_start_date = week_end_date = yesterday (daily cadence)
  // best_day_combined / most_consistent_day = '—' (not meaningful for single day)
  const { error: upsertError } = await supabase
    .schema('oasis')
    .from('weekly_summaries')
    .upsert(
      {
        user_id: userId,
        week_start_date: date,
        week_end_date: date,
        nonnegotiables_completed: nonnegCompleted,
        nonnegotiables_total: nonnegTotal,
        nonnegotiables_percentage: nonnegPct,
        best_day_combined: '—',
        most_consistent_day: '—',
        tasks_missed_frequently: tasksMissedFrequently,
        weekly_goals_completed: weeklyGoalsCompleted,
        weekly_goals_total: weeklyGoalsTotal,
        weekly_goals_percentage: weeklyGoalsPct,
        completed_weekly_goal_texts: completedWeeklyGoalTexts,
        weekly_goals_change_today: weeklyGoalsChangeToday,
        monthly_goals_total: monthlyGoalsTotal,
        monthly_goals_completed: monthlyGoalsCompleted,
        monthly_goals_percentage: monthlyGoalsPct,
        monthly_goals_change_from_last_week: 0,
        completed_monthly_goal_texts: completedMonthlyGoalTexts,
        monthly_goals_change_today: monthlyGoalsChangeToday,
        overall_percentage: overallPct,
        yesterday_overall_percentage: yesterdayOverallPct,
        improvement_percentage: improvementPct,
        is_improvement: isImprovement,
        has_complete_data: hasData,
        is_saved: false,
        weekly_missed_tasks: weeklyMissedTasks,
      },
      { onConflict: 'user_id,week_end_date' }
    );

  if (upsertError) {
    throw new Error(`weekly_summaries upsert failed: ${upsertError.message}`);
  }

  console.log(
    `[DAILY-SUMMARY] Saved — user ${userId} | score: ${nonnegPct}% non-neg | ` +
    `gym: ${gymLogged} | question: ${questionAnswered} | narrative: ${!!narrative}`
  );

  // ── 10. Push notification ─────────────────────────────────────────────────
  // Check if user has weekly_summary_enabled before sending
  const { data: prefRow } = await supabase
    .schema('oasis')
    .from('notification_preferences')
    .select('weekly_summary_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  // Default to enabled if no preference row exists yet
  const summaryEnabled = prefRow ? prefRow.weekly_summary_enabled : true;

  if (summaryEnabled && hasData) {
    // Generate a punchy single-line push body from the summary data using Groq
    let pushBody = 'Your daily summary is ready.';
    try {
      const llm = getLLM();
      const pushPrompt = buildPushPrompt({
        nonnegCompleted,
        nonnegTotal,
        gymLogged,
        gymGroup,
        overallPct,
        isImprovement,
        improvementPct,
        narrative,
      });
      const rawPush = await llm.chat(
        [
          {
            role: 'system',
            content:
              'You are Mercia. Write one punchy push notification line — under 60 characters. ' +
              'Be specific, direct, and personal. No quotes. No period at the end. No filler.',
          },
          { role: 'user', content: pushPrompt },
        ],
        { temperature: 0.7, maxTokens: 30 }
      );
      if (rawPush && rawPush.trim().length > 0) {
        pushBody = rawPush.trim().replace(/^["']|["']$/g, '');
      }
    } catch (err) {
      console.error(`[DAILY-SUMMARY] Push body generation failed for user ${userId}:`, err);
    }

    await sendPush(userId, 'Daily Summary Ready', pushBody, { screen: 'SummaryHistory' });
    console.log(`[DAILY-SUMMARY] Push sent to user ${userId}: "${pushBody}"`);
  }
}

// ============================================
// NARRATIVE PROMPT
// ============================================

function buildNarrativePrompt(data: {
  dayOfWeek: string;
  nonnegCompleted: number;
  nonnegTotal: number;
  tasksMissed: string[];
  gymLogged: boolean;
  gymGroup: string | null;
  questionAnswered: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`Day: ${data.dayOfWeek}`);
  lines.push(`Non-negotiables: ${data.nonnegCompleted}/${data.nonnegTotal} completed`);
  if (data.tasksMissed.length > 0) {
    lines.push(`Missed: ${data.tasksMissed.slice(0, 3).join(', ')}`);
  }
  lines.push(`Gym: ${data.gymLogged ? `yes — ${data.gymGroup}` : 'no'}`);
  lines.push(`Daily question answered: ${data.questionAnswered ? 'yes' : 'no'}`);
  lines.push('');
  lines.push(
    'Write exactly 2 sentences. Sentence 1: what stood out about this day (be specific about the numbers or the gym). ' +
    'Sentence 2: one direct, actionable callout — either reinforce what worked or name what to fix tomorrow. ' +
    'Under 55 words total.'
  );
  return lines.join('\n');
}

function buildPushPrompt(data: {
  nonnegCompleted: number;
  nonnegTotal: number;
  gymLogged: boolean;
  gymGroup: string | null;
  overallPct: number;
  isImprovement: boolean;
  improvementPct: number;
  narrative: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Non-negotiables: ${data.nonnegCompleted}/${data.nonnegTotal}`);
  if (data.gymLogged) lines.push(`Gym: ${data.gymGroup ?? 'yes'}`);
  lines.push(`Overall score: ${data.overallPct}%`);
  if (data.improvementPct > 0) {
    lines.push(`${data.isImprovement ? '+' : '-'}${data.improvementPct}% vs yesterday`);
  }
  if (data.narrative) lines.push(`Summary: ${data.narrative}`);
  lines.push('Write one notification line that makes them want to open the app.');
  return lines.join('\n');
}

// ============================================
// DATE HELPERS
// ============================================

function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Returns all dates from Monday of the week containing dateStr through dateStr (inclusive)
function getDatesFromMondayToDate(dateStr: string): string[] {
  const end = new Date(dateStr + 'T12:00:00Z');
  const utcDay = end.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
  const dates: string[] = [];
  for (let i = daysFromMonday; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Returns lowercase day name matching routine_tasks.day_of_week constraint
function getDayOfWeekForDate(dateStr: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // Use noon UTC to avoid DST edge cases flipping the date
  const date = new Date(dateStr + 'T12:00:00Z');
  return days[date.getUTCDay()];
}
