import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getStorage } from '../services/oasisCore';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const createTaskSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(['non-negotiable', 'nice-to-have']),
  dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
});

const createGoalSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(['weekly', 'monthly']),
});

const toggleCompletionSchema = z.object({
  completed: z.boolean(),
});

const quoteInteractionSchema = z.object({
  interaction_type: z.enum(['like', 'dislike', 'none']),
});

// ============================================
// TASK ENDPOINTS (Daily, per-day tasks)
// ============================================

/**
 * POST /api/routine/tasks
 * Create a new task for a specific day
 */
router.post(
  '/tasks',
  validate(createTaskSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { text, type, dayOfWeek } = req.body;

      const storage = getStorage();
      const task = await storage.createRoutineTask(userId, text, type, dayOfWeek);

      res.status(201).json({
        success: true,
        data: task,
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
 * GET /api/routine/tasks/:day
 * Get all tasks for a specific day
 */
router.get('/tasks/:day', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { day } = req.params;

    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day.toLowerCase())) {
      res.status(400).json({
        success: false,
        error: 'Invalid day of week',
      });
      return;
    }

    const storage = getStorage();
    const tasks = await storage.getRoutineTasksForDay(userId, day.toLowerCase());

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PATCH /api/routine/tasks/:id
 * Toggle task completion
 */
router.patch(
  '/tasks/:id',
  validate(toggleCompletionSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { completed } = req.body;

      const storage = getStorage();
      const task = await storage.updateRoutineTaskCompletion(id, userId, completed);

      res.json({
        success: true,
        data: task,
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
 * DELETE /api/routine/tasks/:id
 * Delete a task
 */
router.delete('/tasks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const storage = getStorage();
    await storage.deleteRoutineTask(id, userId);

    res.json({
      success: true,
      message: 'Task deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// GOAL ENDPOINTS (Weekly/Monthly, shared)
// ============================================

/**
 * POST /api/routine/goals
 * Create a new goal (weekly or monthly)
 */
router.post(
  '/goals',
  validate(createGoalSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { text, type } = req.body;

      const storage = getStorage();
      const goal = await storage.createRoutineGoal(userId, text, type);

      res.status(201).json({
        success: true,
        data: goal,
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
 * GET /api/routine/goals/weekly
 * Get current week's goals
 */
router.get('/goals/weekly', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const storage = getStorage();
    const goals = await storage.getWeeklyGoals(userId);

    res.json({
      success: true,
      data: goals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/routine/goals/monthly
 * Get current month's goals
 */
router.get('/goals/monthly', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const storage = getStorage();
    const goals = await storage.getMonthlyGoals(userId);

    res.json({
      success: true,
      data: goals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PATCH /api/routine/goals/:id
 * Toggle goal completion
 */
router.patch(
  '/goals/:id',
  validate(toggleCompletionSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { completed } = req.body;

      const storage = getStorage();
      const goal = await storage.updateRoutineGoalCompletion(id, userId, completed);

      res.json({
        success: true,
        data: goal,
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
 * DELETE /api/routine/goals/:id
 * Delete a goal
 */
router.delete('/goals/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const storage = getStorage();
    await storage.deleteRoutineGoal(id, userId);

    res.json({
      success: true,
      message: 'Goal deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// QUOTE INTERACTION ENDPOINTS
// ============================================

/**
 * GET /api/routine/quotes/like-counts
 * Get like counts for all quotes
 */
router.get('/quotes/like-counts', async (req: Request, res: Response): Promise<void> => {
  try {
    const storage = getStorage();
    const likeCounts = await storage.getAllQuoteLikeCounts();

    res.json({
      success: true,
      data: likeCounts,
    });
  } catch (error: any) {
    console.error('[Quote Like Counts] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/routine/quotes/user-disliked
 * Get array of quote IDs the user has disliked
 */
router.get('/quotes/user-disliked', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const storage = getStorage();
    const dislikedQuoteIds = await storage.getUserDislikedQuotes(userId);

    res.json({
      success: true,
      data: dislikedQuoteIds,
    });
  } catch (error: any) {
    console.error('[User Disliked Quotes] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/routine/quotes/:quoteId/interact
 * Create or update user's interaction with a quote
 */
router.post(
  '/quotes/:quoteId/interact',
  validate(quoteInteractionSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const quoteId = parseInt(req.params.quoteId);
      const { interaction_type } = req.body;

      const storage = getStorage();

      // Upsert interaction
      await storage.upsertQuoteInteraction(userId, quoteId, interaction_type);

      // Get updated like count
      const likeCount = await storage.getQuoteLikeCount(quoteId);

      res.json({
        success: true,
        data: {
          quoteId,
          interaction_type,
          likeCount,
        },
      });
    } catch (error: any) {
      console.error('[Quote Interaction] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/routine/quotes/:quoteId/user-interaction
 * Get current user's interaction with a specific quote
 */
router.get('/quotes/:quoteId/user-interaction', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const quoteId = parseInt(req.params.quoteId);

    const storage = getStorage();
    const interaction = await storage.getUserQuoteInteraction(userId, quoteId);

    res.json({
      success: true,
      data: {
        quoteId,
        interaction_type: interaction || 'none',
      },
    });
  } catch (error: any) {
    console.error('[User Quote Interaction] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
