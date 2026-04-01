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
    const systemPrompt = `You are an AI that extracts structured insights from user responses to philosophical questions. Your job is to build a rich, specific picture of who this person is — not generic labels.

Extract the following in JSON format:
{
  "core_values": ["5-12 word phrase naming the value AND how it manifests for this person. Example: 'prioritizes family relationships over professional advancement'"],
  "beliefs": {"domain": "10-20 word statement of what they believe and why it matters to them. Example: 'consistent daily effort compounds into results that intensity alone cannot match'"},
  "patterns": ["5-15 word phrase describing a behavioral or thinking pattern clearly shown. Example: 'makes decisions slowly but commits fully once resolved'"],
  "goals": ["5-15 word phrase describing a current goal or aspiration explicitly mentioned. Example: 'building independent income alongside current employment'"],
  "key_quote": "single most revealing quote from their response (max 100 chars)",
  "insight_summary": "one sentence insight about this person",
  "topics_mentioned": ["5-10 word phrase: topic AND the specific angle that interests them. Example: 'stoic philosophy applied to modern daily decisions'"],
  "emotional_tone": "positive/negative/neutral/mixed"
}

Rules:
- Phrases must be specific to this person — never generic truisms anyone would say.
- Extract ONLY what is clearly present in the response. Do not infer or project.
- patterns and goals arrays may be empty [] if not clearly present.
- core_values and topics_mentioned should each have 1-4 items max.
- Return ONLY valid JSON, no markdown, no explanation.`;

    const userPrompt = `Question: ${questionText}\n\nUser's Response: ${userResponse}`;

    const result = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 600 }
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
