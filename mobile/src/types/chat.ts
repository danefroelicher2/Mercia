// Types for chat functionality

export interface Chat {
  id: string;
  user_id: string;
  title: string;
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

// Shared response shape for /api/chat/daily-outlook and /api/chat/day-in-review —
// both find-or-create a chat scoped to "today" and return it; the opening
// message (if newly generated) is fetched separately via the messages endpoint.
export interface CreateDailyChatApiResponse {
  success: boolean;
  data: {
    chat: Chat;
  };
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
  };
}

// For optimistic updates - temporary message before API confirms
export interface OptimisticMessage extends Omit<ChatMessage, 'id'> {
  id: string; // Will be a temporary ID like 'temp-123'
  isOptimistic?: boolean;
}
