import { Router, Request, Response } from 'express';
import { authenticateCronSecret } from '../middleware/auth';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';
import { runMemoryCondensationJob } from '../jobs/memoryCondensationJob';
import { runInactivityCheck } from '../jobs/inactivityJob';
import { runStreakRiskCheck } from '../jobs/streakRiskJob';
import { runWeeklyRoutineSnapshot } from '../jobs/weeklyRoutineSnapshotJob';

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

router.post('/memory-condensation', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'memory-condensation started' });
  runMemoryCondensationJob().catch((err) =>
    console.error('[CRON-TRIGGER] memory-condensation failed:', err)
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

router.post('/weekly-routine-snapshot', (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'weekly-routine-snapshot started' });
  runWeeklyRoutineSnapshot().catch((err) =>
    console.error('[CRON-TRIGGER] weekly-routine-snapshot failed:', err)
  );
});

export default router;
