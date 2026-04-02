import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getQuestionEngine, getMemoryManager } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

function getLocalDateString(timezone?: string): string {
  const now = new Date();
  if (!timezone) return now.toISOString().split('T')[0];
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().split('T')[0];
  }
}

// Validation schemas
const answerSchema = z.object({
  questionId: z.string().uuid(),
  responseText: z.string().min(10).max(5000),
  timezone: z.string().optional(),
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
      const { questionId, responseText, timezone } = req.body;

      const questionEngine = getQuestionEngine();
      const memoryManager = getMemoryManager();

      // Save answer
      const response = await questionEngine.submitAnswer(
        userId,
        questionId,
        responseText
      );
      // Process response to update memory profile (synchronous for debugging)
      let questionLevel = 1;
      try {
        const updatedProfile = await memoryManager.processQuestionResponse(userId, response);
        questionLevel = updatedProfile.question_level || 1;
        console.log('✅ Memory profile updated successfully');
      } catch (err) {
        console.error('❌ Failed to process response:', err);
      }
      // Get updated progress
      const progress = await questionEngine.getProgress(userId);

      // Log activity for stats AND check for achievement unlocks
      try {
        const supabase = getSupabase();

        console.log('[Questions] Inserting activity log for user:', userId);
        // Log the activity
        const { error: logError } = await supabase
          .schema('oasis')
          .from('user_activity_log')
          .insert({
            user_id: userId,
            activity_type: 'question_answered',
            activity_date: getLocalDateString(timezone),
          });

        if (logError) {
          console.error('[Questions] FAILED to insert activity log:', logError);
        } else {
          console.log('[Questions] Activity log inserted successfully');
        }

        // Check and unlock achievements
        try {
          console.log('[Questions] Checking achievements for user:', userId);
          const { checkAndUnlockAchievements } = require('./stats');
          const newAchievements = await checkAndUnlockAchievements(userId, supabase);

          if (newAchievements.length > 0) {
            console.log('🏆 New achievements unlocked:', newAchievements.map((a: any) => a.title).join(', '));
          } else {
            console.log('[Questions] No new achievements unlocked');
          }
        } catch (achievementError) {
          console.error('[Questions] ERROR checking achievements:', achievementError);
        }
      } catch (err) {
        console.error('Failed to log question activity:', err);
      }

      res.json({
        success: true,
        message: 'Answer saved successfully',
        data: {
          response,
          progress,
          can_continue: questionLevel <= 3,
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
