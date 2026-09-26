import { Router, Request, Response } from 'express';
import { authenticateCronSecret } from '../middleware/auth';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';
import { runNotifications } from '../jobs/notificationsJob';
import { runRoutineDayLog } from '../lib/routineYear';

const router = Router();

// All cron trigger endpoints require the shared CRON_SECRET header
router.use(authenticateCronSecret);

// Respond immediately so pg_net does not time out waiting for the job to finish.
// Each job runs in the background after the response is sent.

router.post('/daily-summary', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'daily-summary started' });
  runDailySummaryGeneration().catch((err) =>
    console.error('[CRON-TRIGGER] daily-summary failed:', err)
  );
});

// Reminders (every 15 min). The Streak-at-risk and Inactivity pushes that
// used to run on fixed Eastern times are part of this now.
router.post('/notifications', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'notifications started' });
  runNotifications().catch((err) =>
    console.error('[CRON-TRIGGER] notifications failed:', err)
  );
});

// What would be sent right now, without sending (for testing).
router.post('/notifications/dry-run', async (req: Request, res: Response): Promise<void> => {
  try {
    const at = typeof req.query.at === 'string' ? new Date(req.query.at) : undefined;
    res.json({ success: true, data: await runNotifications({ dryRun: true, now: at && !isNaN(at.getTime()) ? at : undefined }) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/routine-day-log', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'routine-day-log started' });
  runRoutineDayLog().catch((err) =>
    console.error('[CRON-TRIGGER] routine-day-log failed:', err)
  );
});

export default router;
