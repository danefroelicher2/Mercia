import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  getStorage,
  getLLM,
  getContextBuilder,
  getMemoryManager,
} from '../services/merciaCore';
import { getSupabase } from '../services/supabase';
import { InsightMetadataEntry, MEMORY_CAPS } from '@mercia/ai-core';

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
const newChatSchema = z.object({
  title: z.string().optional(),
  chatType: z.enum(['question', 'general']).optional(),
  linkedQuestionId: z.string().uuid().optional(),
});

const messageSchema = z.object({
  chatId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  timezone: z.string().optional(),
  questionContext: z.object({
    questionId: z.string().uuid(),
    questionText: z.string().min(1),
    userAnswer: z.string().min(1),
  }).optional(),
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
      const { chatId, content, timezone, questionContext } = req.body;

      const storage = getStorage();
      const llm = getLLM();
      const contextBuilder = getContextBuilder();

      // Build context — use specialized question-discussion prompt when questionContext is present
      let contextLoaded = false;
      let context: Awaited<ReturnType<typeof contextBuilder.buildChatContext>>;

      console.log('[Chat] questionContext received:', JSON.stringify(questionContext));

      if (
        questionContext?.questionText?.trim().length > 0 &&
        questionContext?.userAnswer?.trim().length > 0
      ) {
        context = await contextBuilder.buildQuestionChatContext(
          userId,
          chatId,
          questionContext.questionText,
          questionContext.userAnswer
        );
        contextLoaded = true;
        console.log(`[Chat] Using question-discussion context for chat: ${chatId}`);
      } else {
        context = await contextBuilder.buildChatContext(userId, chatId);
      }

      // Save user message for regular chats only — question init uses the answer
      // as an LLM trigger but does not persist it as a visible chat message
      let userMessage: any = null;
      if (!contextLoaded) {
        userMessage = await storage.saveChatMessage(chatId, userId, 'user', content);
      }

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

      // Log activity for stats AND check achievements
      try {
        const supabase = getSupabase();

        console.log('[Chat] Inserting activity log for user:', userId);
        // Log the activity
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
        } else {
          console.log('[Chat] Activity log inserted successfully');
        }

        // Check and unlock achievements
        const { checkAndUnlockAchievements } = require('./stats');
        const newAchievements = await checkAndUnlockAchievements(userId, supabase);

        if (newAchievements.length > 0) {
          console.log('🏆 New achievements unlocked:', newAchievements.map((a: any) => a.title).join(', '));
        }
      } catch (err) {
        console.error('Failed to log chat activity or check achievements:', err);
      }

      res.json({
        success: true,
        data: {
          ...(userMessage !== null && { userMessage }),
          assistantMessage,
          contextLoaded,
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
 * POST /api/chat/:chatId/summarize
 * Quality-checks a chat and extracts a one-sentence theme.
 * Routes the theme through pending_insights staging or commits/updates
 * committed conversation memory. Called by the frontend on chat idle.
 * Never surfaces errors to the user — always returns success.
 */
router.post(
  '/:chatId/summarize',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { chatId } = req.params;

      const storage = getStorage();
      const llm = getLLM();
      const memoryManager = getMemoryManager();

      // STEP 1 — Load messages and chat record; gate on minimum content
      const allMessages = await storage.getChatMessages(chatId);

      // One-time-per-chat guard — never process the same chat twice
      const chat = await storage.getChat(chatId);
      if (chat?.summarized) {
        console.log(`[Summarize] ${chatId}: already summarized, skipping`);
        res.json({ success: true, action: 'skipped', reason: 'already_summarized' });
        return;
      }

      const userMessages = allMessages.filter(m => m.role === 'user');
      const totalUserChars = userMessages.reduce((sum, m) => sum + m.content.length, 0);

      if (userMessages.length < 2 || totalUserChars < 50) {
        console.log(`[Summarize] ${chatId}: skipped — insufficient_content (${userMessages.length} user msgs, ${totalUserChars} chars)`);
        res.json({ success: true, action: 'skipped', reason: 'insufficient_content' });
        return;
      }

      const last10 = allMessages.slice(-10);
      const conversationText = last10
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      // STEP 2 — Quality check via LLM
      const qualitySystemPrompt = `Does this conversation contain a meaningful topic or theme worth remembering about the user? A meaningful conversation has genuine substance — a real question, opinion, or topic the user engaged with. Single words, greetings, test messages, and very short exchanges are not meaningful. Return ONLY valid JSON: { "meaningful": true/false, "reason": "brief explanation" }`;

      let qualityResult: { meaningful: boolean; reason: string };
      try {
        const qualityRaw = await llm.chat(
          [
            { role: 'system', content: qualitySystemPrompt },
            { role: 'user', content: conversationText },
          ],
          { temperature: 0.2, maxTokens: 150 }
        );
        const cleaned = qualityRaw.replace(/```json\n?|\n?```/g, '').trim();
        qualityResult = JSON.parse(cleaned);
      } catch {
        console.log(`[Summarize] ${chatId}: skipped — quality_check_parse_failed`);
        res.json({ success: true, action: 'skipped', reason: 'quality_check_failed' });
        return;
      }

      if (!qualityResult.meaningful) {
        console.log(`[Summarize] ${chatId}: skipped — not_meaningful: ${qualityResult.reason}`);
        res.json({ success: true, action: 'skipped', reason: 'not_meaningful' });
        return;
      }

      // STEP 3 — Generate theme sentence
      const themeSystemPrompt = `Write exactly one concise sentence (under 20 words) summarizing the main theme or topic of this conversation as it relates to the user's interests or perspective. Start with "User". Example: "User is interested in ancient military history and the strategies of conquest." Return only the sentence, no punctuation beyond the period.`;

      let themeSentence: string;
      try {
        const themeRaw = await llm.chat(
          [
            { role: 'system', content: themeSystemPrompt },
            { role: 'user', content: conversationText },
          ],
          { temperature: 0.3, maxTokens: 80 }
        );
        themeSentence = themeRaw.trim();
      } catch {
        console.log(`[Summarize] ${chatId}: skipped — theme_generation_failed`);
        res.json({ success: true, action: 'skipped', reason: 'theme_generation_failed' });
        return;
      }

      console.log(`[Summarize] ${chatId}: theme = "${themeSentence}"`);

      // Load profile and prep shared state for steps 4–6
      const profile = await memoryManager.getProfile(userId);
      const now = new Date().toISOString();
      const fullMetadata: InsightMetadataEntry[] = [...(profile.insights_metadata || [])];

      // Expiry cleanup — strip pending entries whose expires_at is in the past
      const pending: InsightMetadataEntry[] = (profile.pending_insights || []).filter(entry => {
        if (entry.expires_at) {
          return new Date(entry.expires_at) > new Date();
        }
        return true;
      });
      const expiredCount = (profile.pending_insights || []).length - pending.length;
      if (expiredCount > 0) {
        console.log(`[Summarize] ${chatId}: expired ${expiredCount} staging entries`);
      }

      // STEP 4 — Check against staging (pending_insights where category === 'conversation_theme')
      const stagingThemes = pending.filter(e => e.category === 'conversation_theme');

      if (stagingThemes.length > 0) {
        const stagingList = stagingThemes.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
        const stagingCheckPrompt = `Given this new insight: "${themeSentence}"\nAnd these existing insights:\n${stagingList}\nDo any of the existing insights cover the same general theme as the new insight? Return ONLY valid JSON: { "match_found": true/false, "match_index": number_or_null, "reason": "brief explanation" }`;

        let stagingCheck: { match_found: boolean; match_index: number | null; reason: string } = {
          match_found: false, match_index: null, reason: 'parse error',
        };
        try {
          const stagingRaw = await llm.chat(
            [{ role: 'user', content: stagingCheckPrompt }],
            { temperature: 0.2, maxTokens: 150 }
          );
          const cleaned = stagingRaw.replace(/```json\n?|\n?```/g, '').trim();
          stagingCheck = JSON.parse(cleaned);
        } catch {
          // parse error — treat as no match, fall through to step 5
        }

        if (stagingCheck.match_found && stagingCheck.match_index !== null) {
          const matchedEntry = stagingThemes[stagingCheck.match_index - 1]; // LLM uses 1-indexed
          if (matchedEntry) {
            // Combine the two sentences into one
            const combinePrompt = `Combine these two insights into one concise sentence under 20 words that captures both. Start with "User". Return only the sentence.\nInsight 1: ${themeSentence}\nInsight 2: ${matchedEntry.content}`;
            let combinedSentence = themeSentence;
            try {
              const combineRaw = await llm.chat(
                [{ role: 'user', content: combinePrompt }],
                { temperature: 0.3, maxTokens: 80 }
              );
              combinedSentence = combineRaw.trim();
            } catch {
              // fall back to new sentence if combine fails
            }

            console.log(`[Summarize] ${chatId}: staging match (reason: ${stagingCheck.reason})`);
            console.log(`[Summarize] ${chatId}: committing combined sentence: "${combinedSentence}"`);

            // Commit combined entry to conversation pool
            let convEntries = fullMetadata.filter(e => e.source_type === 'conversation');
            const questionEntries = fullMetadata.filter(e => e.source_type === 'question');

            if (convEntries.length >= MEMORY_CAPS.CONVERSATION_FACTS_MAX) {
              convEntries = memoryManager.evictLowestFromPool(convEntries);
            }
            convEntries.push({
              id: randomUUID(),
              content: combinedSentence,
              category: 'interest',
              source_type: 'conversation',
              source_id: chatId,
              confidence: 0.75,
              semantic_importance: 0.7,
              source_count: 2,
              first_identified: now,
              last_reinforced: now,
            });
            const updatedMetadata = [...questionEntries, ...convEntries];
            const updatedPending = pending.filter(e => e.id !== matchedEntry.id);
            const flatFields = memoryManager.rebuildFlatFields(updatedMetadata);
            const qCount = questionEntries.length;
            const cCount = convEntries.length;

            await storage.updateMemoryProfile(userId, {
              ...flatFields,
              insights_metadata: updatedMetadata,
              pending_insights: updatedPending,
              question_facts_count: qCount,
              conversation_facts_count: cCount,
              question_facts_completeness: qCount / MEMORY_CAPS.QUESTION_FACTS_MAX,
              conversation_facts_completeness: cCount / MEMORY_CAPS.CONVERSATION_FACTS_MAX,
              profile_completeness:
                ((qCount / MEMORY_CAPS.QUESTION_FACTS_MAX) + (cCount / MEMORY_CAPS.CONVERSATION_FACTS_MAX)) / 2,
            });
            await storage.markChatSummarized(chatId);

            res.json({ success: true, action: 'committed', sentence: combinedSentence });
            return;
          }
        }
      }

      // STEP 5 — Check against committed conversation memory
      const convEntries = fullMetadata.filter(e => e.source_type === 'conversation');

      if (convEntries.length > 0) {
        const memoryList = convEntries.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
        const memoryCheckPrompt = `Given this new insight: "${themeSentence}"\nAnd these existing memory entries:\n${memoryList}\nDoes the new insight relate to the same theme as any existing entry? Return ONLY valid JSON: { "match_found": true/false, "match_index": number_or_null, "reason": "brief explanation" }`;

        let memoryCheck: { match_found: boolean; match_index: number | null; reason: string } = {
          match_found: false, match_index: null, reason: 'parse error',
        };
        try {
          const memoryRaw = await llm.chat(
            [{ role: 'user', content: memoryCheckPrompt }],
            { temperature: 0.2, maxTokens: 150 }
          );
          const cleaned = memoryRaw.replace(/```json\n?|\n?```/g, '').trim();
          memoryCheck = JSON.parse(cleaned);
        } catch {
          // parse error — treat as no match, fall through to step 6
        }

        if (memoryCheck.match_found && memoryCheck.match_index !== null) {
          const matchedConvEntry = convEntries[memoryCheck.match_index - 1]; // 1-indexed
          if (matchedConvEntry) {
            const refinePrompt = `Expand or refine this existing memory entry to incorporate the new insight. Keep it under 25 words, start with "User". Return only the sentence.\nExisting: ${matchedConvEntry.content}\nNew insight: ${themeSentence}`;
            let refinedSentence = matchedConvEntry.content;
            try {
              const refineRaw = await llm.chat(
                [{ role: 'user', content: refinePrompt }],
                { temperature: 0.3, maxTokens: 80 }
              );
              refinedSentence = refineRaw.trim();
            } catch {
              // fall back to existing content if refine fails
            }

            console.log(`[Summarize] ${chatId}: memory match (reason: ${memoryCheck.reason})`);
            console.log(`[Summarize] ${chatId}: updating entry to: "${refinedSentence}"`);

            const updatedMetadata = fullMetadata.map(e => {
              if (e.id === matchedConvEntry.id) {
                return {
                  ...e,
                  content: refinedSentence,
                  source_count: (e.source_count || 1) + 1,
                  last_reinforced: now,
                };
              }
              return e;
            });
            const flatFields = memoryManager.rebuildFlatFields(updatedMetadata);

            await storage.updateMemoryProfile(userId, {
              ...flatFields,
              insights_metadata: updatedMetadata,
              pending_insights: pending,
            });
            await storage.markChatSummarized(chatId);

            res.json({ success: true, action: 'updated_memory', sentence: refinedSentence });
            return;
          }
        }
      }

      // STEP 6 — No match anywhere: add to staging
      let updatedPending = [...pending];
      const currentThemesInStaging = updatedPending.filter(e => e.category === 'conversation_theme');

      // Cap at 20 conversation_theme entries — evict oldest by last_reinforced
      if (currentThemesInStaging.length >= 20) {
        const oldest = currentThemesInStaging.reduce((prev, curr) =>
          new Date(prev.last_reinforced) < new Date(curr.last_reinforced) ? prev : curr
        );
        updatedPending = updatedPending.filter(e => e.id !== oldest.id);
        console.log(`[Summarize] ${chatId}: staging cap hit, evicting oldest: "${oldest.content}"`);
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      updatedPending.push({
        id: randomUUID(),
        content: themeSentence,
        category: 'conversation_theme',
        source_type: 'conversation',
        source_id: chatId,
        confidence: 0.65,
        semantic_importance: 0.6,
        source_count: 1,
        first_identified: now,
        last_reinforced: now,
        expires_at: expiresAt.toISOString(),
      });

      console.log(`[Summarize] ${chatId}: staged "${themeSentence}" (expires ${expiresAt.toISOString().split('T')[0]})`);

      await storage.updateMemoryProfile(userId, {
        pending_insights: updatedPending,
      });
      await storage.markChatSummarized(chatId);

      res.json({ success: true, action: 'staged', sentence: themeSentence });

    } catch (error: any) {
      console.error('[Summarize] Unhandled error:', error);
      res.status(500).json({ success: false, error: error.message });
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
