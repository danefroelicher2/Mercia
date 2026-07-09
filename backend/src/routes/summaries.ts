import { Router, Request, Response } from 'express';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';

const router = Router();

// POST /api/summaries/trigger - Manually trigger daily summary generation
// (no auth — used by pg_cron pre-warm). This is the only route left in this
// file: the old "Yesterday's Summary" banner/modal/history UI that used to
// live here was removed in favor of the Home tab's Daily Outlook/Day in
// Review. runDailySummaryGeneration() itself — and the weekly_summaries table
// it writes to — stays, since Daily Outlook and Day in Review both read from
// it (see backend/src/lib/dailyChatContext.ts).
router.post('/trigger', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, message: 'Daily summary generation started' });
  runDailySummaryGeneration()
    .then(result => console.log('[Summaries] Trigger result:', result))
    .catch(err => console.error('[Summaries] Trigger error:', err));
});

export default router;
