import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getStorage } from '../services/merciaCore';

const router = Router();

router.use(authenticateToken);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const savePRSchema = z.object({
  muscleGroup: z.enum(['Chest', 'Back', 'Legs', 'Shoulders', 'Arms']),
  exerciseName: z.string().min(1).max(100),
  weight: z.number().positive(),
  reps: z.number().int().positive(),
});

const upsertLogSchema = z.object({
  dayOfWeek: z.enum(DAYS),
  workoutGroup: z.string().min(1).max(100),
  notes: z.string().max(5000),
});

function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * GET /api/gym/log/:dayOfWeek
 * Get log entry for a specific day in the current week
 */
router.get('/log/:dayOfWeek', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { dayOfWeek } = req.params;

    if (!DAYS.includes(dayOfWeek.toLowerCase() as any)) {
      res.status(400).json({ success: false, error: 'Invalid day of week' });
      return;
    }

    const now = new Date();
    const weekNumber = getISOWeek(now);
    const year = now.getFullYear();

    const storage = getStorage();
    const entry = await storage.getGymWorkoutLog(userId, dayOfWeek.toLowerCase(), weekNumber, year);

    res.json({ success: true, data: entry });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gym/log
 * Upsert a log entry
 */
router.post(
  '/log',
  validate(upsertLogSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { dayOfWeek, workoutGroup, notes } = req.body;

      const now = new Date();
      const weekNumber = getISOWeek(now);
      const year = now.getFullYear();

      const storage = getStorage();
      const entry = await storage.upsertGymWorkoutLog(userId, dayOfWeek, workoutGroup, notes, weekNumber, year);

      res.json({ success: true, data: entry });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/gym/week
 * Get all log entries for the current week
 */
router.get('/week', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const weekNumber = getISOWeek(now);
    const year = now.getFullYear();

    const storage = getStorage();
    const entries = await storage.getGymWorkoutLogForWeek(userId, weekNumber, year);

    res.json({ success: true, data: entries });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gym/memory
 * Get all gym memory groups
 */
router.get('/memory', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const storage = getStorage();
    const groups = await storage.getGymMemory(userId);
    res.json({ success: true, data: groups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gym/memory/:group
 * Get entries for a specific group
 */
router.get('/memory/:group', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { group } = req.params;
    const storage = getStorage();
    const entries = await storage.getGymMemoryByGroup(userId, decodeURIComponent(group));
    res.json({ success: true, data: entries });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/gym/memory/entry/:entryId
 * Delete a single memory entry by id
 */
router.delete('/memory/entry/:entryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { entryId } = req.params;
    const storage = getStorage();
    await storage.deleteGymMemoryEntry(userId, entryId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/gym/memory/:group
 * Delete a memory group
 */
router.delete('/memory/:group', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { group } = req.params;
    const storage = getStorage();
    await storage.deleteGymMemoryGroup(userId, decodeURIComponent(group));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/gym/prs
 * Get all PR entries grouped by muscle group
 */
router.get('/prs', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const storage = getStorage();
    const groups = await storage.getGymPRs(userId);
    res.json({ success: true, data: groups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/gym/prs
 * Create a new PR entry
 */
router.post(
  '/prs',
  validate(savePRSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { muscleGroup, exerciseName, weight, reps } = req.body;
      const storage = getStorage();
      const entry = await storage.saveGymPR(userId, muscleGroup, exerciseName, weight, reps);
      res.json({ success: true, data: entry });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * DELETE /api/gym/prs/entry/:entryId
 * Delete a single PR entry
 */
router.delete('/prs/entry/:entryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { entryId } = req.params;
    const storage = getStorage();
    await storage.deleteGymPREntry(userId, entryId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/gym/prs/:muscleGroup
 * Delete all PR entries for a muscle group
 */
router.delete('/prs/:muscleGroup', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { muscleGroup } = req.params;
    const storage = getStorage();
    await storage.deleteGymPRGroup(userId, decodeURIComponent(muscleGroup));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
