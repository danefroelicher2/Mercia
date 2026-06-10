import { CronJob } from 'cron';
import { getLLM } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';
import { sendPush } from '../services/pushNotifications';
import {
  computeSummaryStats,
  getYesterdayDateString,
  getDayOfWeekForDate,
} from '../lib/summaryCompute';

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

  // ── 1–7. Compute all stats via shared helper ──────────────────────────────
  const stats = await computeSummaryStats(userId, date, supabase);

  // Re-derive gymGroup for the narrative prompt (one lightweight query)
  const { data: gymRows } = await supabase
    .schema('oasis')
    .from('gym_workout_log')
    .select('workout_group')
    .eq('user_id', userId)
    .eq('logged_date', date);
  const gymGroup = (gymRows && gymRows.length > 0) ? (gymRows[0] as any).workout_group : null;
  const gymLoggedToday = (gymRows || []).length > 0;

  const hasData = stats.has_complete_data;

  // ── 8. Groq narrative (skip if no data) ───────────────────────────────────
  let narrative: string | null = null;
  if (hasData) {
    try {
      const llm = getLLM();
      const prompt = buildNarrativePrompt({
        dayOfWeek,
        nonnegCompleted: stats.nonnegotiables_completed,
        nonnegTotal: stats.nonnegotiables_total,
        tasksMissed: stats.tasks_missed_frequently.map((t: any) => t.task_name),
        gymLogged: gymLoggedToday,
        gymGroup,
        questionAnswered: false,
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

  // ── 9. Upsert into weekly_summaries ───────────────────────────────────────
  const { error: upsertError } = await supabase
    .schema('oasis')
    .from('weekly_summaries')
    .upsert(
      {
        user_id: userId,
        week_start_date: stats.week_start_date,
        week_end_date: date,
        nonnegotiables_completed: stats.nonnegotiables_completed,
        nonnegotiables_total: stats.nonnegotiables_total,
        nonnegotiables_percentage: stats.nonnegotiables_percentage,
        best_day_combined: '—',
        most_consistent_day: '—',
        tasks_missed_frequently: stats.tasks_missed_frequently,
        weekly_goals_completed: stats.weekly_goals_completed,
        weekly_goals_total: stats.weekly_goals_total,
        weekly_goals_percentage: stats.weekly_goals_percentage,
        completed_weekly_goal_texts: stats.completed_weekly_goal_texts,
        weekly_goals_change_today: stats.weekly_goals_change_today,
        monthly_goals_total: stats.monthly_goals_total,
        monthly_goals_completed: stats.monthly_goals_completed,
        monthly_goals_percentage: stats.monthly_goals_percentage,
        monthly_goals_change_from_last_week: 0,
        completed_monthly_goal_texts: stats.completed_monthly_goal_texts,
        monthly_goals_change_today: stats.monthly_goals_change_today,
        overall_percentage: stats.overall_percentage,
        yesterday_overall_percentage: stats.yesterday_overall_percentage,
        improvement_percentage: stats.improvement_percentage,
        is_improvement: stats.is_improvement,
        has_complete_data: hasData,
        is_saved: false,
        weekly_missed_tasks: stats.weekly_missed_tasks,
        gym_days_this_week: stats.gym_days_this_week,
        gym_days_possible: stats.gym_days_possible,
      },
      { onConflict: 'user_id,week_end_date' }
    );

  if (upsertError) {
    throw new Error(`weekly_summaries upsert failed: ${upsertError.message}`);
  }

  console.log(
    `[DAILY-SUMMARY] Saved — user ${userId} | score: ${stats.nonnegotiables_percentage}% non-neg | ` +
    `gym: ${gymLoggedToday} | narrative: ${!!narrative}`
  );

  // ── 10. Push notification ─────────────────────────────────────────────────
  const { data: prefRow } = await supabase
    .schema('oasis')
    .from('notification_preferences')
    .select('weekly_summary_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  const summaryEnabled = prefRow ? prefRow.weekly_summary_enabled : true;

  if (summaryEnabled && hasData) {
    let pushBody = 'Your daily summary is ready.';
    try {
      const llm = getLLM();
      const pushPrompt = buildPushPrompt({
        nonnegCompleted: stats.nonnegotiables_completed,
        nonnegTotal: stats.nonnegotiables_total,
        gymLogged: gymLoggedToday,
        gymGroup,
        overallPct: stats.overall_percentage,
        isImprovement: stats.is_improvement,
        improvementPct: stats.improvement_percentage,
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

