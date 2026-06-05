import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getStorage } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';

const notepadSchema = z.object({
  content: z.string().max(10000),
});

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
const createTaskSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(['non-negotiable', 'nice-to-have']),
  dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
});

const createGoalSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(['weekly', 'monthly', 'yearly']),
});

const toggleCompletionSchema = z.object({
  completed: z.boolean(),
  timezone: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const toggleGoalSchema = z.object({
  completed: z.boolean(),
  timezone: z.string().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)),
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
 * PATCH /api/routine/tasks/reorder
 * Reorder tasks by providing an ordered array of IDs
 */
router.patch(
  '/tasks/reorder',
  validate(reorderSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('[Routine] Reorder request body:', JSON.stringify(req.body));
      const userId = req.user!.id;
      const { ids } = req.body;

      const storage = getStorage();
      await storage.reorderRoutineTasks(userId, ids);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

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
      const { completed, timezone, date } = req.body;
      const today = getLocalDateString(timezone);

      if (date && date > today) {
        res.status(400).json({ success: false, error: 'Cannot log activity for a future date' });
        return;
      }

      const activityDate = date ?? today;

      const storage = getStorage();
      const task = await storage.updateRoutineTaskCompletion(id, userId, completed);

      // Log activity for stats AND check achievements (only if marking as completed)
      if (completed === true) {
        try {
          const supabase = getSupabase();

          console.log('[Routine] Inserting activity log for task completion, user:', userId);
          const { error: logError } = await supabase
            .schema('oasis')
            .from('user_activity_log')
            .insert({
              user_id: userId,
              activity_type: 'task_completed',
              activity_date: activityDate,
            });

          if (logError) {
            console.error('[Routine] FAILED to insert task activity log:', logError);
          } else {
            console.log('[Routine] Task activity log inserted successfully');
          }

          // Fire-and-forget: check achievements without blocking the response
          const { checkAndUnlockAchievements } = require('./stats');
          checkAndUnlockAchievements(userId, supabase)
            .then((unlocked: any[]) => {
              if (unlocked.length > 0) {
                console.log('🏆 New achievements unlocked:', unlocked.map((a: any) => a.title).join(', '));
              }
            })
            .catch((err: any) => console.error('[Routine] Achievement check failed:', err));

          // Fire-and-forget: write completion history for daily summary generation
          supabase
            .schema('oasis')
            .from('task_completion_history')
            .upsert(
              {
                user_id: userId,
                task_id: task.id,
                task_text: task.text,
                task_type: task.type,
                day_of_week: task.day_of_week,
                completed: true,
                snapshot_date: activityDate,
              },
              { onConflict: 'user_id,task_id,snapshot_date' }
            )
            .then(({ error }) => {
              if (error) console.error('[Routine] task_completion_history upsert failed:', error);
            });
        } catch (err) {
          console.error('Failed to log task activity or check achievements:', err);
        }
      } else {
        // Fire-and-forget: remove history entry when task is unchecked
        const supabase = getSupabase();
        supabase
          .schema('oasis')
          .from('task_completion_history')
          .delete()
          .eq('user_id', userId)
          .eq('task_id', task.id)
          .eq('snapshot_date', activityDate)
          .then(({ error }) => {
            if (error) console.error('[Routine] task_completion_history delete failed:', error);
          });
      }

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

    res.json({ success: true, message: 'Task deleted' });

    // Fire-and-forget: clean up orphaned records for the deleted task
    const supabase = getSupabase();

    // Remove completion history for this task
    supabase
      .schema('oasis')
      .from('task_completion_history')
      .delete()
      .eq('user_id', userId)
      .eq('task_id', id)
      .then(({ error }) => {
        if (error) console.error('[Routine] task_completion_history cleanup failed:', error);
      });

    // Remove deleted task from tasks_missed_frequently in any stored summaries
    supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select('id, tasks_missed_frequently')
      .eq('user_id', userId)
      .not('tasks_missed_frequently', 'is', null)
      .then(async ({ data: summaries, error }) => {
        if (error || !summaries) return;
        for (const summary of summaries) {
          const missed = summary.tasks_missed_frequently as any[];
          if (!Array.isArray(missed) || missed.length === 0) continue;
          const filtered = missed.filter((m: any) => m.task_id !== id);
          if (filtered.length !== missed.length) {
            await supabase
              .schema('oasis')
              .from('weekly_summaries')
              .update({ tasks_missed_frequently: filtered })
              .eq('id', summary.id);
          }
        }
      });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
 * GET /api/routine/goals/yearly
 * Get all yearly goals (no reset — persist indefinitely)
 */
router.get('/goals/yearly', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const storage = getStorage();
    const goals = await storage.getYearlyGoals(userId);
    res.json({ success: true, data: goals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/routine/goals/reorder
 * Reorder goals by providing an ordered array of IDs
 */
router.patch(
  '/goals/reorder',
  validate(reorderSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { ids } = req.body;

      const storage = getStorage();
      await storage.reorderRoutineGoals(userId, ids);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PATCH /api/routine/goals/:id
 * Toggle goal completion
 */
router.patch(
  '/goals/:id',
  validate(toggleGoalSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { completed, timezone } = req.body;

      const storage = getStorage();
      const goal = await storage.updateRoutineGoalCompletion(id, userId, completed);

      // Log activity for stats AND check achievements (only if marking as completed)
      if (completed === true) {
        try {
          const supabase = getSupabase();

          console.log('[Routine] Inserting activity log for goal completion, user:', userId);
          // Log the activity
          const { error: logError } = await supabase
            .schema('oasis')
            .from('user_activity_log')
            .insert({
              user_id: userId,
              activity_type: 'goal_completed',
              activity_date: getLocalDateString(timezone),
            });

          if (logError) {
            console.error('[Routine] FAILED to insert goal activity log:', logError);
          } else {
            console.log('[Routine] Goal activity log inserted successfully');
          }

          // Fire-and-forget: check achievements without blocking the response
          const { checkAndUnlockAchievements } = require('./stats');
          checkAndUnlockAchievements(userId, supabase)
            .then((unlocked: any[]) => {
              if (unlocked.length > 0) {
                console.log('🏆 New achievements unlocked:', unlocked.map((a: any) => a.title).join(', '));
              }
            })
            .catch((err: any) => console.error('[Routine] Achievement check failed:', err));
        } catch (err) {
          console.error('Failed to log goal activity or check achievements:', err);
        }
      }

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

// ============================================
// NOTEPAD ENDPOINTS
// ============================================

/**
 * GET /api/routine/notepad
 * Fetch the user's persistent notepad content
 */
router.get('/notepad', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .schema('oasis')
      .from('routine_notepad')
      .select('content')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: { content: data?.content ?? '' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/routine/notepad
 * Upsert the user's notepad content
 */
router.put(
  '/notepad',
  validate(notepadSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { content } = req.body;
      const supabase = getSupabase();

      const { error } = await supabase
        .schema('oasis')
        .from('routine_notepad')
        .upsert({ user_id: userId, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

      if (error) throw error;

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ============================================
// SUMMARY DATA ENDPOINT
// ============================================

/**
 * GET /api/routine/summary-data
 * Returns the current week's (Mon → today) Today item completion stats.
 * "Today items" = non-negotiable tasks.
 */
router.get('/summary-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const todayStr = new Date().toISOString().split('T')[0];
    const weekDates = getWeekDatesUpToToday(todayStr);

    const [{ data: allTasks, error: tasksError }, { data: completions, error: compError }] =
      await Promise.all([
        supabase
          .schema('oasis')
          .from('routine_tasks')
          .select('id, day_of_week')
          .eq('user_id', userId)
          .eq('type', 'non-negotiable'),
        supabase
          .schema('oasis')
          .from('task_completion_history')
          .select('task_id, snapshot_date')
          .eq('user_id', userId)
          .in('snapshot_date', weekDates)
          .eq('completed', true),
      ]);

    if (tasksError) throw tasksError;
    if (compError) throw compError;

    const completedSet = new Set(
      (completions || []).map((c: any) => `${c.task_id}::${c.snapshot_date}`)
    );

    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let totalPossible = 0;
    let totalCompleted = 0;

    for (const dateStr of weekDates) {
      const d = new Date(dateStr + 'T12:00:00Z');
      const dowName = DAY_NAMES[d.getUTCDay()];
      const tasksForDay = (allTasks || []).filter((t: any) => t.day_of_week === dowName);
      totalPossible += tasksForDay.length;
      for (const task of tasksForDay as any[]) {
        if (completedSet.has(`${task.id}::${dateStr}`)) {
          totalCompleted++;
        }
      }
    }

    const percentage = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    res.json({
      success: true,
      data: {
        total_possible: totalPossible,
        total_completed: totalCompleted,
        percentage,
        week_start: weekDates[0] ?? todayStr,
        week_end: weekDates[weekDates.length - 1] ?? todayStr,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Returns all dates from Monday of the current week through today (inclusive)
function getWeekDatesUpToToday(todayStr: string): string[] {
  const end = new Date(todayStr + 'T12:00:00Z');
  const utcDay = end.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
  const dates: string[] = [];
  for (let i = daysFromMonday; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default router;
