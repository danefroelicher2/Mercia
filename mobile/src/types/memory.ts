// Memory Profile Types for Oasis AI mobile app

export interface CommunicationStyle {
  tone?: 'formal' | 'casual' | 'mixed';
  length?: 'concise' | 'detailed' | 'mixed';
  technical_level?: 'beginner' | 'intermediate' | 'expert';
}

export interface SupportingQuote {
  quote: string;
  source_type: 'question' | 'chat';
  source_id: string;
  context: string;
  timestamp: string;
  confidence: number;
}

export interface MemoryProfile {
  user_id: string;
  core_values: string[];
  beliefs: Record<string, string>;
  interests: Record<string, number>;
  communication_style: CommunicationStyle;
  supporting_quotes: SupportingQuote[];
  insights_metadata: any[];
  profile_completeness: number;
  questions_answered: number;
  chat_messages_analyzed: number;
  chat_extractions_count: number;
  // Dual-source fields
  question_facts_count: number;
  conversation_facts_count: number;
  question_facts_completeness: number;
  conversation_facts_completeness: number;
  total_interactions: number;
  last_updated: string;
  created_at: string;
}

export interface MemoryProfileApiResponse {
  success: boolean;
  data: MemoryProfile;
}

export interface InsightEntry {
  id: string;
  content: string;
  category: 'value' | 'belief' | 'interest' | 'pattern' | 'goal' | 'quote';
  source_type: 'question' | 'conversation';
  source_id: string;
  confidence: number;
  semantic_importance: number;
  source_count: number;
  first_identified: string;
  last_reinforced: string;
}

export interface GroupedInsightsApiResponse {
  success: boolean;
  data: {
    from_questions: InsightEntry[];
    from_conversations: InsightEntry[];
    question_facts_count: number;
    question_facts_max: number;
    conversation_facts_count: number;
    conversation_facts_max: number;
  };
}
