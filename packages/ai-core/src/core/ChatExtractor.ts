import { StorageAdapter } from '../adapters/storage';
import { LLMAdapter } from '../adapters/llm';
import { Chat, ChatMessage, MemoryProfile, SupportingQuote } from '../types';

interface ChatAnalysisCandidate {
  chat: Chat;
  messages: ChatMessage[];
  userMessageCount: number;
  totalMessageCount: number;
  avgMessageLength: number;
}

interface QualityCheckResult {
  contains_insights: boolean;
  insight_types: string[];
  confidence: number;
  reasoning: string;
}

interface ExtractedInsights {
  interests: Record<string, number>;          // topic -> confidence
  beliefs: Record<string, string>;            // domain -> belief
  behavioral_patterns: string[];
  thinking_style: string;
  key_quotes: string[];
  semantic_importance_scores: Record<string, number>;  // insight -> importance
}

export class ChatExtractor {
  constructor(
    private storage: StorageAdapter,
    private llm: LLMAdapter
  ) {}

  /**
   * Main entry point: Process yesterday's chats for a user
   */
  async processUserChats(userId: string, date: Date): Promise<{
    chatsAnalyzed: number;
    insightsExtracted: number;
  }> {
    console.log(`[ChatExtractor] Processing chats for user ${userId} on ${date.toISOString().split('T')[0]}`);

    const startTime = Date.now();

    // Get all chats from the target date
    const allChats = await this.getUserChatsForDate(userId, date);
    console.log(`[ChatExtractor] Found ${allChats.length} chats for date`);

    // Filter chats using cheap rules
    const candidates = await this.filterChats(allChats);
    console.log(`[ChatExtractor] ${candidates.length}/${allChats.length} chats passed filters`);

    if (candidates.length === 0) {
      return { chatsAnalyzed: 0, insightsExtracted: 0 };
    }

    // Quality check each candidate
    const worthExtracting: { candidate: ChatAnalysisCandidate; quality: QualityCheckResult }[] = [];

    for (const candidate of candidates) {
      try {
        const quality = await this.checkChatQuality(candidate);

        if (quality.contains_insights && quality.confidence >= 0.5) {
          worthExtracting.push({ candidate, quality });
        }
      } catch (error) {
        console.error(`[ChatExtractor] Error in quality check for chat ${candidate.chat.id}:`, error);
      }
    }

    console.log(`[ChatExtractor] ${worthExtracting.length}/${candidates.length} chats contain insights`);

    if (worthExtracting.length === 0) {
      return { chatsAnalyzed: candidates.length, insightsExtracted: 0 };
    }

    // Extract insights from quality chats
    let totalInsights = 0;

    for (const { candidate, quality } of worthExtracting) {
      try {
        const insights = await this.extractInsights(candidate);

        // Save extraction history
        await this.saveExtractionHistory(
          userId,
          candidate.chat.id,
          insights,
          quality.confidence,
          date,
          candidate.messages.length,
          Date.now() - startTime
        );

        // Update user memory profile
        await this.updateMemoryProfile(userId, insights, candidate.chat.id);

        totalInsights += this.countInsights(insights);

      } catch (error) {
        console.error(`[ChatExtractor] Error extracting from chat ${candidate.chat.id}:`, error);
      }
    }

    // Update user stats
    await this.updateUserStats(userId, candidates.length, worthExtracting.length);

    const duration = Date.now() - startTime;
    console.log(`[ChatExtractor] Completed for user ${userId}: ${worthExtracting.length} chats, ${totalInsights} insights, ${duration}ms`);

    return {
      chatsAnalyzed: worthExtracting.length,
      insightsExtracted: totalInsights,
    };
  }

  /**
   * Filter chats using cheap rules (no LLM cost)
   */
  private async filterChats(chats: Chat[]): Promise<ChatAnalysisCandidate[]> {
    const candidates: ChatAnalysisCandidate[] = [];

    for (const chat of chats) {
      const messages = await this.storage.getChatMessages(chat.id);

      // Count user vs AI messages
      const userMessages = messages.filter(m => m.role === 'user');
      const aiMessages = messages.filter(m => m.role === 'assistant');

      // Calculate average message length
      const avgLength = messages.length > 0
        ? messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length
        : 0;

      // Apply filters
      if (userMessages.length < 3) continue;              // Min 3 user messages
      if (aiMessages.length < 3) continue;                // Min 3 AI responses
      if (messages.length < 6) continue;                  // Min 6 total messages
      if (avgLength < 20) continue;                       // Min 20 char avg (avoid "ok", "thanks")

      // Check age (don't analyze chats older than 60 days)
      const daysSinceCreation = (Date.now() - new Date(chat.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation > 60) continue;

      candidates.push({
        chat,
        messages,
        userMessageCount: userMessages.length,
        totalMessageCount: messages.length,
        avgMessageLength: avgLength,
      });
    }

    return candidates;
  }

  /**
   * Quality check: Does this chat contain insights? (LLM call ~$0.0003)
   */
  private async checkChatQuality(candidate: ChatAnalysisCandidate): Promise<QualityCheckResult> {
    const conversationText = this.formatMessagesForAnalysis(candidate.messages);

    const systemPrompt = `Analyze this conversation and determine if it contains meaningful personal insights about the user.

Return ONLY valid JSON (no markdown):
{
  "contains_insights": boolean,
  "insight_types": ["values", "beliefs", "interests", "patterns", "goals"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

CONTAINS INSIGHTS if conversation reveals:
- User's values, beliefs, or philosophy
- Personal interests or passions
- Behavioral patterns or habits
- Goals or aspirations
- Decision-making approach
- Emotional patterns or triggers
- Important life context

DOES NOT contain insights if conversation is:
- Purely factual questions ("What's the capital of France?")
- Technical help with no personal context
- Casual small talk with no depth
- One-sided (user barely engaged)
- Random/incoherent`;

    const response = await this.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText },
      ],
      { temperature: 0.3, maxTokens: 200 }
    );

    // Parse JSON response
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }

  /**
   * Extract insights from chat (LLM call ~$0.0013)
   */
  private async extractInsights(candidate: ChatAnalysisCandidate): Promise<ExtractedInsights> {
    const conversationText = this.formatMessagesForAnalysis(candidate.messages);

    const systemPrompt = `Extract personal insights from this conversation.

Focus on what this reveals about the USER (not general facts).

Return ONLY valid JSON (no markdown):
{
  "interests": {"topic": confidence_0_to_1},
  "beliefs": {"domain": "belief_statement"},
  "behavioral_patterns": ["pattern1", "pattern2"],
  "thinking_style": "analytical|intuitive|balanced|creative|practical",
  "key_quotes": ["meaningful_user_quote1"],
  "semantic_importance_scores": {"insight_key": importance_0_to_1}
}

Guidelines:
- interests: Topics user showed genuine enthusiasm about
- beliefs: User's stated or implied beliefs about life domains
- behavioral_patterns: How user approaches situations, makes decisions
- thinking_style: How user processes information and problems
- key_quotes: Direct user quotes that capture essence (max 3, under 100 chars each)
- semantic_importance_scores: How important each insight is (philosophy=0.9, one-time mention=0.3)

Only extract what's clearly supported by conversation. Be selective and high-confidence.`;

    const response = await this.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText },
      ],
      { temperature: 0.3, maxTokens: 500 }
    );

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }

  /**
   * Update user memory profile with new insights
   */
  private async updateMemoryProfile(
    userId: string,
    insights: ExtractedInsights,
    chatId: string
  ): Promise<void> {
    const profile = await this.storage.getMemoryProfile(userId);
    if (!profile) return;

    const updates: Partial<MemoryProfile> = {};

    // Merge interests (with confidence scoring)
    if (insights.interests && Object.keys(insights.interests).length > 0) {
      const existingInterests = { ...(profile.interests || {}) };

      for (const [topic, confidence] of Object.entries(insights.interests)) {
        if (confidence < 0.6) continue;  // Min confidence threshold

        // If interest exists, reinforce it
        if (existingInterests[topic]) {
          existingInterests[topic] = Math.min(
            (existingInterests[topic] + confidence) / 2 * 1.1,  // Boost for confirmation
            1.0
          );
        } else {
          existingInterests[topic] = confidence;
        }
      }

      updates.interests = existingInterests;
    }

    // Merge beliefs (with confidence threshold)
    if (insights.beliefs && Object.keys(insights.beliefs).length > 0) {
      const existingBeliefs = { ...(profile.beliefs || {}) };

      for (const [domain, belief] of Object.entries(insights.beliefs)) {
        // For core beliefs, require 75% confidence (extracted from semantic_importance)
        const importance = insights.semantic_importance_scores?.[`belief_${domain}`] || 0.7;
        if (importance < 0.75) continue;

        existingBeliefs[domain] = belief;
      }

      updates.beliefs = existingBeliefs;
    }

    // Add key quotes
    if (insights.key_quotes && insights.key_quotes.length > 0) {
      const existingQuotes = [...(profile.supporting_quotes || [])];

      for (const quoteText of insights.key_quotes) {
        const quote: SupportingQuote = {
          quote: quoteText,
          source_type: 'chat',
          source_id: chatId,
          context: 'From conversation',
          timestamp: new Date(),
          confidence: 0.7,
        };

        existingQuotes.push(quote);
      }

      // Keep only top 100 quotes by confidence
      updates.supporting_quotes = existingQuotes
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 100);
    }

    // Store metadata for weighted scoring (insights with importance scores)
    if (insights.semantic_importance_scores) {
      const metadata = [...(profile.insights_metadata || [])];

      // Add new insights to metadata
      for (const [key, importance] of Object.entries(insights.semantic_importance_scores)) {
        metadata.push({
          type: key.split('_')[0],  // interest, belief, pattern
          content: key,
          semantic_importance: importance,
          confidence: insights.interests?.[key] || 0.7,
          source_chat_id: chatId,
          source_count: 1,
          first_identified: new Date(),
          last_reinforced: new Date(),
        });
      }

      updates.insights_metadata = metadata;
    }

    // Check memory capacity and evict if needed
    const totalSlots = this.calculateSlotsUsed(profile);
    if (totalSlots > 500) {
      await this.evictLowestScoring(userId, profile);
    }

    // Save updates
    await this.storage.updateMemoryProfile(userId, updates);
  }

  /**
   * Calculate total memory slots used
   */
  private calculateSlotsUsed(profile: MemoryProfile): number {
    const values = (profile.core_values || []).length;
    const beliefs = Object.keys(profile.beliefs || {}).length;
    const interests = Object.keys(profile.interests || {}).length;
    const quotes = (profile.supporting_quotes || []).length;
    const metadata = (profile.insights_metadata || []).length;

    return values + beliefs + interests + quotes + metadata;
  }

  /**
   * Evict lowest-scoring insight when memory is full (500 slots)
   */
  private async evictLowestScoring(userId: string, profile: MemoryProfile): Promise<void> {
    const metadata = profile.insights_metadata || [];

    if (metadata.length === 0) return;

    // Score each insight
    const scored = metadata.map((insight: any) => ({
      insight,
      score: this.calculateInsightScore(insight),
    }));

    // Sort by score (lowest first)
    scored.sort((a: any, b: any) => a.score - b.score);

    // Remove lowest scoring
    const toRemove = scored[0].insight;

    console.log(`[ChatExtractor] EVICTION: Removing "${toRemove.content}" (score: ${scored[0].score.toFixed(2)})`);

    // Remove from metadata
    const updatedMetadata = metadata.filter((i: any) => i !== toRemove);

    await this.storage.updateMemoryProfile(userId, {
      insights_metadata: updatedMetadata,
    });
  }

  /**
   * Calculate insight importance score (weighted)
   */
  private calculateInsightScore(insight: any): number {
    // Semantic importance (40%) - AI's judgment of content value
    const importanceScore = insight.semantic_importance || 0.5;

    // Cross-validation (30%) - Multiple sources = truth
    const validationScore = Math.min((insight.source_count || 1) / 3, 1.0);

    // Confidence (20%) - How sure AI is
    const confidenceScore = insight.confidence || 0.5;

    // Recency (10%) - Recent is relevant, but not dominant
    const daysSince = (Date.now() - new Date(insight.last_reinforced).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = daysSince < 30 ? 1.0 :
                        daysSince < 60 ? 0.7 :
                        daysSince < 90 ? 0.4 : 0.2;

    return (
      importanceScore * 0.40 +
      validationScore * 0.30 +
      confidenceScore * 0.20 +
      recencyScore * 0.10
    );
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getUserChatsForDate(userId: string, date: Date): Promise<Chat[]> {
    // Get chats updated on this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const allChats = await this.storage.getUserChats(userId, 1000);

    return allChats.filter(chat => {
      const updated = new Date(chat.updated_at);
      return updated >= startOfDay && updated <= endOfDay;
    });
  }

  private formatMessagesForAnalysis(messages: ChatMessage[]): string {
    return messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
  }

  private countInsights(insights: ExtractedInsights): number {
    return (
      Object.keys(insights.interests || {}).length +
      Object.keys(insights.beliefs || {}).length +
      (insights.behavioral_patterns || []).length +
      (insights.key_quotes || []).length
    );
  }

  private async saveExtractionHistory(
    userId: string,
    chatId: string,
    insights: ExtractedInsights,
    qualityScore: number,
    date: Date,
    messageCount: number,
    processingTime: number
  ): Promise<void> {
    // This would save to chat_extraction_history table
    // Implementation depends on StorageAdapter extension
    console.log(`[ChatExtractor] Saved extraction history for chat ${chatId} (quality: ${qualityScore.toFixed(2)}, messages: ${messageCount}, ${processingTime}ms)`);
  }

  private async updateUserStats(
    userId: string,
    chatsAnalyzed: number,
    chatsExtracted: number
  ): Promise<void> {
    const profile = await this.storage.getMemoryProfile(userId);
    if (!profile) return;

    await this.storage.updateMemoryProfile(userId, {
      chat_messages_analyzed: (profile.chat_messages_analyzed || 0) + chatsAnalyzed,
      chat_extractions_count: (profile.chat_extractions_count || 0) + chatsExtracted,
    });
  }
}
