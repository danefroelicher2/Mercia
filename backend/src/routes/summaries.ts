import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSupabase } from '../services/supabase';
import { runDailySummaryGeneration } from '../jobs/dailySummaryJob';

const router = Router();

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

// POST /api/summaries/trigger-generation - Manually trigger daily summary generation
router.post('/trigger-generation', async (req: Request, res: Response): Promise<void> => {
  try {
    // Run in background — respond immediately so the request doesn't time out
    runDailySummaryGeneration()
      .then((result) => console.log('[Summaries] Manual trigger complete:', result))
      .catch((err) => console.error('[Summaries] Manual trigger error:', err));

    res.json({ success: true, message: 'Daily summary generation started' });
  } catch (error: any) {
    console.error('[Summaries] Error triggering generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
