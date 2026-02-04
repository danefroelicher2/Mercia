import { MemoryProfile } from './Memory';
import { QuestionResponse } from './Response';

export interface ChatMessage {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: Date;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  chat_type: 'question' | 'general';
  linked_question_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChatContext {
  memory_profile: Partial<MemoryProfile>;
  recent_questions: QuestionResponse[];
  conversation_history: ChatMessage[];
}
