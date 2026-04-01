import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getMemoryManager } from '../services/merciaCore';
import { MEMORY_CAPS } from '@mercia/ai-core';
import { runCondensationForUser } from '../jobs/memoryCondensationJob';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/memory/profile
 * Get user's memory profile (pending_insights is never sent to the client).
 */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const memoryManager = getMemoryManager();
    const profile = await memoryManager.getProfile(userId);

    // Strip server-only fields before returning
    const { pending_insights: _pending, ...clientProfile } = profile as any;

    res.json({
      success: true,
      data: {
        ...clientProfile,
        question_facts_count: profile.question_facts_count ?? 0,
        conversation_facts_count: profile.conversation_facts_count ?? 0,
        question_facts_completeness: profile.question_facts_completeness ?? 0,
        conversation_facts_completeness: profile.conversation_facts_completeness ?? 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/insights
 * Return insights_metadata grouped by source_type with pool counts and caps.
 * pending_insights is never included in this response.
 */
router.get('/insights', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const memoryManager = getMemoryManager();
    const profile = await memoryManager.getProfile(userId);

    const committed = (profile.insights_metadata || []) as any[];
    const from_questions = committed.filter((e: any) => e.source_type === 'question');
    const from_conversations = committed.filter((e: any) => e.source_type === 'conversation');

    res.json({
      success: true,
      data: {
        from_questions,
        from_conversations,
        question_facts_count: from_questions.length,
        question_facts_max: MEMORY_CAPS.QUESTION_FACTS_MAX,
        conversation_facts_count: from_conversations.length,
        conversation_facts_max: MEMORY_CAPS.CONVERSATION_FACTS_MAX,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/summary
 * Get compact profile summary (for AI context).
 */
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const memoryManager = getMemoryManager();
    const summary = await memoryManager.getProfileSummary(userId);

    res.json({ success: true, data: { summary } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/feedback
 * Update profile based on user feedback / corrections.
 */
router.post('/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const updates = req.body;
    const memoryManager = getMemoryManager();
    const profile = await memoryManager.updateFromFeedback(userId, updates);

    const { pending_insights: _pending, ...clientProfile } = profile as any;

    res.json({ success: true, message: 'Profile updated', data: clientProfile });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/trigger-condensation
 * Manually triggers memory condensation for the authenticated user. Dev/testing use.
 */
router.post('/trigger-condensation', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await runCondensationForUser(userId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[memory/trigger-condensation] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

