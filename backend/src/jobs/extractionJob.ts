import { CronJob } from 'cron';
import { getStorage, getLLM } from '../services/oasisCore';
import { ChatExtractor } from '@oasis/ai-core';

/**
 * Daily chat extraction cron job
 * Runs at 3:00 AM every day
 * Processes yesterday's chats for all active users
 */
export function startExtractionCronJob(): CronJob {
  const job = new CronJob(
    '0 3 * * *',  // 3:00 AM daily (cron syntax: minute hour day month dayOfWeek)
    async () => {
      console.log('\n[CRON] ========================================');
      console.log('[CRON] Starting daily chat extraction job');
      console.log('[CRON] ========================================\n');

      const startTime = Date.now();

      try {
        await runDailyExtraction();

        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n[CRON] ========================================`);
        console.log(`[CRON] Extraction job completed in ${duration}s`);
        console.log(`[CRON] ========================================\n`);
      } catch (error) {
        console.error('[CRON] FATAL ERROR in extraction job:', error);
      }
    },
    null,      // onComplete callback
    true,      // Start immediately
    'America/New_York'  // Timezone (adjust as needed)
  );

  console.log('[CRON] Daily extraction job scheduled for 3:00 AM');

  return job;
}

/**
 * Main extraction logic (can be called by cron or manual trigger)
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
