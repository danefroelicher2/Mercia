import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  getStorage,
  getLLM,
  getContextBuilder,
} from '../services/oasisCore';

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

export default router;
