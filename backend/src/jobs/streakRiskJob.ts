import { CronJob } from 'cron';
import { getSupabase } from '../services/supabase';
import { sendPush } from '../services/pushNotifications';

// ============================================================
// STREAK RISK JOB
// Runs at 7:00 PM EST every day.
// Sends an alert to users who have an active streak but
// haven't completed any tasks today and have
// streak_at_risk_enabled.
// ============================================================

export function startStreakRiskJob(): CronJob {
  const job = new CronJob(
    '0 19 * * *',
    async () => {
      console.log('\n[STREAK-RISK] ===========================');
      console.log('[STREAK-RISK] Starting streak risk check');
      try {
        await runStreakRiskCheck();
      } catch (error) {
        console.error('[STREAK-RISK] Unhandled error:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Streak risk job scheduled for 7:00 PM ET');
  return job;
}

export async function runStreakRiskCheck(): Promise<{ notified: number }> {
  const supabase = getSupabase();
  const today = getTodayDateString();

  // Find users with a current streak > 0
  // Use the existing get_current_streak RPC — but we need to query in bulk.
  // Approach: find users who completed at least one task YESTERDAY but not today.
  const yesterday = getYesterdayDateString();

  // Users active yesterday (have a streak)
  const { data: activeYesterday } = await supabase
    .schema('oasis')
    .from('task_completion_history')
    .select('user_id')
    .eq('snapshot_date', yesterday)
    .eq('completed', true);

  if (!activeYesterday || activeYesterday.length === 0) {
    console.log('[STREAK-RISK] No users with activity yesterday');
    return { notified: 0 };
  }

  const streakUserIds = [...new Set(activeYesterday.map((r: any) => r.user_id as string))];

  // Of those, find who has NOT completed anything today yet
  const { data: completedToday } = await supabase
    .schema('oasis')
    .from('task_completion_history')
    .select('user_id')
    .eq('snapshot_date', today)
    .eq('completed', true)
    .in('user_id', streakUserIds);

  const doneToday = new Set((completedToday || []).map((r: any) => r.user_id as string));
  const atRisk = streakUserIds.filter((id) => !doneToday.has(id));

  if (atRisk.length === 0) {
    console.log('[STREAK-RISK] No users at risk today');
    return { notified: 0 };
  }

  console.log(`[STREAK-RISK] ${atRisk.length} users at risk`);

  // Filter out users who opted out
  const { data: prefRows } = await supabase
    .schema('oasis')
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', atRisk)
    .eq('streak_at_risk_enabled', false);

  const optedOut = new Set((prefRows || []).map((r: any) => r.user_id as string));
  const toNotify = atRisk.filter((id) => !optedOut.has(id));

  console.log(`[STREAK-RISK] Notifying ${toNotify.length} users (${optedOut.size} opted out)`);

  let notified = 0;
  for (const userId of toNotify) {
    try {
      await sendPush(
        userId,
        'Streak at risk',
        "Complete at least one task today to keep your streak alive.",
        { screen: 'Routine' }
      );
      notified++;
    } catch (err) {
      console.error(`[STREAK-RISK] Push failed for user ${userId}:`, err);
    }
  }

  console.log(`[STREAK-RISK] Done — ${notified} pushes sent`);
  return { notified };
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
