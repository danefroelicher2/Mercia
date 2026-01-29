import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getMemoryManager } from '../services/oasisCore';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/memory/profile
 * Get user's memory profile
 */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const memoryManager = getMemoryManager();

    const profile = await memoryManager.getProfile(userId);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/memory/summary
 * Get compact profile summary (for AI context)
 */
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const memoryManager = getMemoryManager();

    const summary = await memoryManager.getProfileSummary(userId);

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/memory/feedback
 * Update profile based on user feedback
 */
router.post('/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const updates = req.body;

    const memoryManager = getMemoryManager();
    const profile = await memoryManager.updateFromFeedback(userId, updates);

    res.json({
      success: true,
      message: 'Profile updated',
      data: profile,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
