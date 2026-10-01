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

  private model: string;

  // Groq retired llama-3.3-70b-versatile on 2026-08-16; GROQ_MODEL overrides
  // the default so the next retirement is an env change, not a deploy.
  constructor(apiKey: string, model: string = 'openai/gpt-oss-120b') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: LLMChatMessage[], options?: ChatOptions): Promise<string> {
    const model = options?.model || this.model;
    const maxTokens = options?.maxTokens || 1000;
    // gpt-oss reasons before answering and those tokens count against the
    // limit, so keep reasoning light and give it headroom beyond the reply
    // budget — otherwise short replies come back empty.
    const isGptOss = model.startsWith('openai/gpt-oss');
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_completion_tokens: isGptOss ? maxTokens + 1024 : maxTokens,
        ...(isGptOss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
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
