// Types for chat functionality

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  chat_type: 'question' | 'general';
  linked_question_id: string | null;
  pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface ChatsListApiResponse {
  success: boolean;
  data: Chat[];
}

export interface CreateChatApiResponse {
  success: boolean;
  data: Chat;
}

export interface ChatMessagesApiResponse {
  success: boolean;
  data: ChatMessage[];
}

export interface SendMessageApiResponse {
  success: boolean;
  data: {
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    contextLoaded?: boolean;
  };
}

// For optimistic updates - temporary message before API confirms
export interface OptimisticMessage extends Omit<ChatMessage, 'id'> {
  id: string; // Will be a temporary ID like 'temp-123'
  isOptimistic?: boolean;
}
