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
    const systemPrompt = `You are Oasis AI, a deeply personalized AI assistant that truly knows the user.

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
