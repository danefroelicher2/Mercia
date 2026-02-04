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
  profile_completeness: number;
  questions_answered: number;
  total_interactions: number;
  last_updated: string;
  created_at: string;
}

export interface MemoryProfileApiResponse {
  success: boolean;
  data: MemoryProfile;
}
