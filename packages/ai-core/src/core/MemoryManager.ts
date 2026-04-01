import { randomUUID } from 'crypto';
import { StorageAdapter } from '../adapters/storage';
import { LLMAdapter } from '../adapters/llm';
import { InsightMetadataEntry, MemoryProfile, QuestionResponse, SupportingQuote } from '../types';
import { MEMORY_CAPS } from '../constants/memory';

/**
 * MemoryManager
 * Builds and maintains user memory profiles from question responses.
 * Insights are stored as typed InsightMetadataEntry objects in insights_metadata.
 * The core_values / beliefs / interests flat fields are derived views rebuilt
 * after every write — they exist for backwards compatibility and LLM context injection.
 */
export class MemoryManager {
  constructor(
    private storage: StorageAdapter,
    private llm: LLMAdapter
  ) {}

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Get user's current memory profile.
   * Creates an empty profile if none exists.
   */
  async getProfile(userId: string): Promise<MemoryProfile> {
    let profile = await this.storage.getMemoryProfile(userId);

    if (!profile) {
      profile = await this.storage.updateMemoryProfile(userId, {
        core_values: [],
        beliefs: {},
        interests: {},
        communication_style: {},
        supporting_quotes: [],
        profile_completeness: 0,
        questions_answered: 0,
        chat_messages_analyzed: 0,
        chat_extractions_count: 0,
        insights_metadata: [],
        pending_insights: [],
        question_facts_count: 0,
        conversation_facts_count: 0,
        question_facts_completeness: 0,
        conversation_facts_completeness: 0,
        total_interactions: 0,
      });
    }

    return profile;
  }

  /**
   * Process a question response and update memory profile.
   * Extracts insights via LLM, converts them to InsightMetadataEntry objects,
   * enforces the question pool cap (evicting within question pool only),
   * then rebuilds the flat core_values / beliefs / interests fields.
   */
  async processQuestionResponse(
    userId: string,
    questionResponse: QuestionResponse
  ): Promise<MemoryProfile> {
    const question = await this.storage.getQuestionById(questionResponse.question_id);
    if (!question) {
      throw new Error(`Question not found: ${questionResponse.question_id}`);
    }

    const profile = await this.getProfile(userId);

    // Extract insights via LLM
    const insights = await this.llm.extractInsights(
      question.question_text,
      questionResponse.response_text
    );

    const now = new Date().toISOString();

    // Build InsightMetadataEntry candidates from the LLM output
    const candidates: InsightMetadataEntry[] = [];

    if (insights.core_values && insights.core_values.length > 0) {
      for (const value of insights.core_values) {
        candidates.push({
          id: randomUUID(),
          content: value,
          category: 'value',
          source_type: 'question',
          source_id: questionResponse.question_id,
          confidence: 0.8,
          semantic_importance: 0.75,
          source_count: 1,
          first_identified: now,
          last_reinforced: now,
        });
      }
    }

    if (insights.beliefs && Object.keys(insights.beliefs).length > 0) {
      for (const [domain, belief] of Object.entries(insights.beliefs)) {
        candidates.push({
          id: randomUUID(),
          content: `${domain}: ${belief}`,
          category: 'belief',
          source_type: 'question',
          source_id: questionResponse.question_id,
          confidence: 0.8,
          semantic_importance: 0.75,
          source_count: 1,
          first_identified: now,
          last_reinforced: now,
        });
      }
    }

    if (insights.topics_mentioned && insights.topics_mentioned.length > 0) {
      for (const topic of insights.topics_mentioned) {
        candidates.push({
          id: randomUUID(),
          content: topic,
          category: 'interest',
          source_type: 'question',
          source_id: questionResponse.question_id,
          confidence: 0.7,
          semantic_importance: 0.6,
          source_count: 1,
          first_identified: now,
          last_reinforced: now,
        });
      }
    }

    if (insights.patterns && insights.patterns.length > 0) {
      for (const pattern of insights.patterns) {
        candidates.push({
          id: randomUUID(),
          content: pattern,
          category: 'pattern',
          source_type: 'question',
          source_id: questionResponse.question_id,
          confidence: 0.75,
          semantic_importance: 0.8,
          source_count: 1,
          first_identified: now,
          last_reinforced: now,
        });
      }
    }

    if (insights.goals && insights.goals.length > 0) {
      for (const goal of insights.goals) {
        candidates.push({
          id: randomUUID(),
          content: goal,
          category: 'goal',
          source_type: 'question',
          source_id: questionResponse.question_id,
          confidence: 0.75,
          semantic_importance: 0.85,
          source_count: 1,
          first_identified: now,
          last_reinforced: now,
        });
      }
    }

    // Separate existing metadata by pool
    const existingMetadata: InsightMetadataEntry[] = profile.insights_metadata || [];
    let questionEntries = existingMetadata.filter(e => e.source_type === 'question');
    const conversationEntries = existingMetadata.filter(e => e.source_type === 'conversation');

    // Merge candidates into question pool (deduplicate; evict if at cap)
    for (const entry of candidates) {
      const existingIdx = questionEntries.findIndex(
        e => e.content.toLowerCase() === entry.content.toLowerCase()
      );

      if (existingIdx >= 0) {
        // Reinforce existing entry
        questionEntries[existingIdx] = {
          ...questionEntries[existingIdx],
          source_count: (questionEntries[existingIdx].source_count || 1) + 1,
          last_reinforced: now,
          confidence: Math.min(questionEntries[existingIdx].confidence + 0.05, 1.0),
        };
      } else {
        // Enforce cap — evict lowest-scoring question entry first
        if (questionEntries.length >= MEMORY_CAPS.QUESTION_FACTS_MAX) {
          questionEntries = this.evictLowestFromPool(questionEntries);
        }
        questionEntries.push(entry);
      }
    }

    const updatedMetadata = [...questionEntries, ...conversationEntries];

    // Rebuild flat fields from the full committed metadata
    const flatFields = this.rebuildFlatFields(updatedMetadata);

    // Update per-pool counts and completeness
    const questionFactsCount = questionEntries.length;
    const conversationFactsCount = conversationEntries.length;
    const questionFactsCompleteness = questionFactsCount / MEMORY_CAPS.QUESTION_FACTS_MAX;
    const conversationFactsCompleteness = conversationFactsCount / MEMORY_CAPS.CONVERSATION_FACTS_MAX;
    const profileCompleteness = (questionFactsCompleteness + conversationFactsCompleteness) / 2;

    // Append supporting quote
    const newQuotes = [...(profile.supporting_quotes || [])];
    if (insights.key_quote) {
      const quote: SupportingQuote = {
        quote: insights.key_quote,
        source_type: 'question',
        source_id: questionResponse.question_id,
        context: insights.insight_summary || 'User response',
        timestamp: new Date(),
        confidence: 0.8,
      };
      newQuotes.push(quote);
    }

    await this.storage.updateMemoryProfile(userId, {
      ...flatFields,
      insights_metadata: updatedMetadata,
      supporting_quotes: newQuotes.slice(-50),
      questions_answered: (profile.questions_answered || 0) + 1,
      question_facts_count: questionFactsCount,
      conversation_facts_count: conversationFactsCount,
      question_facts_completeness: questionFactsCompleteness,
      conversation_facts_completeness: conversationFactsCompleteness,
      profile_completeness: profileCompleteness,
      total_interactions: (profile.total_interactions || 0) + 1,
    });

    return await this.getProfile(userId);
  }

  /**
   * Get profile summary for AI context injection.
   * Returns concise text suitable for LLM system prompts.
   */
  async getProfileSummary(userId: string): Promise<string> {
    const profile = await this.getProfile(userId);
    const sections: string[] = [];

    if (profile.core_values.length > 0) {
      sections.push(`Core Values: ${profile.core_values.slice(0, 5).join(', ')}`);
    }

    const beliefEntries = Object.entries(profile.beliefs).slice(0, 4);
    if (beliefEntries.length > 0) {
      const beliefStr = beliefEntries.map(([domain, belief]) => `${domain}: ${belief}`).join('; ');
      sections.push(`Beliefs: ${beliefStr}`);
    }

    const topInterests = Object.entries(profile.interests)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([topic]) => topic);

    if (topInterests.length > 0) {
      sections.push(`Interests: ${topInterests.join(', ')}`);
    }

    const recentQuotes = profile.supporting_quotes.slice(-3);
    if (recentQuotes.length > 0) {
      sections.push('Key Insights:');
      recentQuotes.forEach(q => {
        sections.push(`- "${q.quote}" (${q.context})`);
      });
    }

    sections.push(`Profile Completeness: ${Math.round(profile.profile_completeness * 100)}%`);

    return sections.join('\n');
  }

  /**
   * Update profile based on user feedback (corrections).
   */
  async updateFromFeedback(
    userId: string,
    updates: Partial<MemoryProfile>
  ): Promise<MemoryProfile> {
    await this.storage.updateMemoryProfile(userId, updates);
    return await this.getProfile(userId);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Rebuild core_values, beliefs, and interests from the full committed insights_metadata.
   * These flat fields are derived views — insights_metadata is the source of truth.
   */
  rebuildFlatFields(metadata: InsightMetadataEntry[]): Partial<MemoryProfile> {
    const core_values: string[] = [];
    const beliefs: Record<string, string> = {};
    const interests: Record<string, number> = {};

    for (const entry of metadata) {
      if (entry.category === 'value') {
        if (!core_values.includes(entry.content)) {
          core_values.push(entry.content);
        }
      } else if (entry.category === 'belief') {
        // Content format: "domain: belief statement"
        const colonIdx = entry.content.indexOf(':');
        if (colonIdx > 0) {
          const domain = entry.content.substring(0, colonIdx).trim();
          const belief = entry.content.substring(colonIdx + 1).trim();
          beliefs[domain] = belief;
        } else {
          beliefs[entry.content] = entry.content;
        }
      } else if (entry.category === 'interest') {
        // Keep highest confidence across entries for the same topic
        const existing = interests[entry.content] ?? 0;
        interests[entry.content] = Math.min(Math.max(existing, entry.confidence), 1.0);
      }
    }

    return { core_values, beliefs, interests };
  }

  /**
   * Remove the lowest-scoring entry from a pool (never crosses pool boundaries).
   * Returns a new array with that entry removed.
   */
  evictLowestFromPool(entries: InsightMetadataEntry[]): InsightMetadataEntry[] {
    if (entries.length === 0) return entries;

    const scored = entries.map(entry => ({
      entry,
      score: this.calculateInsightScore(entry),
    }));

    scored.sort((a, b) => a.score - b.score);
    const toRemove = scored[0].entry;

    console.log(
      `[MemoryManager] EVICTION (${toRemove.source_type} pool): ` +
      `Removing "${toRemove.content}" (score: ${scored[0].score.toFixed(2)})`
    );

    return entries.filter(e => e.id !== toRemove.id);
  }

  /**
   * Calculate weighted retention score for an insight.
   * Used for eviction decisions — lowest score is evicted first.
   */
  calculateInsightScore(insight: InsightMetadataEntry): number {
    const importanceScore = insight.semantic_importance || 0.5;                    // 40%
    const validationScore = Math.min((insight.source_count || 1) / 3, 1.0);       // 30%
    const confidenceScore = insight.confidence || 0.5;                            // 20%

    const daysSince = (Date.now() - new Date(insight.last_reinforced).getTime()) / 86400000;
    const recencyScore = daysSince < 30 ? 1.0 :
                         daysSince < 60 ? 0.7 :
                         daysSince < 90 ? 0.4 : 0.2;                             // 10%

    return (
      importanceScore * 0.40 +
      validationScore * 0.30 +
      confidenceScore * 0.20 +
      recencyScore   * 0.10
    );
  }
}
