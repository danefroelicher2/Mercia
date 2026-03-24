import { CronJob } from 'cron';
import { getStorage, getLLM } from '../services/oasisCore';
import { ChatExtractor } from '@oasis/ai-core';

/**
 * Main extraction logic — callable manually or by pg_cron via Supabase.
 * The Node.js cron scheduling has been removed; scheduling is handled by
 * pg_cron on the Supabase side (5:00 AM UTC daily).
 */
export async function runDailyExtraction(): Promise<{
  usersProcessed: number;
  chatsAnalyzed: number;
  insightsExtracted: number;
  duration: number;
}> {
  const startTime = Date.now();
  const yesterday = getYesterday();

  console.log(`[Extraction] Processing chats from ${yesterday.toISOString().split('T')[0]}`);

  // Initialize extractor
  const storage = getStorage();
  const llm = getLLM();
  const extractor = new ChatExtractor(storage, llm);

  // Get all users who chatted yesterday
  const activeUsers = await getActiveUsersForDate(yesterday);
  console.log(`[Extraction] Found ${activeUsers.length} active users`);

  let totalChatsAnalyzed = 0;
  let totalInsightsExtracted = 0;
  let usersProcessed = 0;

  // Process each user
  for (const userId of activeUsers) {
    try {
      const result = await extractor.processUserChats(userId, yesterday);

      totalChatsAnalyzed += result.chatsAnalyzed;
      totalInsightsExtracted += result.insightsExtracted;
      usersProcessed++;

    } catch (error) {
      console.error(`[Extraction] Error processing user ${userId}:`, error);
      // Continue with next user - don't fail entire batch
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`[Extraction] Summary:`);
  console.log(`  - Users processed: ${usersProcessed}/${activeUsers.length}`);
  console.log(`  - Chats analyzed: ${totalChatsAnalyzed}`);
  console.log(`  - Insights extracted: ${totalInsightsExtracted}`);
  console.log(`  - Duration: ${duration}s`);

  // Log to database
  await saveJobLog(yesterday, {
    usersProcessed,
    chatsAnalyzed: totalChatsAnalyzed,
    insightsExtracted: totalInsightsExtracted,
    duration,
    status: 'completed',
  });

  return {
    usersProcessed,
    chatsAnalyzed: totalChatsAnalyzed,
    insightsExtracted: totalInsightsExtracted,
    duration,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getYesterday(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getActiveUsersForDate(date: Date): Promise<string[]> {
  const storage = getStorage();

  // Get all chats updated on the target date by querying all users' chats
  // This is a simplified approach - for production scale, you'd add a
  // dedicated StorageAdapter method: storage.getActiveUsersForDate(date)
  //
  // TODO: Implement storage.getActiveUsersForDate(date) for better performance
  // For now, this returns empty array - the manual trigger endpoint can be used
  // to test individual user extraction via processUserChats directly
  console.log('[Extraction] getActiveUsersForDate - TODO: implement dedicated query');
  console.log('[Extraction] For now, use POST /api/extraction/trigger to test manually');
  return [];
}

async function saveJobLog(date: Date, stats: any): Promise<void> {
  // TODO: Save to extraction_job_log table via StorageAdapter
  console.log(`[Extraction] Job log: ${JSON.stringify(stats)}`);
}

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
    '0 0 * * 1',  // Every Monday at midnight
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

  console.log('[CRON] Weekly reset job scheduled for Mondays at 12:00 AM');

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
