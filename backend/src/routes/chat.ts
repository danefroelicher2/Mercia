import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  getStorage,
  getLLM,
  getContextBuilder,
} from '../services/merciaCore';
import { getSupabase } from '../services/supabase';
import { buildMonthLog, buildYesterdayLog, getPreviousDateString } from '../lib/dailyChatContext';
import { getOrCreateDailyChat } from '../lib/dailyChatSession';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

function getLocalDateString(timezone?: string, date: Date = new Date()): string {
  if (!timezone) return date.toISOString().split('T')[0];
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

// Validation schemas
const newChatSchema = z.object({
  title: z.string().optional(),
});

const messageSchema = z.object({
  chatId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  timezone: z.string().optional(),
});

/**
 * POST /api/chat/new
 * Create new chat
 */
router.post(
  '/new',
  validate(newChatSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { title } = req.body;

      const storage = getStorage();
      const chat = await storage.createChat(userId, title);

      console.log(`[Chat] Created chat: ${chat.id}`);

      res.status(201).json({
        success: true,
        data: chat,
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
 * POST /api/chat/daily-outlook
 * Returns today's "Daily Outlook" chat, forward-looking and about today.
 * If one was already opened today, returns it as-is (no new LLM call) so the
 * conversation persists across app backgrounding/tab switches. Otherwise
 * creates it and has Mercia open with a message generated from the user's
 * this-month day-by-day log plus today's live stats. Resets at midnight —
 * tomorrow, no match is found and a fresh one is created.
 */
router.post('/daily-outlook', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone : undefined;
    const todayDateStr = getLocalDateString(timezone);
    const supabase = getSupabase();

    const { chat } = await getOrCreateDailyChat({
      userId,
      title: 'Daily Outlook',
      todayDateStr,
      timezone,
      supabase,
      storage: getStorage(),
      llm: getLLM(),
      getLocalDateString,
      buildSystemPrompt: async () => {
        // Yesterday is baked into the opener itself (no separate review chat in
        // the morning) — recap first, then pivot to today.
        const yesterdayDateStr = getPreviousDateString(todayDateStr);
        const [monthLog, yesterdayLog] = await Promise.all([
          buildMonthLog({ userId, todayDateStr, supabase }),
          buildYesterdayLog({ userId, yesterdayDateStr, supabase }),
        ]);
        return (
          'You are Mercia, a direct personal AI coach opening a "Daily Outlook" conversation with the user. ' +
          "Below is the user's day-by-day log for this month so far (oldest first), ending with today's live numbers:\n\n" +
          `${monthLog}\n\n` +
          "Yesterday specifically:\n" +
          `${yesterdayLog}\n\n` +
          'Write a short opening message: 4-6 sentences. Start with a one-sentence recap of yesterday — ' +
          'what went well or fell short, using its numbers. Then call out what stands out this month so far ' +
          '(a streak, a slump, a specific weak category), state where today stands right now, and end with ' +
          'one direct, specific thing to focus on today. Be concrete with numbers. No greeting, no filler, ' +
          'no generic encouragement, never use the word "navigate".'
        );
      },
    });

    res.status(201).json({ success: true, data: { chat } });
  } catch (error: any) {
    console.error('[Chat] Error creating daily outlook:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/day-in-review
 * Always creates a fresh review chat, regenerated every time it's opened
 * rather than cached through the day. Unlike /daily-outlook, this
 * deliberately does not persist: the Routine tab lets the user edit a past
 * day's task completions (e.g. cross something off for yesterday), which
 * changes the numbers this reads, so a cached review could go stale mid-day.
 * Recalculating every open guarantees it always reflects the latest data.
 *
 * Body scope (optional): 'yesterday' (default) reviews yesterday — the
 * original behavior. 'today' reviews the current day as it winds down —
 * the Home tab's evening "Close Out Today" card. All dates are computed in
 * the user's own timezone (sent by the client), so "today" flips at the
 * user's local midnight, not the server's.
 */
router.post('/day-in-review', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone : undefined;
    const scope: 'today' | 'yesterday' = req.body?.scope === 'today' ? 'today' : 'yesterday';
    const todayDateStr = getLocalDateString(timezone);
    const reviewDateStr = scope === 'today' ? todayDateStr : getPreviousDateString(todayDateStr);
    const supabase = getSupabase();

    const { chat } = await getOrCreateDailyChat({
      userId,
      title: scope === 'today' ? 'Close Out Today' : 'Day in Review',
      todayDateStr,
      timezone,
      supabase,
      storage: getStorage(),
      llm: getLLM(),
      getLocalDateString,
      alwaysCreateNew: true,
      buildSystemPrompt: async () => {
        // buildYesterdayLog reconstructs any date's numbers live, so it works
        // for today-in-progress just as well as for a completed yesterday.
        const reviewLog = await buildYesterdayLog({ userId, yesterdayDateStr: reviewDateStr, supabase });
        if (scope === 'today') {
          return (
            'You are Mercia, a direct personal AI coach opening a "Close Out Today" conversation with the user ' +
            "in the evening, looking back at today as it winds down. Here's today's numbers so far:\n\n" +
            `${reviewLog}\n\n` +
            'Write a short close-out: 3-5 sentences. Call out what got done and what fell short today, be ' +
            'specific with the numbers, flag anything still doable tonight, and end with one specific thing ' +
            'to set up for tomorrow. No greeting, no filler, no generic encouragement, never use the word "navigate".'
          );
        }
        return (
          'You are Mercia, a direct personal AI coach opening a "Day in Review" conversation with the user, ' +
          "looking back at yesterday specifically. Here's yesterday's numbers:\n\n" +
          `${reviewLog}\n\n` +
          'Write a short review: 3-5 sentences. Call out what went well and what fell short, be specific ' +
          'with the numbers, and note anything worth carrying into today. No greeting, no filler, ' +
          'no generic encouragement, never use the word "navigate".'
        );
      },
    });

    res.status(201).json({ success: true, data: { chat } });
  } catch (error: any) {
    console.error('[Chat] Error creating day in review:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/chat/list
 * Get user's chats
 */
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const storage = getStorage();
    const chats = await storage.getUserChats(userId, limit);

    res.json({
      success: true,
      data: chats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/chat/:chatId/messages
 * Get messages for a chat
 */
router.get(
  '/:chatId/messages',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const storage = getStorage();
      const messages = await storage.getChatMessages(chatId, limit);

      res.json({
        success: true,
        data: messages,
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
 * POST /api/chat/message
 * Send message in chat (get AI response)
 */
router.post(
  '/message',
  validate(messageSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { chatId, content, timezone } = req.body;

      const storage = getStorage();
      const llm = getLLM();
      const contextBuilder = getContextBuilder();

      const context = await contextBuilder.buildChatContext(userId, chatId);
      const userMessage = await storage.saveChatMessage(chatId, userId, 'user', content);

      // Get AI response
      const aiResponse = await llm.chat([
        { role: 'system', content: context.systemPrompt },
        ...context.conversationHistory.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        { role: 'user', content },
      ]);

      // Save AI response
      const assistantMessage = await storage.saveChatMessage(
        chatId,
        userId,
        'assistant',
        aiResponse
      );

      // Log activity for stats
      try {
        const supabase = getSupabase();
        const { error: logError } = await supabase
          .schema('oasis')
          .from('user_activity_log')
          .insert({
            user_id: userId,
            activity_type: 'ai_chat_sent',
            activity_date: getLocalDateString(timezone),
          });

        if (logError) {
          console.error('[Chat] FAILED to insert activity log:', logError);
        }
      } catch (err) {
        console.error('[Chat] Failed to log chat activity:', err);
      }

      res.json({
        success: true,
        data: {
          userMessage,
          assistantMessage,
        },
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
 * POST /api/chat/:chatId/pin
 * Pin a chat (max 5 pinned)
 */
router.post('/:chatId/pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { chatId } = req.params;

    const storage = getStorage();

    // Check how many chats are already pinned
    const allChats = await storage.getUserChats(userId);
    const pinnedCount = allChats.filter(c => c.pinned).length;

    if (pinnedCount >= 5) {
      res.status(400).json({
        success: false,
        error: 'Maximum 5 conversations can be pinned. Unpin one first.',
      });
      return;
    }

    // Pin the chat
    const updatedChat = await storage.pinChat(chatId);
    console.log(`[Chat] Pinned chat: ${chatId}`);

    res.json({
      success: true,
      data: updatedChat,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/:chatId/unpin
 * Unpin a chat
 */
router.post('/:chatId/unpin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const storage = getStorage();

    const updatedChat = await storage.unpinChat(chatId);
    console.log(`[Chat] Unpinned chat: ${chatId}`);

    res.json({
      success: true,
      data: updatedChat,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/chat/:chatId
 * Delete a chat and all its messages
 */
router.delete('/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { chatId } = req.params;

    const storage = getStorage();
    await storage.deleteChat(chatId, userId);
    console.log(`[Chat] Deleted chat: ${chatId}`);

    res.json({
      success: true,
      message: 'Chat deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
