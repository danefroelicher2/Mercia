import { StorageAdapter } from '../adapters/storage';
import { MemoryManager } from './MemoryManager';
import { ChatMessage } from '../types';

/**
 * ContextBuilder
 * Builds smart, cost-efficient context for AI conversations
 * Goal: Maximum understanding with minimum tokens
 */
export class ContextBuilder {
  constructor(
    private storage: StorageAdapter,
    private memoryManager: MemoryManager
  ) {}

  /**
   * Build context for a chat message
   * Includes: memory profile + recent chat history
   * Target: <2000 tokens total
   */
  async buildChatContext(
    userId: string,
    chatId: string,
    maxHistoryMessages: number = 10
  ): Promise<{ systemPrompt: string; conversationHistory: ChatMessage[] }> {
    // Get memory profile summary
    const profileSummary = await this.memoryManager.getProfileSummary(userId);

    // Get recent chat history
    const messages = await this.storage.getChatMessages(chatId, maxHistoryMessages);

    // Build system prompt with memory context
    const systemPrompt = `You are Mercia, a deeply personalized AI assistant that truly knows the user.

USER PROFILE:
${profileSummary}

INSTRUCTIONS:
- Reference the user's values, interests, and past insights naturally
- Adapt your communication style to match their preferences
- Be authentic and personal - you know them deeply
- Keep responses concise unless they prefer detail
- Never mention that you're reading from a profile

Current date: ${new Date().toLocaleDateString()}`;

    return {
      systemPrompt,
      conversationHistory: messages,
    };
  }

  /**
   * Build specialized context for question-discussion chats
   * Used when user taps "Discuss with Mercia" after answering a daily question
   */
  async buildQuestionChatContext(
    userId: string,
    chatId: string,
    questionText: string,
    userAnswer: string
  ): Promise<{ systemPrompt: string; conversationHistory: ChatMessage[] }> {
    const profileSummary = await this.memoryManager.getProfileSummary(userId);
    const messages = await this.storage.getChatMessages(chatId, 10);

    const systemPrompt = `You are Mercia, an AI personal growth companion. This app works by asking users one deep question per day and storing their answers to build a rich memory profile over time. The memory profile tracks the user's values, beliefs, interests, behavioral patterns, and communication style. Every conversation contributes to understanding this person more deeply.

You have been brought into this conversation because the user chose to discuss their answer to today's question with you. Your role here is not general assistance — it is to be a thoughtful, curious conversation partner who helps the user explore what their answer reveals about them. Ask follow-up questions that go deeper. Reflect back what you hear. Help them articulate things they may not have fully formed yet. Do not rush to give advice.

Today's question was: ${questionText}
The user answered: ${userAnswer}

Begin by acknowledging their answer genuinely, then guide the conversation deeper.

USER MEMORY PROFILE:
${profileSummary}

[CONTEXT_LOADED: question_discussion_v1]`;

    return {
      systemPrompt,
      conversationHistory: messages,
    };
  }

  /**
   * Build minimal context for question processing
   * Just enough for insight extraction
   */
  async buildQuestionContext(userId: string): Promise<string> {
    const profile = await this.memoryManager.getProfile(userId);

    return `User has answered ${profile.questions_answered} questions.
Known values: ${profile.core_values.slice(0, 3).join(', ')}
Profile completeness: ${Math.round(profile.profile_completeness * 100)}%`;
  }
}
