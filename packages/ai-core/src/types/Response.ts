export interface QuestionResponse {
  id: string;
  user_id: string;
  question_id: string;
  response_text: string;
  extracted_insights: ExtractedInsights;
  answered_at: Date;
  skip_count: number;
}

export interface ExtractedInsights {
  core_values?: string[];
  beliefs?: Record<string, string>;
  key_quote?: string;
  insight_summary?: string;
  topics_mentioned?: string[];
  emotional_tone?: string;
}
