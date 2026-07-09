import { CronJob } from 'cron';
import { getSupabase } from '../services/supabase';
import {
  computeSummaryStats,
  getYesterdayDateString,
  getDayOfWeekForDate,
} from '../lib/summaryCompute';

// ============================================
// DAILY SUMMARY JOB
// Runs at 6:00 AM EST every day. Reads task_completion_history for yesterday,
// computes stats, and upserts into weekly_summaries. This is purely a data
// pipeline now — the old push notification and narrative generation it used
// to also do were removed along with the "Yesterday's Summary" UI they fed;
// Daily Outlook and Day in Review (backend/src/lib/dailyChatContext.ts) read
// straight from weekly_summaries/task_completion_history instead.
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
  const hasData = stats.has_complete_data;

  // ── 8. Upsert into weekly_summaries ───────────────────────────────────────
  const { error: upsertError } = await supabase
    .schema('oasis')
    .from('weekly_summaries')
    .upsert(
      {
        user_id: userId,
        week_start_date: stats.week_start_date,
        week_end_date: date,
        today_completed: stats.today_completed,
        today_total: stats.today_total,
        today_percentage: stats.today_percentage,
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
    `[DAILY-SUMMARY] Saved — user ${userId} | score: ${stats.today_percentage}% today`
  );
}
