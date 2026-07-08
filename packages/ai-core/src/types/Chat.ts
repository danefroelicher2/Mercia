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
  pinned: boolean;
  pinned_at: string | null;
  summarized: boolean;
  created_at: Date;
  updated_at: Date;
}
