export interface InsightMetadataEntry {
  id: string;                   // UUID
  content: string;              // Human-readable fact, e.g. "Values family above career"
  category: 'value' | 'belief' | 'interest' | 'pattern' | 'goal' | 'quote';
  source_type: 'question' | 'conversation';
  source_id: string;            // question_id or chat_id
  confidence: number;           // 0.0 to 1.0
  semantic_importance: number;  // 0.0 to 1.0
  source_count: number;         // How many times this insight has been observed
  first_identified: string;     // ISO timestamp
  last_reinforced: string;      // ISO timestamp
}

export interface MemoryProfile {
  user_id: string;

  // Core Identity (rebuilt from insights_metadata for backwards-compat & LLM context)
  core_values: string[];
  beliefs: Record<string, any>;
  interests: Record<string, number>; // topic -> confidence score (0-1)

  // Communication Preferences
  communication_style: CommunicationStyle;

  // Supporting Evidence
  supporting_quotes: SupportingQuote[];

  // Dual-source insight store
  insights_metadata: InsightMetadataEntry[];

  // Conversation insights awaiting commit threshold — never sent to clients
  pending_insights: InsightMetadataEntry[];

  // Per-pool counts and completeness (0.0–1.0)
  question_facts_count: number;
  conversation_facts_count: number;
  question_facts_completeness: number;
  conversation_facts_completeness: number;

  // Legacy metadata
  profile_completeness: number; // average of the two completeness values
  questions_answered: number;
  chat_messages_analyzed: number;
  chat_extractions_count: number;
  total_interactions: number;
  last_updated: Date;
  created_at: Date;
}

export interface CommunicationStyle {
  tone?: 'formal' | 'casual' | 'mixed';
  length?: 'concise' | 'detailed' | 'mixed';
  technical_level?: 'beginner' | 'intermediate' | 'expert';
}

export interface SupportingQuote {
  quote: string;
  source_type: 'question' | 'chat';
  source_id: string;
  context: string; // Why this quote matters
  timestamp: Date;
  confidence: number; // 0-1 how sure we are this matters
}
