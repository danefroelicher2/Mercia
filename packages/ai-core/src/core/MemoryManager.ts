import { StorageAdapter } from '../adapters/storage';
import { LLMAdapter } from '../adapters/llm';
import { MemoryProfile, QuestionResponse, SupportingQuote } from '../types';

/**
 * MemoryManager
 * Builds and maintains user memory profiles from question responses
 * This is the CORE of Oasis AI - deep user understanding
 */
export class MemoryManager {
  constructor(
    private storage: StorageAdapter,
    private llm: LLMAdapter
  ) {}

  /**
   * Get user's current memory profile
   * Creates empty profile if doesn't exist
   */
  async getProfile(userId: string): Promise<MemoryProfile> {
    let profile = await this.storage.getMemoryProfile(userId);

    if (!profile) {
      // Create initial profile
      profile = await this.storage.updateMemoryProfile(userId, {
        core_values: [],
        beliefs: {},
        interests: {},
        communication_style: {},
        supporting_quotes: [],
        profile_completeness: 0,
        questions_answered: 0,
        total_interactions: 0,
      });
    }

    return profile;
  }

  /**
   * Process a question response and update memory profile
   * This is where the AI "learns" about the user
   */
  async processQuestionResponse(
    userId: string,
    questionResponse: QuestionResponse
  ): Promise<MemoryProfile> {
    // Fetch the question text from the database
    const question = await this.storage.getQuestionById(questionResponse.question_id);
    if (!question) {
      throw new Error(`Question not found: ${questionResponse.question_id}`);
    }
    const questionText = question.question_text;

    // Get current profile
    const profile = await this.getProfile(userId);

    // Extract insights using LLM
    const insights = await this.llm.extractInsights(
      questionText,
      questionResponse.response_text
    );

    // Update profile with new insights
    const updates: Partial<MemoryProfile> = {
      total_interactions: profile.total_interactions + 1,
    };

    // Merge core values (deduplicate)
    if (insights.core_values && insights.core_values.length > 0) {
      const existingValues = new Set(profile.core_values);
      insights.core_values.forEach((value: string) => existingValues.add(value));
      updates.core_values = Array.from(existingValues);
    }

    // Merge beliefs
    if (insights.beliefs && Object.keys(insights.beliefs).length > 0) {
      updates.beliefs = {
        ...profile.beliefs,
        ...insights.beliefs,
      };
    }

    // Update interests (merge with existing)
    if (insights.topics_mentioned && insights.topics_mentioned.length > 0) {
      const interests = { ...profile.interests };
      insights.topics_mentioned.forEach((topic: string) => {
        // Increment interest score (max 1.0)
        interests[topic] = Math.min((interests[topic] || 0) + 0.1, 1.0);
      });
      updates.interests = interests;
    }

    // Add supporting quote if key quote exists
    if (insights.key_quote) {
      const quote: SupportingQuote = {
        quote: insights.key_quote,
        source_type: 'question',
        source_id: questionResponse.question_id,
        context: insights.insight_summary || 'User response',
        timestamp: new Date(),
        confidence: 0.8,
      };

      updates.supporting_quotes = [
        ...profile.supporting_quotes,
        quote,
      ].slice(-50); // Keep last 50 quotes
    }

    // Save updated profile
    await this.storage.updateMemoryProfile(userId, updates);

    return await this.getProfile(userId);
  }

  /**
   * Get profile summary for AI context injection
   * Returns concise version suitable for LLM context
   */
  async getProfileSummary(userId: string): Promise<string> {
    const profile = await this.getProfile(userId);

    const sections: string[] = [];

    // Core values
    if (profile.core_values.length > 0) {
      sections.push(`Core Values: ${profile.core_values.slice(0, 5).join(', ')}`);
    }

    // Interests (top 5)
    const topInterests = Object.entries(profile.interests)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([topic]) => topic);

    if (topInterests.length > 0) {
      sections.push(`Interests: ${topInterests.join(', ')}`);
    }

    // Recent quotes (last 3)
    const recentQuotes = profile.supporting_quotes.slice(-3);
    if (recentQuotes.length > 0) {
      sections.push('Key Insights:');
      recentQuotes.forEach((q) => {
        sections.push(`- "${q.quote}" (${q.context})`);
      });
    }

    // Profile completeness
    sections.push(
      `Profile Completeness: ${Math.round(profile.profile_completeness * 100)}%`
    );

    return sections.join('\n');
  }

  /**
   * Update profile based on user feedback
   * Allows users to correct AI's understanding
   */
  async updateFromFeedback(
    userId: string,
    updates: Partial<MemoryProfile>
  ): Promise<MemoryProfile> {
    await this.storage.updateMemoryProfile(userId, updates);
    return await this.getProfile(userId);
  }
}
