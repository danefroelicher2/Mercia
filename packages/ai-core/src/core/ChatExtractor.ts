import { randomUUID } from 'crypto';
import { StorageAdapter } from '../adapters/storage';
import { LLMAdapter } from '../adapters/llm';
import { Chat, ChatMessage, InsightMetadataEntry, MemoryProfile, SupportingQuote } from '../types';
import { MEMORY_CAPS, CONVERSATION_COMMIT_THRESHOLDS } from '../constants/memory';
import { MemoryManager } from './MemoryManager';

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
  interests: Record<string, number>;
  beliefs: Record<string, string>;
  behavioral_patterns: string[];
  thinking_style: string;
  key_quotes: string[];
  semantic_importance_scores: Record<string, number>;
}

export class ChatExtractor {
  private memoryManager: MemoryManager;

  constructor(
    private storage: StorageAdapter,
    private llm: LLMAdapter
  ) {
    this.memoryManager = new MemoryManager(storage, llm);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Main entry point: process a day's chats for a user.
   * Determines per-chat whether insights go to the question pool or conversation pool.
   */
  async processUserChats(userId: string, date: Date): Promise<{
    chatsAnalyzed: number;
    insightsExtracted: number;
  }> {
    console.log(`[ChatExtractor] Processing chats for user ${userId} on ${date.toISOString().split('T')[0]}`);

    const startTime = Date.now();

    const allChats = await this.getUserChatsForDate(userId, date);
    console.log(`[ChatExtractor] Found ${allChats.length} chats for date`);

    const candidates = await this.filterChats(allChats);
    console.log(`[ChatExtractor] ${candidates.length}/${allChats.length} chats passed filters`);

    if (candidates.length === 0) {
      return { chatsAnalyzed: 0, insightsExtracted: 0 };
    }

    const worthExtracting: {
      candidate: ChatAnalysisCandidate;
      quality: QualityCheckResult;
      targetPool: 'question' | 'conversation';
    }[] = [];

    for (const candidate of candidates) {
      try {
        const quality = await this.checkChatQuality(candidate);

        if (quality.contains_insights && quality.confidence >= 0.5) {
          // Route: question-linked chats always go to the question pool
          const targetPool: 'question' | 'conversation' =
            candidate.chat.chat_type === 'question' ? 'question' : 'conversation';

          worthExtracting.push({ candidate, quality, targetPool });
        }
      } catch (error) {
        console.error(`[ChatExtractor] Error in quality check for chat ${candidate.chat.id}:`, error);
      }
    }

    console.log(`[ChatExtractor] ${worthExtracting.length}/${candidates.length} chats contain insights`);

    if (worthExtracting.length === 0) {
      return { chatsAnalyzed: candidates.length, insightsExtracted: 0 };
    }

    let totalInsights = 0;

    for (const { candidate, quality, targetPool } of worthExtracting) {
      try {
        const insights = await this.extractInsights(candidate);

        await this.saveExtractionHistory(
          userId,
          candidate.chat.id,
          insights,
          quality.confidence,
          date,
          candidate.messages.length,
          Date.now() - startTime
        );

        await this.updateMemoryProfile(
          userId,
          insights,
          candidate.chat.id,
          targetPool,
          candidate.userMessageCount
        );

        totalInsights += this.countInsights(insights);

      } catch (error) {
        console.error(`[ChatExtractor] Error extracting from chat ${candidate.chat.id}:`, error);
      }
    }

    await this.updateUserStats(userId, candidates.length, worthExtracting.length);

    const duration = Date.now() - startTime;
    console.log(
      `[ChatExtractor] Completed for user ${userId}: ` +
      `${worthExtracting.length} chats, ${totalInsights} insights, ${duration}ms`
    );

    return {
      chatsAnalyzed: worthExtracting.length,
      insightsExtracted: totalInsights,
    };
  }

  // ============================================
  // PRIVATE: CHAT FILTERING & QUALITY CHECK
  // ============================================

  private async filterChats(chats: Chat[]): Promise<ChatAnalysisCandidate[]> {
    const candidates: ChatAnalysisCandidate[] = [];

    for (const chat of chats) {
      const messages = await this.storage.getChatMessages(chat.id);

      const userMessages = messages.filter(m => m.role === 'user');
      const aiMessages = messages.filter(m => m.role === 'assistant');

      const avgLength = messages.length > 0
        ? messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length
        : 0;

      if (userMessages.length < 3) continue;
      if (aiMessages.length < 3) continue;
      if (messages.length < 6) continue;
      if (avgLength < 20) continue;

      const daysSinceCreation =
        (Date.now() - new Date(chat.created_at).getTime()) / 86400000;
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

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }

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

  // ============================================
  // PRIVATE: MEMORY PROFILE UPDATE (DUAL-POOL)
  // ============================================

  /**
   * Write extracted insights into the appropriate memory pool.
   *
   * - targetPool === 'question': commit directly (bypasses staging).
   * - targetPool === 'conversation': run through pending_insights staging;
   *   commits only after threshold is met or high-importance override applies.
   */
  private async updateMemoryProfile(
    userId: string,
    insights: ExtractedInsights,
    chatId: string,
    targetPool: 'question' | 'conversation',
    userMessageCount: number
  ): Promise<void> {
    const profile = await this.storage.getMemoryProfile(userId);
    if (!profile) return;

    const now = new Date().toISOString();

    // Convert raw LLM output to typed InsightMetadataEntry candidates
    const candidates = this.extractedInsightsToEntries(insights, chatId, targetPool, now);
    if (candidates.length === 0) return;

    let metadata: InsightMetadataEntry[] = [...(profile.insights_metadata || [])];
    let pending: InsightMetadataEntry[] = [...(profile.pending_insights || [])];

    if (targetPool === 'question') {
      // Question-linked chats bypass staging — commit directly to question pool
      let questionEntries = metadata.filter(e => e.source_type === 'question');
      const conversationEntries = metadata.filter(e => e.source_type === 'conversation');

      for (const entry of candidates) {
        const existingIdx = questionEntries.findIndex(
          e => e.content.toLowerCase() === entry.content.toLowerCase()
        );

        if (existingIdx >= 0) {
          questionEntries[existingIdx] = {
            ...questionEntries[existingIdx],
            source_count: (questionEntries[existingIdx].source_count || 1) + 1,
            last_reinforced: now,
            confidence: Math.min(questionEntries[existingIdx].confidence + 0.05, 1.0),
          };
        } else {
          if (questionEntries.length >= MEMORY_CAPS.QUESTION_FACTS_MAX) {
            questionEntries = this.memoryManager.evictLowestFromPool(questionEntries);
          }
          questionEntries.push(entry);
        }
      }

      metadata = [...questionEntries, ...conversationEntries];

    } else {
      // Conversation pool — route each candidate through staging
      for (const entry of candidates) {
        const result = this.stageOrCommitConversationInsight(
          entry,
          pending,
          metadata,
          userMessageCount,
          now
        );
        metadata = result.metadata;
        pending = result.pending;
      }
    }

    // Rebuild flat fields and recalculate counts/completeness
    const flatFields = this.memoryManager.rebuildFlatFields(metadata);
    const questionFactsCount = metadata.filter(e => e.source_type === 'question').length;
    const conversationFactsCount = metadata.filter(e => e.source_type === 'conversation').length;
    const questionFactsCompleteness = questionFactsCount / MEMORY_CAPS.QUESTION_FACTS_MAX;
    const conversationFactsCompleteness = conversationFactsCount / MEMORY_CAPS.CONVERSATION_FACTS_MAX;
    const profileCompleteness = (questionFactsCompleteness + conversationFactsCompleteness) / 2;

    // Append supporting quotes
    const existingQuotes = [...(profile.supporting_quotes || [])];
    for (const quoteText of insights.key_quotes || []) {
      existingQuotes.push({
        quote: quoteText,
        source_type: 'chat',
        source_id: chatId,
        context: 'From conversation',
        timestamp: new Date(),
        confidence: 0.7,
      } as SupportingQuote);
    }

    await this.storage.updateMemoryProfile(userId, {
      ...flatFields,
      insights_metadata: metadata,
      pending_insights: pending,
      supporting_quotes: existingQuotes
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 100),
      chat_messages_analyzed: (profile.chat_messages_analyzed || 0) + 1,
      question_facts_count: questionFactsCount,
      conversation_facts_count: conversationFactsCount,
      question_facts_completeness: questionFactsCompleteness,
      conversation_facts_completeness: conversationFactsCompleteness,
      profile_completeness: profileCompleteness,
    });
  }

  /**
   * Route a conversation-sourced insight through the staging check.
   *
   * Returns updated { metadata, pending } arrays without mutating inputs.
   */
  private stageOrCommitConversationInsight(
    entry: InsightMetadataEntry,
    pending: InsightMetadataEntry[],
    metadata: InsightMetadataEntry[],
    userMessageCount: number,
    now: string
  ): { metadata: InsightMetadataEntry[]; pending: InsightMetadataEntry[] } {
    // High-importance override: bypass staging and commit directly
    if (
      entry.semantic_importance >= CONVERSATION_COMMIT_THRESHOLDS.HIGH_IMPORTANCE_OVERRIDE &&
      userMessageCount >= CONVERSATION_COMMIT_THRESHOLDS.MIN_USER_MESSAGES_FOR_OVERRIDE
    ) {
      console.log(`[ChatExtractor] High-importance override: committing "${entry.content}" directly`);
      const committed = this.commitToConversationPool(entry, metadata);
      return { metadata: committed, pending };
    }

    // Check pending for a matching (overlapping) entry
    const matchIdx = pending.findIndex(p => this.contentOverlaps(p.content, entry.content));

    if (matchIdx >= 0) {
      const updated = { ...pending[matchIdx] };
      updated.source_count = (updated.source_count || 1) + 1;
      updated.last_reinforced = now;
      updated.confidence = Math.min((updated.confidence + entry.confidence) / 2, 1.0);

      if (updated.source_count >= CONVERSATION_COMMIT_THRESHOLDS.MIN_SOURCE_COUNT) {
        // Graduate from staging to committed metadata
        console.log(`[ChatExtractor] Graduating "${updated.content}" from pending to metadata (source_count: ${updated.source_count})`);
        const newPending = pending.filter((_, i) => i !== matchIdx);
        const committed = this.commitToConversationPool(updated, metadata);
        return { metadata: committed, pending: newPending };
      }

      // Not yet at threshold — update in pending
      const newPending = [...pending];
      newPending[matchIdx] = updated;
      return { metadata, pending: newPending };
    }

    // No match in pending — add as new staged entry
    return { metadata, pending: [...pending, entry] };
  }

  /**
   * Commit a conversation insight to insights_metadata, enforcing the conversation cap.
   * Never evicts from the question pool.
   */
  private commitToConversationPool(
    entry: InsightMetadataEntry,
    metadata: InsightMetadataEntry[]
  ): InsightMetadataEntry[] {
    let convEntries = metadata.filter(e => e.source_type === 'conversation');
    const questionEntries = metadata.filter(e => e.source_type === 'question');

    // Check for duplicate content before committing
    const existingIdx = convEntries.findIndex(
      e => e.content.toLowerCase() === entry.content.toLowerCase()
    );

    if (existingIdx >= 0) {
      const now = new Date().toISOString();
      convEntries[existingIdx] = {
        ...convEntries[existingIdx],
        source_count: (convEntries[existingIdx].source_count || 1) + 1,
        last_reinforced: now,
        confidence: Math.min(convEntries[existingIdx].confidence + 0.05, 1.0),
      };
    } else {
      if (convEntries.length >= MEMORY_CAPS.CONVERSATION_FACTS_MAX) {
        convEntries = this.memoryManager.evictLowestFromPool(convEntries);
      }
      convEntries.push({ ...entry, source_type: 'conversation' });
    }

    return [...questionEntries, ...convEntries];
  }

  // ============================================
  // PRIVATE: INSIGHT CONVERSION
  // ============================================

  /**
   * Convert raw ExtractedInsights to typed InsightMetadataEntry objects.
   * Filters entries below confidence/importance thresholds before returning.
   */
  private extractedInsightsToEntries(
    insights: ExtractedInsights,
    chatId: string,
    sourceType: 'question' | 'conversation',
    now: string
  ): InsightMetadataEntry[] {
    const entries: InsightMetadataEntry[] = [];
    const scores = insights.semantic_importance_scores || {};

    // Interests
    for (const [topic, confidence] of Object.entries(insights.interests || {})) {
      if (confidence < 0.6) continue;
      const importance = scores[topic] ?? scores[`interest_${topic}`] ?? 0.6;
      entries.push({
        id: randomUUID(),
        content: topic,
        category: 'interest',
        source_type: sourceType,
        source_id: chatId,
        confidence,
        semantic_importance: importance,
        source_count: 1,
        first_identified: now,
        last_reinforced: now,
      });
    }

    // Beliefs
    for (const [domain, belief] of Object.entries(insights.beliefs || {})) {
      const importance = scores[domain] ?? scores[`belief_${domain}`] ?? 0.7;
      if (importance < 0.75) continue;
      entries.push({
        id: randomUUID(),
        content: `${domain}: ${belief}`,
        category: 'belief',
        source_type: sourceType,
        source_id: chatId,
        confidence: 0.75,
        semantic_importance: importance,
        source_count: 1,
        first_identified: now,
        last_reinforced: now,
      });
    }

    // Behavioral patterns
    for (const pattern of insights.behavioral_patterns || []) {
      const importance = scores[pattern] ?? 0.6;
      entries.push({
        id: randomUUID(),
        content: pattern,
        category: 'pattern',
        source_type: sourceType,
        source_id: chatId,
        confidence: 0.7,
        semantic_importance: importance,
        source_count: 1,
        first_identified: now,
        last_reinforced: now,
      });
    }

    return entries;
  }

  // ============================================
  // PRIVATE: CONTENT SIMILARITY
  // ============================================

  /**
   * Cheap keyword-overlap check for deduplication in pending_insights staging.
   * Returns true if two content strings share at least 2 meaningful words.
   */
  private contentOverlaps(a: string, b: string): boolean {
    const stopWords = new Set(['the', 'is', 'in', 'and', 'or', 'to', 'of', 'that', 'it', 'on', 'for', 'with']);
    const tokenize = (s: string) =>
      new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w)));

    const wordsA = tokenize(a);
    const wordsB = tokenize(b);

    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }
    return overlap >= 2;
  }

  // ============================================
  // PRIVATE: HELPERS
  // ============================================

  private async getUserChatsForDate(userId: string, date: Date): Promise<Chat[]> {
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
    console.log(
      `[ChatExtractor] Saved extraction history for chat ${chatId} ` +
      `(quality: ${qualityScore.toFixed(2)}, messages: ${messageCount}, ${processingTime}ms)`
    );
  }

  private async updateUserStats(
    userId: string,
    chatsAnalyzed: number,
    chatsExtracted: number
  ): Promise<void> {
    const profile = await this.storage.getMemoryProfile(userId);
    if (!profile) return;

    await this.storage.updateMemoryProfile(userId, {
      chat_extractions_count: (profile.chat_extractions_count || 0) + chatsExtracted,
    });
  }
}
