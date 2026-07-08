import { StorageAdapter } from '../adapters/storage';
import { ChatMessage } from '../types';

/**
 * ContextBuilder
 * Builds context for AI conversations: system prompt + recent chat history.
 */
export class ContextBuilder {
  constructor(private storage: StorageAdapter) {}

  /**
   * Build context for a chat message.
   */
  async buildChatContext(
    userId: string,
    chatId: string,
    maxHistoryMessages: number = 10
  ): Promise<{ systemPrompt: string; conversationHistory: ChatMessage[] }> {
    const messages = await this.storage.getChatMessages(chatId, maxHistoryMessages);

    const systemPrompt = `You are Mercia, a warm and direct AI assistant.

INSTRUCTIONS:
- Be helpful, concise, and conversational
- Keep responses brief unless the user asks for detail

Current date: ${new Date().toLocaleDateString()}`;

    return {
      systemPrompt,
      conversationHistory: messages,
    };
  }
}
