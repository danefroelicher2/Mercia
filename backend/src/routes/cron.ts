import { Router, Request, Response } from 'express';
import { authenticateCronSecret } from '../middleware/auth';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';
import { runInactivityCheck } from '../jobs/inactivityJob';
import { runStreakRiskCheck } from '../jobs/streakRiskJob';
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

router.post('/inactivity', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'inactivity check started' });
  runInactivityCheck().catch((err) =>
    console.error('[CRON-TRIGGER] inactivity failed:', err)
  );
});

router.post('/streak-risk', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'streak-risk check started' });
  runStreakRiskCheck().catch((err) =>
    console.error('[CRON-TRIGGER] streak-risk failed:', err)
  );
});

router.post('/routine-day-log', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'routine-day-log started' });
  runRoutineDayLog().catch((err) =>
    console.error('[CRON-TRIGGER] routine-day-log failed:', err)
  );
});

export default router;
