import {
  DailyQuestion,
  DailyQuestionForUser,
  QuestionResponse,
  MemoryProfile,
  Chat,
  ChatMessage,
  UserProgress,
  RoutineTask,
  RoutineGoal,
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

  /**
   * Pin a chat (max 5 pinned chats per user)
   */
  pinChat(chatId: string): Promise<Chat>;

  /**
   * Unpin a chat
   */
  unpinChat(chatId: string): Promise<Chat>;

  /**
   * Delete a chat and all its messages
   */
  deleteChat(chatId: string, userId: string): Promise<void>;

  // ============================================
  // ROUTINE OPERATIONS
  // ============================================

  /**
   * Create a routine task for a specific day
   */
  createRoutineTask(
    userId: string,
    text: string,
    type: 'non-negotiable' | 'nice-to-have',
    dayOfWeek: string
  ): Promise<RoutineTask>;

  /**
   * Get all tasks for a specific day
   */
  getRoutineTasksForDay(userId: string, dayOfWeek: string): Promise<RoutineTask[]>;

  /**
   * Update task completion status
   */
  updateRoutineTaskCompletion(taskId: string, userId: string, completed: boolean): Promise<RoutineTask>;

  /**
   * Delete a routine task
   */
  deleteRoutineTask(taskId: string, userId: string): Promise<void>;

  /**
   * Create a routine goal (weekly or monthly)
   */
  createRoutineGoal(userId: string, text: string, type: 'weekly' | 'monthly'): Promise<RoutineGoal>;

  /**
   * Get current week's goals
   */
  getWeeklyGoals(userId: string): Promise<RoutineGoal[]>;

  /**
   * Get current month's goals
   */
  getMonthlyGoals(userId: string): Promise<RoutineGoal[]>;

  /**
   * Update goal completion status
   */
  updateRoutineGoalCompletion(goalId: string, userId: string, completed: boolean): Promise<RoutineGoal>;

  /**
   * Delete a routine goal
   */
  deleteRoutineGoal(goalId: string, userId: string): Promise<void>;

  /**
   * Reset all daily task completions to false (Monday reset)
   */
  resetAllTaskCompletions(): Promise<void>;

  /**
   * Reset all weekly goal completions to false (Monday reset)
   * Does NOT delete goals - only unchecks them
   */
  resetAllWeeklyGoalCompletions(): Promise<void>;

  /**
   * Reset all monthly goal completions to false (1st of month reset)
   * Does NOT delete goals - only unchecks them
   */
  resetAllMonthlyGoalCompletions(): Promise<void>;

  /**
   * Update all weekly goals to current week number and year
   * Called during Monday reset to keep goals visible
   */
  updateWeeklyGoalsToCurrentWeek(): Promise<void>;

  /**
   * Update all monthly goals to current month and year
   * Called during 1st of month reset to keep goals visible
   */
  updateMonthlyGoalsToCurrentMonth(): Promise<void>;

  // ============================================
  // QUOTE INTERACTION OPERATIONS
  // ============================================

  /**
   * Upsert a user's interaction with a quote
   */
  upsertQuoteInteraction(
    userId: string,
    quoteId: number,
    interactionType: 'like' | 'dislike' | 'none'
  ): Promise<void>;

  /**
   * Get total like count for a specific quote
   */
  getQuoteLikeCount(quoteId: number): Promise<number>;

  /**
   * Get like counts for all quotes
   */
  getAllQuoteLikeCounts(): Promise<Record<number, number>>;

  /**
   * Get a user's interaction type for a specific quote
   */
  getUserQuoteInteraction(userId: string, quoteId: number): Promise<string | null>;

  /**
   * Get all quote IDs that a user has disliked
   */
  getUserDislikedQuotes(userId: string): Promise<number[]>;

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Close database connection (if applicable)
   */
  close(): Promise<void>;
}
