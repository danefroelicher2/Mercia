import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { runDailyExtraction } from '../jobs/extractionJob';

const router = Router();

/**
 * POST /api/extraction/trigger
 * Manually trigger extraction job (for testing)
 * Requires authentication
 */
router.post('/trigger', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`[API] Manual extraction triggered by user ${req.user!.id}`);

    // Run extraction in background
    runDailyExtraction()
      .then(result => {
        console.log('[API] Manual extraction completed:', result);
      })
      .catch(error => {
        console.error('[API] Manual extraction failed:', error);
      });

    res.json({
      success: true,
      message: 'Extraction job started in background',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
