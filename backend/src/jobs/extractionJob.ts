import { CronJob } from 'cron';
import { getStorage } from '../services/merciaCore';

// ============================================
// WEEKLY RESET CRON JOB
// ============================================

/**
 * Weekly reset cron job
 * Runs every Monday at 12:00 AM (midnight)
 * Resets:
 * 1. All daily task completion statuses (fresh start)
 * 2. All weekly goal completions (uncheck, never delete)
 *
 * NOTE: Weekly summary generation is handled by Supabase pg_cron
 * (oasis.generate_weekly_summaries() runs before this reset via pg_cron schedule)
 */
export function startWeeklyResetCronJob(): CronJob {
  const job = new CronJob(
    '10 6 * * 1',  // Every Monday at 6:10 AM ET (after daily summary job reads Sunday's gym data)
    async () => {
      console.log('\n[CRON] ========================================');
      console.log('[CRON] Starting weekly reset job');
      console.log('[CRON] ========================================\n');

      try {
        await runWeeklyReset();

        console.log(`\n[CRON] ========================================`);
        console.log(`[CRON] Weekly reset completed`);
        console.log(`[CRON] ========================================\n`);
      } catch (error) {
        console.error('[CRON] ERROR in weekly reset job:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Weekly reset job scheduled for Mondays at 6:10 AM ET');

  return job;
}

async function runWeeklyReset(): Promise<void> {
  const storage = getStorage();

  // NOTE: Weekly summary generation is now handled by Supabase pg_cron
  // (oasis.generate_weekly_summaries() runs at Monday midnight via pg_cron,
  //  scheduled before this Node.js reset fires)

  console.log('[Reset] Updating weekly goals to current week...');
  await storage.updateWeeklyGoalsToCurrentWeek();

  console.log('[Reset] Resetting all daily task completion statuses...');
  await storage.resetAllTaskCompletions();

  console.log('[Reset] Resetting all weekly goal completion statuses...');
  await storage.resetAllWeeklyGoalCompletions();

  console.log('[Reset] Resetting gym workout logs...');
  await storage.resetGymWorkoutLogs();

  console.log('[Reset] Weekly reset complete');
}

/**
 * Monthly reset cron job
 * Runs on the 1st of every month at 12:00 AM (midnight)
 * Resets all monthly goal completions (uncheck, never delete)
 */
export function startMonthlyResetCronJob(): CronJob {
  const job = new CronJob(
    '0 0 1 * *',  // 1st day of every month at midnight
    async () => {
      console.log('\n[CRON] ========================================');
      console.log('[CRON] Starting monthly reset job');
      console.log('[CRON] ========================================\n');

      try {
        await runMonthlyReset();

        console.log(`\n[CRON] ========================================`);
        console.log(`[CRON] Monthly reset completed`);
        console.log(`[CRON] ========================================\n`);
      } catch (error) {
        console.error('[CRON] ERROR in monthly reset job:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Monthly reset job scheduled for 1st of month at 12:00 AM');

  return job;
}

async function runMonthlyReset(): Promise<void> {
  const storage = getStorage();

  console.log('[Reset] Updating monthly goals to current month...');
  await storage.updateMonthlyGoalsToCurrentMonth();

  console.log('[Reset] Resetting all monthly goal completion statuses...');
  await storage.resetAllMonthlyGoalCompletions();

  console.log('[Reset] Monthly reset complete');
}
