export interface MemoryProfile {
  user_id: string;

  // Core Identity
  core_values: string[];
  beliefs: Record<string, any>;
  interests: Record<string, number>; // topic -> confidence score (0-1)

  // Communication Preferences
  communication_style: CommunicationStyle;

  // Supporting Evidence
  supporting_quotes: SupportingQuote[];

  // Metadata
  profile_completeness: number; // 0.0 to 1.0
  questions_answered: number;
  chat_messages_analyzed: number;        // For future chat extraction (Phase 2B)
  chat_extractions_count: number;        // Number of times chat insights extracted (Phase 2B)
  insights_metadata: any[];              // Insight objects with scoring data for weighted eviction
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
