import {
  DailyQuestion,
  DailyQuestionForUser,
  QuestionResponse,
  MemoryProfile,
  Chat,
  ChatMessage,
  UserProgress,
} from '../../types';

/**
 * Storage Adapter Interface
 * Implement this for any database (Postgres, SQLite, MongoDB, etc.)
 */
export interface StorageAdapter {
  // ============================================
  // QUESTION OPERATIONS
  // ============================================

  /**
   * Get today's unanswered question for a user
   * Returns null if all questions answered or no questions available
   */
  getDailyQuestionForUser(userId: string): Promise<DailyQuestionForUser | null>;

  /**
   * Save user's answer to a question
   */
  saveQuestionResponse(
    userId: string,
    questionId: string,
    responseText: string
  ): Promise<QuestionResponse>;

  /**
   * Skip a question (increment skip count)
   * After 3 skips, auto-marks as answered
   */
  skipQuestion(userId: string, questionId: string, date: Date): Promise<void>;

  /**
   * Get user's question answering statistics
   */
  getUserQuestionStats(userId: string): Promise<UserProgress>;

  /**
   * Get user's question history (answered questions)
   */
  getQuestionHistory(userId: string, limit?: number): Promise<QuestionResponse[]>;

  /**
   * Get a single question by ID
   */
  getQuestionById(questionId: string): Promise<DailyQuestion | null>;

  // ============================================
  // MEMORY PROFILE OPERATIONS
  // ============================================

  /**
   * Get user's memory profile
   * Returns null if profile doesn't exist yet
   */
  getMemoryProfile(userId: string): Promise<MemoryProfile | null>;

  /**
   * Update or create user's memory profile
   */
  updateMemoryProfile(
    userId: string,
    updates: Partial<MemoryProfile>
  ): Promise<MemoryProfile>;

  // ============================================
  // CHAT OPERATIONS
  // ============================================

  /**
   * Create a new chat
   * @param userId - User creating the chat
   * @param title - Chat title (optional)
   * @param chatType - 'question' for question-based chats, 'general' for free-form (default)
   * @param linkedQuestionId - UUID of the linked question (for question-based chats)
   */
  createChat(
    userId: string,
    title?: string,
    chatType?: 'question' | 'general',
    linkedQuestionId?: string | null
  ): Promise<Chat>;

  /**
   * Get user's chats
   */
  getUserChats(userId: string, limit?: number): Promise<Chat[]>;

  /**
   * Get messages for a specific chat
   */
  getChatMessages(chatId: string, limit?: number): Promise<ChatMessage[]>;

  /**
   * Save a chat message
   */
  saveChatMessage(
    chatId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<ChatMessage>;

  /**
   * Update chat's updated_at timestamp
   */
  touchChat(chatId: string): Promise<void>;

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Close database connection (if applicable)
   */
  close(): Promise<void>;
}
