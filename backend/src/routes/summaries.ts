import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSupabase } from '../services/supabase';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';
import { computeSummaryStats, getYesterdayDateString } from '../lib/summaryCompute';

const router = Router();

// POST /api/summaries/trigger - Manually trigger daily summary generation (no auth — used by pg_cron pre-warm)
router.post('/trigger', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, message: 'Daily summary generation started' });
  runDailySummaryGeneration()
    .then(result => console.log('[Summaries] Trigger result:', result))
    .catch(err => console.error('[Summaries] Trigger error:', err));
});

router.use(authenticateToken);

// GET /api/summaries/current - Returns the most recent weekly summary
router.get('/current', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('week_end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: data || null });
  } catch (error: any) {
    console.error('[Summaries] Error fetching current:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/summaries/live - Compute yesterday's stats live from current DB state (no save, no Groq)
router.get('/live', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();
    const yesterday = getYesterdayDateString();

    const stats = await computeSummaryStats(userId, yesterday, supabase);

    const liveSummary = {
      id: 'live',
      user_id: userId,
      is_saved: false,
      created_at: new Date().toISOString(),
      ...stats,
    };

    res.json({ success: true, data: liveSummary });
  } catch (error: any) {
    console.error('[Summaries] Error computing live summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/summaries/history - Returns all saved summaries
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select('*')
      .eq('user_id', userId)
      .eq('is_saved', true)
      .order('week_end_date', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('[Summaries] Error fetching history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/summaries/cleanup-old - Delete unsaved summaries older than 14 days
router.delete('/cleanup-old', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoff = fourteenDaysAgo.toISOString().split('T')[0];

    const { error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .delete()
      .eq('user_id', userId)
      .eq('is_saved', false)
      .lt('week_start_date', cutoff);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Summaries] Error cleaning up old summaries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/summaries/:id/save - Mark a summary as saved
router.patch('/:id/save', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .update({ is_saved: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Summaries] Error saving:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/summaries/:id - Delete a saved summary
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const supabase = getSupabase();

    const { error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Summaries] Error deleting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
