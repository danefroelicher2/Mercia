import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  getStorage,
  getLLM,
  getContextBuilder,
} from '../services/oasisCore';
import { getSupabase } from '../services/supabase';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const newChatSchema = z.object({
  title: z.string().optional(),
  chatType: z.enum(['question', 'general']).optional(),
  linkedQuestionId: z.string().uuid().optional(),
});

const messageSchema = z.object({
  chatId: z.string().uuid(),
  content: z.string().min(1).max(10000),
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
      const { title, chatType, linkedQuestionId } = req.body;

      const storage = getStorage();
      const chat = await storage.createChat(
        userId,
        title,
        chatType || 'general',
        linkedQuestionId || null
      );

      console.log(`[Chat] Created ${chatType || 'general'} chat: ${chat.id}${linkedQuestionId ? ` (linked to question: ${linkedQuestionId})` : ''}`);

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
      const { chatId, content } = req.body;

      const storage = getStorage();
      const llm = getLLM();
      const contextBuilder = getContextBuilder();

      // Save user message
      const userMessage = await storage.saveChatMessage(
        chatId,
        userId,
        'user',
        content
      );

      // Build context with memory profile
      const context = await contextBuilder.buildChatContext(userId, chatId);

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
        await supabase
          .schema('oasis')
          .from('user_activity_log')
          .insert({
            user_id: userId,
            activity_type: 'ai_chat_sent',
            activity_date: new Date().toISOString().split('T')[0],
          });
      } catch (err) {
        console.error('Failed to log chat activity:', err);
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
