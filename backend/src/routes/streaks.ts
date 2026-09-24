import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';

// Streaks: a clock the user names and starts, which counts until they stop
// it. Each run is one row in oasis.streaks (running while ended_at is null);
// restarting ends the current run and starts a new one under the same name.
// "Best" is the longest run ever recorded under that name (case-insensitive),
// the current one included.

const router = Router();
router.use(authenticateToken);

const nameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

interface StreakRow {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
}

const runSeconds = (row: StreakRow, now: number) =>
  Math.max(0, Math.floor(((row.ended_at ? Date.parse(row.ended_at) : now) - Date.parse(row.started_at)) / 1000));

async function loadRows(userId: string): Promise<StreakRow[]> {
  const { data, error } = await getSupabase()
    .schema('oasis')
    .from('streaks')
    .select('id, name, started_at, ended_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StreakRow[];
}

// Best run per name, in seconds (the running one counts up to now).
function bestByName(rows: StreakRow[], now: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    best.set(key, Math.max(best.get(key) ?? 0, runSeconds(row, now)));
  }
  return best;
}

const withBest = (row: StreakRow, best: Map<string, number>) => ({
  ...row,
  best_seconds: best.get(row.name.trim().toLowerCase()) ?? 0,
});

/**
 * GET /api/streaks
 * Running streaks (longest first) and past runs (most recent first).
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await loadRows(req.user!.id);
    const now = Date.now();
    const best = bestByName(rows, now);
    const active = rows
      .filter(r => !r.ended_at)
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
      .map(r => withBest(r, best));
    const past = rows
      .filter(r => r.ended_at)
      .sort((a, b) => Date.parse(b.ended_at!) - Date.parse(a.ended_at!))
      .map(r => withBest(r, best));
    res.json({ success: true, data: { active, past, server_time: new Date(now).toISOString() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/streaks  { name }
 * Start a new streak now.
 */
router.post('/', validate(nameSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await getSupabase()
      .schema('oasis')
      .from('streaks')
      .insert({ user_id: req.user!.id, name: req.body.name.trim() })
      .select('id, name, started_at, ended_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End a running streak; returns the ended row, or null if it wasn't running.
async function endRun(userId: string, id: string): Promise<StreakRow | null> {
  const { data, error } = await getSupabase()
    .schema('oasis')
    .from('streaks')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('ended_at', null)
    .select('id, name, started_at, ended_at')
    .maybeSingle();
  if (error) throw error;
  return (data as StreakRow) ?? null;
}

/**
 * POST /api/streaks/:id/stop
 * Stop the clock; the run stays in history.
 */
router.post('/:id/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const ended = await endRun(req.user!.id, req.params.id);
    if (!ended) {
      res.status(404).json({ success: false, error: 'Streak not found or already stopped' });
      return;
    }
    res.json({ success: true, data: ended });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/streaks/:id/restart
 * End the current run and start a fresh one under the same name.
 */
router.post('/:id/restart', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const ended = await endRun(userId, req.params.id);
    if (!ended) {
      res.status(404).json({ success: false, error: 'Streak not found or already stopped' });
      return;
    }
    const { data, error } = await getSupabase()
      .schema('oasis')
      .from('streaks')
      .insert({ user_id: userId, name: ended.name })
      .select('id, name, started_at, ended_at')
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/streaks/:id
 * Remove a run entirely (for mistakes).
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { error } = await getSupabase()
      .schema('oasis')
      .from('streaks')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
