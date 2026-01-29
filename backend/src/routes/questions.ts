import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getQuestionEngine, getMemoryManager } from '../services/oasisCore';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const answerSchema = z.object({
  questionId: z.string().uuid(),
  responseText: z.string().min(10).max(5000),
});

const skipSchema = z.object({
  questionId: z.string().uuid(),
});

/**
 * GET /api/questions/daily
 * Get today's question for authenticated user
 */
router.get('/daily', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const questionEngine = getQuestionEngine();

    const question = await questionEngine.getTodaysQuestion(userId);

    if (!question) {
      res.json({
        success: true,
        data: null,
        message: 'All questions answered! Come back tomorrow.',
      });
      return;
    }

    res.json({
      success: true,
      data: question,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/questions/answer
 * Submit answer to a question
 */
router.post(
  '/answer',
  validate(answerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { questionId, responseText } = req.body;

      const questionEngine = getQuestionEngine();
      const memoryManager = getMemoryManager();

      // Save answer
      const response = await questionEngine.submitAnswer(
        userId,
        questionId,
        responseText
      );
      // Process response to update memory profile (synchronous for debugging)
      try {
        await memoryManager.processQuestionResponse(userId, response);
        console.log('✅ Memory profile updated successfully');
      } catch (err) {
        console.error('❌ Failed to process response:', err);
      }
      // Get updated progress
      const progress = await questionEngine.getProgress(userId);

      res.json({
        success: true,
        message: 'Answer saved successfully',
        data: {
          response,
          progress,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/questions/skip
 * Skip today's question
 */
router.post(
  '/skip',
  validate(skipSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { questionId } = req.body;

      const questionEngine = getQuestionEngine();
      await questionEngine.skipQuestion(userId, questionId);

      res.json({
        success: true,
        message: 'Question skipped',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/questions/progress
 * Get user's question answering progress
 */
router.get('/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const questionEngine = getQuestionEngine();

    const progress = await questionEngine.getProgress(userId);

    res.json({
      success: true,
      data: progress,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/questions/history
 * Get user's answered questions history
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const questionEngine = getQuestionEngine();
    const history = await questionEngine.getHistory(userId, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
