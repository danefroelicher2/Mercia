import { LLMAdapter, LLMChatMessage, ChatOptions } from './LLMAdapter';

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class GroqLLMAdapter implements LLMAdapter {
  private apiKey: string;
  private baseUrl: string = 'https://api.groq.com/openai/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: LLMChatMessage[], options?: ChatOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'llama-3.3-70b-versatile',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as GroqChatResponse;
    return data.choices[0]?.message?.content || '';
  }

  getProvider(): string {
    return 'Groq';
  }
}
