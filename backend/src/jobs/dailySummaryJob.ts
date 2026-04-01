import { CronJob } from 'cron';
import { getLLM } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';

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

  // ── 5. Current weekly goal state ──────────────────────────────────────────
  const { data: goalRows } = await supabase
    .schema('oasis')
    .from('routine_goals')
    .select('completed')
    .eq('user_id', userId)
    .eq('type', 'weekly');

  // ── 6. Previous daily summary for improvement comparison ──────────────────
  const { data: prevRow } = await supabase
    .schema('oasis')
    .from('weekly_summaries')
    .select('nonnegotiables_percentage')
    .eq('user_id', userId)
    .lt('week_end_date', date)
    .order('week_end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 7. Compute stats ───────────────────────────────────────────────────────
  const nonNegTasks = allTasks.filter((t: any) => t.type === 'non-negotiable');
  const niceTasks   = allTasks.filter((t: any) => t.type === 'nice-to-have');

  const completedIds = new Set(completedTasks.map((t: any) => t.task_id));

  const nonnegTotal     = nonNegTasks.length;
  const nonnegCompleted = nonNegTasks.filter((t: any) => completedIds.has(t.id)).length;
  const nonnegPct       = nonnegTotal > 0 ? Math.round((nonnegCompleted / nonnegTotal) * 100) : 0;

  const niceTotal     = niceTasks.length;
  const niceCompleted = niceTasks.filter((t: any) => completedIds.has(t.id)).length;
  const nicePct       = niceTotal > 0 ? Math.round((niceCompleted / niceTotal) * 100) : 0;

  // Weekly goals percentage (used for overall display)
  const goals = goalRows || [];
  const goalsTotal     = goals.length;
  const goalsCompleted = goals.filter((g: any) => g.completed).length;
  const goalsPct       = goalsTotal > 0 ? Math.round((goalsCompleted / goalsTotal) * 100) : 0;

  const gymLogged  = (gymRows || []).length > 0;
  const gymGroup   = gymLogged ? (gymRows![0] as any).workout_group : null;
  const questionAnswered = (questionRows || []).length > 0;

  // Tasks missed = tasks scheduled for this day that weren't completed
  const tasksMissedFrequently = allTasks
    .filter((t: any) => !completedIds.has(t.id))
    .map((t: any) => ({ task_name: t.text, times_missed: 1, day: dayOfWeek }));

  // Improvement vs previous day
  const prevPct = prevRow ? Number(prevRow.nonnegotiables_percentage) : null;
  let improvementPct = 0;
  let isImprovement = false;
  if (prevPct !== null && nonnegTotal > 0) {
    const diff = nonnegPct - prevPct;
    improvementPct = Math.abs(Math.round(diff));
    isImprovement  = diff >= 0;
  }

  const hasData = allTasks.length > 0 || gymLogged || questionAnswered;

  // ── 8. Groq narrative (skip if no data) ───────────────────────────────────
  let narrative: string | null = null;
  if (hasData) {
    try {
      const llm = getLLM();
      const prompt = buildNarrativePrompt({
        dayOfWeek,
        nonnegCompleted,
        nonnegTotal,
        niceCompleted,
        niceTotal,
        tasksMissed: tasksMissedFrequently.map((t) => t.task_name),
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
        nicetohaves_completed: niceCompleted,
        nicetohaves_total: niceTotal,
        nicetohaves_percentage: nicePct,
        best_day_combined: '—',
        most_consistent_day: '—',
        tasks_missed_frequently: tasksMissedFrequently,
        weekly_goals_completed: goalsCompleted,
        weekly_goals_total: goalsTotal,
        weekly_goals_percentage: goalsPct,
        monthly_goals_total: 0,
        monthly_goals_change_from_last_week: 0,
        improvement_percentage: improvementPct,
        is_improvement: isImprovement,
        has_complete_data: hasData,
        is_saved: false,
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
}

// ============================================
// NARRATIVE PROMPT
// ============================================

function buildNarrativePrompt(data: {
  dayOfWeek: string;
  nonnegCompleted: number;
  nonnegTotal: number;
  niceCompleted: number;
  niceTotal: number;
  tasksMissed: string[];
  gymLogged: boolean;
  gymGroup: string | null;
  questionAnswered: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`Day: ${data.dayOfWeek}`);
  lines.push(`Non-negotiables: ${data.nonnegCompleted}/${data.nonnegTotal} completed`);
  if (data.niceTotal > 0) {
    lines.push(`Nice-to-haves: ${data.niceCompleted}/${data.niceTotal} completed`);
  }
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

// ============================================
// DATE HELPERS
// ============================================

function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// Returns lowercase day name matching routine_tasks.day_of_week constraint
function getDayOfWeekForDate(dateStr: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // Use noon UTC to avoid DST edge cases flipping the date
  const date = new Date(dateStr + 'T12:00:00Z');
  return days[date.getUTCDay()];
}
