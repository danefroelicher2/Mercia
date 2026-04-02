import { CronJob } from 'cron';
import { getSupabase } from '../services/supabase';
import { sendPush } from '../services/pushNotifications';

// ============================================================
// INACTIVITY JOB
// Runs at 2:00 PM EST every day.
// Sends a nudge push to users who haven't opened the app
// in the past 24 hours and have inactivity_reminder_enabled.
// ============================================================

export function startInactivityJob(): CronJob {
  const job = new CronJob(
    '0 14 * * *',
    async () => {
      console.log('\n[INACTIVITY] ===========================');
      console.log('[INACTIVITY] Starting inactivity check');
      try {
        await runInactivityCheck();
      } catch (error) {
        console.error('[INACTIVITY] Unhandled error:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Inactivity job scheduled for 2:00 PM ET');
  return job;
}

export async function runInactivityCheck(): Promise<{ notified: number }> {
  const supabase = getSupabase();

  // Find users who haven't been active in >24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Only consider accounts created more than 48h ago — prevents pinging brand new users
  // who simply haven't triggered a /ping yet
  const accountAgeCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: inactiveUsers, error } = await supabase
    .schema('oasis')
    .from('user_profiles')
    .select('user_id, last_active_at, created_at')
    .lt('created_at', accountAgeCutoff)
    .or(`last_active_at.lt.${cutoff},last_active_at.is.null`);

  if (error) {
    console.error('[INACTIVITY] Failed to fetch inactive users:', error);
    return { notified: 0 };
  }

  if (!inactiveUsers || inactiveUsers.length === 0) {
    console.log('[INACTIVITY] No inactive users found');
    return { notified: 0 };
  }

  const userIds = inactiveUsers.map((u: any) => u.user_id as string);
  console.log(`[INACTIVITY] ${userIds.length} inactive users found`);

  // Filter to users with inactivity_reminder_enabled = true
  const { data: prefRows } = await supabase
    .schema('oasis')
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('inactivity_reminder_enabled', false);

  const optedOut = new Set((prefRows || []).map((r: any) => r.user_id as string));
  const toNotify = userIds.filter((id) => !optedOut.has(id));

  console.log(`[INACTIVITY] Notifying ${toNotify.length} users (${optedOut.size} opted out)`);

  let notified = 0;
  for (const userId of toNotify) {
    try {
      await sendPush(
        userId,
        'Mercia misses you',
        "You haven't checked in today — your streak is waiting.",
        { screen: 'MerciaHome' }
      );
      notified++;
    } catch (err) {
      console.error(`[INACTIVITY] Push failed for user ${userId}:`, err);
    }
  }

  console.log(`[INACTIVITY] Done — ${notified} pushes sent`);
  return { notified };
}
