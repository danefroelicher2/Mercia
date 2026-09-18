import {
  Chat,
  ChatMessage,
  RoutineTask,
  TimeOfDay,
  RoutineGoal,
} from '../../types';

export interface GymWorkoutLog {
  id: string;
  user_id: string;
  day_of_week: string;
  workout_group: string;
  notes: string;
  logged_date: string;
  week_number: number;
  year: number;
  is_rest: boolean;
  created_at: string;
  updated_at: string;
}

export interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
}

export interface GymMemoryGroup {
  workout_group: string;
  entries: GymMemoryEntry[];
}

export interface GymPREntry {
  id: string;
  user_id: string;
  muscle_group: string;
  exercise_name: string;
  weight: number;
  reps: number;
  created_at: string;
}

export interface GymPRGroup {
  muscle_group: string;
  entries: GymPREntry[];
}

/**
 * Storage Adapter Interface
 * Implement this for any database (Postgres, SQLite, MongoDB, etc.)
 */
export interface StorageAdapter {
  // ============================================
  // CHAT OPERATIONS
  // ============================================

  /**
   * Create a new chat
   * @param userId - User creating the chat
   * @param title - Chat title (optional)
   */
  createChat(userId: string, title?: string): Promise<Chat>;

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

  /**
   * Get a single chat record by id
   * Returns null if not found
   */
  getChat(chatId: string): Promise<Chat | null>;

  // ============================================
  // ROUTINE OPERATIONS
  // ============================================

  /**
   * Create a routine task for a specific day
   */
  createRoutineTask(
    userId: string,
    text: string,
    type: 'today',
    dayOfWeek: string,
    targetCount?: number,
    timeOfDay?: TimeOfDay,
    scheduledTime?: string | null
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
   * Tick a routine task's countdown: decrements current_count, completing at 0.
   * Mirrors tickRoutineGoal. Returns the transition so callers can fire
   * completion side-effects (activity log, achievements, history).
   */
  tickRoutineTask(taskId: string, userId: string): Promise<{ task: RoutineTask; becameCompleted: boolean; becameUncompleted: boolean }>;

  /**
   * Edit a task's text, time-of-day section, countdown target, and/or
   * scheduled time (null clears it). Changing the target keeps the taps
   * already made this week.
   */
  updateRoutineTask(
    taskId: string,
    userId: string,
    changes: { text?: string; timeOfDay?: TimeOfDay; targetCount?: number; scheduledTime?: string | null }
  ): Promise<RoutineTask>;

  /**
   * Delete a routine task
   */
  deleteRoutineTask(taskId: string, userId: string): Promise<void>;

  /**
   * Delete several of a user's routine tasks at once (ids not owned are ignored)
   */
  deleteRoutineTasks(taskIds: string[], userId: string): Promise<void>;

  /**
   * Delete several of a user's routine goals at once (ids not owned are ignored)
   */
  deleteRoutineGoals(goalIds: string[], userId: string): Promise<void>;

  /**
   * Wipe the Routine tab: every task (all days), every goal, and the notepad.
   * Completion history is kept.
   */
  clearRoutine(userId: string): Promise<void>;

  /**
   * Create a routine goal (weekly, monthly, or yearly). targetCount defaults to 1.
   */
  createRoutineGoal(userId: string, text: string, type: 'weekly' | 'monthly' | 'yearly', targetCount?: number): Promise<RoutineGoal>;

  /**
   * Get current week's goals
   */
  getWeeklyGoals(userId: string): Promise<RoutineGoal[]>;

  /**
   * Get current month's goals
   */
  getMonthlyGoals(userId: string): Promise<RoutineGoal[]>;

  /**
   * Get all yearly goals (persist indefinitely, no reset)
   */
  getYearlyGoals(userId: string): Promise<RoutineGoal[]>;

  /**
   * Tick a goal's progress by one step: decrements current_count toward 0
   * (marking it completed when it reaches 0), or increments back toward
   * target_count if already at 0 (undoing one step). Returns the updated
   * goal plus whether this call caused the true -> completed transition.
   */
  tickRoutineGoal(goalId: string, userId: string): Promise<{ goal: RoutineGoal; becameCompleted: boolean; becameUncompleted: boolean }>;

  /**
   * Delete a routine goal
   */
  deleteRoutineGoal(goalId: string, userId: string): Promise<void>;

  /**
   * Bulk update sort_order for tasks (ordered list of IDs)
   */
  reorderRoutineTasks(userId: string, orderedIds: string[]): Promise<void>;

  /**
   * Bulk update sort_order for goals (ordered list of IDs)
   */
  reorderRoutineGoals(userId: string, orderedIds: string[]): Promise<void>;

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
  // GYM WORKOUT LOG OPERATIONS
  // ============================================

  /**
   * Weekly gym-day target (1-7) stored on user_profiles. Null = user never set
   * one; callers apply the app default and label it as such.
   */
  getGymTargetDays(userId: string): Promise<number | null>;
  setGymTargetDays(userId: string, targetDays: number): Promise<number>;

  getGymWorkoutLog(userId: string, dayOfWeek: string, weekNumber: number, year: number): Promise<GymWorkoutLog | null>;
  upsertGymWorkoutLog(userId: string, dayOfWeek: string, workoutGroup: string, notes: string, weekNumber: number, year: number): Promise<GymWorkoutLog>;
  /**
   * Mark/unmark a day as an intentional rest day. Rest days are not gym
   * sessions (they don't count toward the weekly target or create memory
   * entries) but tell the coach the user rested on purpose, not skipped.
   */
  setGymRestDay(userId: string, dayOfWeek: string, weekNumber: number, year: number, rest: boolean): Promise<GymWorkoutLog | null>;
  getGymWorkoutLogForWeek(userId: string, weekNumber: number, year: number): Promise<GymWorkoutLog[]>;
  resetGymWorkoutLogs(): Promise<void>;

  // ============================================
  // GYM MEMORY OPERATIONS
  // ============================================

  getGymMemory(userId: string): Promise<GymMemoryGroup[]>;
  /** Archived (aged-out) sessions, grouped — the permanent gym history. */
  getGymMemoryArchive(userId: string): Promise<GymMemoryGroup[]>;
  getGymMemoryByGroup(userId: string, workoutGroup: string): Promise<GymMemoryEntry[]>;
  saveGymMemoryEntry(userId: string, workoutGroup: string, notes: string, sessionDate: string): Promise<void>;
  setGymMemoryPinned(userId: string, entryId: string, pinned: boolean): Promise<GymMemoryEntry>;
  deleteGymMemoryGroup(userId: string, workoutGroup: string): Promise<void>;
  deleteGymMemoryEntry(userId: string, entryId: string): Promise<void>;
  getGymPRs(userId: string): Promise<GymPRGroup[]>;
  saveGymPR(userId: string, muscleGroup: string, exerciseName: string, weight: number, reps: number): Promise<GymPREntry>;
  deleteGymPREntry(userId: string, entryId: string): Promise<void>;
  deleteGymPRGroup(userId: string, muscleGroup: string): Promise<void>;

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Close database connection (if applicable)
   */
  close(): Promise<void>;
}
