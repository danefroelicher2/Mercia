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

  async extractInsights(questionText: string, userResponse: string): Promise<any> {
    const systemPrompt = `You are an AI that extracts structured insights from user responses to philosophical questions.

Extract the following in JSON format:
{
  "core_values": ["list of values demonstrated"],
  "beliefs": {"category": "belief statement"},
  "key_quote": "single most revealing quote (max 100 chars)",
  "insight_summary": "one sentence insight",
  "topics_mentioned": ["list of topics"],
  "emotional_tone": "positive/negative/neutral/mixed"
}

Be concise. Extract only what's clearly present. Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Question: ${questionText}\n\nUser's Response: ${userResponse}`;

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 500 }
    );

    try {
      // Strip markdown code fences if present
      const cleaned = result.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse insights:', error);
      return {};
    }
  }

  getProvider(): string {
    return 'Groq';
  }
}
