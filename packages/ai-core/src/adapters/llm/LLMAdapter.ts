export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * LLM Adapter Interface
 * Implement this for any LLM provider (Groq, OpenAI, Claude, local models)
 */
export interface LLMAdapter {
  /**
   * Send chat completion request
   */
  chat(messages: LLMChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Get provider name (for logging/debugging)
   */
  getProvider(): string;
}
