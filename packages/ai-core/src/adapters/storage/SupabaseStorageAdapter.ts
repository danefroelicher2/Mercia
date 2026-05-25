import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageAdapter, GymWorkoutLog, GymMemoryEntry, GymMemoryGroup, GymPREntry, GymPRGroup } from './StorageAdapter';
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

const DAY_OFFSETS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

// Returns the calendar date (YYYY-MM-DD) for a given day of the week within an ISO week+year.
function getISOWeekDayDate(dayOfWeek: string, weekNumber: number, year: number): string {
  // Find Jan 4 of the year, which is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const jan4DayOfWeek = (jan4.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4DayOfWeek + (weekNumber - 1) * 7);
  const offset = DAY_OFFSETS[dayOfWeek.toLowerCase()] ?? 0;
  const result = new Date(monday);
  result.setDate(monday.getDate() + offset);
  return result.toISOString().split('T')[0];
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient<any, 'oasis'>; // ← Specify schema type

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
      db: {
        schema: 'oasis',
      },
    });
  }

  // ============================================
  // QUESTION OPERATIONS
  // ============================================

  async getDailyQuestionForUser(userId: string): Promise<DailyQuestionForUser | null> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Check if user has an unanswered, not-yet-skipped-today question assigned today
      const { data: todayAssignments } = await this.client
        .from('user_daily_questions')
        .select('question_id, skipped_on')
        .eq('user_id', userId)
        .eq('assigned_date', today)
        .eq('answered', false)
        .order('created_at', { ascending: false });

      // Find the most recent assignment that hasn't been skipped today
      const existingQuestion = (todayAssignments || []).find(
        a => !(a.skipped_on || []).includes(today)
      );

      if (existingQuestion) {
        const { data: question } = await this.client
          .from('daily_questions')
          .select('*')
          .eq('id', existingQuestion.question_id)
          .single();

        return {
          question_id: question.id,
          question_text: question.question_text,
          category: question.category,
          level: question.level || 1,
          assigned_date: new Date(today),
          skip_count: existingQuestion.skipped_on?.length || 0,
        };
      }

      // Get user's current question level
      const { data: profileData } = await this.client
        .from('user_memory_profiles')
        .select('question_level')
        .eq('user_id', userId)
        .maybeSingle();
      const userLevel = profileData?.question_level || 1;

      // Get answered question IDs
      const { data: answeredIds } = await this.client
        .from('user_question_responses')
        .select('question_id')
        .eq('user_id', userId);

      const answeredQuestionIds = answeredIds?.map(r => r.question_id) || [];

      // Query questions at the user's current level only
      let query = this.client
        .from('daily_questions')
        .select('*')
        .eq('active', true)
        .eq('level', userLevel);

      if (answeredQuestionIds.length > 0) {
        query = query.not('id', 'in', `(${answeredQuestionIds.join(',')})`);
      }

      const { data: questions } = await query.limit(20);

      if (!questions || questions.length === 0) {
        return null; // All questions at this level answered
      }

      // Pick random question from the level pool
      const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

      // Assign to user
      await this.client
        .from('user_daily_questions')
        .insert({
          user_id: userId,
          question_id: randomQuestion.id,
          assigned_date: today,
          answered: false,
        });

      return {
        question_id: randomQuestion.id,
        question_text: randomQuestion.question_text,
        category: randomQuestion.category,
        level: randomQuestion.level || 1,
        assigned_date: new Date(today),
        skip_count: 0,
      };
    } catch (error) {
      console.error('Error getting daily question:', error);
      return null;
    }
  }

  async saveQuestionResponse(
    userId: string,
    questionId: string,
    responseText: string
  ): Promise<QuestionResponse> {
    // Insert response
    const { data: responseData, error: responseError } = await this.client
      .from('user_question_responses')
      .insert({
        user_id: userId,
        question_id: questionId,
        response_text: responseText,
        answered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (responseError) {
      throw new Error(`Failed to save response: ${responseError.message}`);
    }

    // Mark question as answered
    await this.client
      .from('user_daily_questions')
      .update({ answered: true })
      .eq('user_id', userId)
      .eq('question_id', questionId);

    // questions_answered is incremented by MemoryManager.processQuestionResponse()
    // which is always called after this. Do not call incrementQuestionCount() here.

    return responseData;
  }

  async skipQuestion(userId: string, questionId: string, date: Date): Promise<{ can_get_new: boolean }> {
    const today = date.toISOString().split('T')[0];

    // Update today's assignment row for this specific question
    const { data: todayAssignment } = await this.client
      .from('user_daily_questions')
      .select('id, skipped_on')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .eq('assigned_date', today)
      .maybeSingle();

    if (todayAssignment) {
      const skippedDates = [...(todayAssignment.skipped_on || []), today];
      await this.client
        .from('user_daily_questions')
        .update({ skipped_on: skippedDates })
        .eq('id', todayAssignment.id);
    }

    // Count total lifetime skips for this question across all days
    const { data: allAssignments } = await this.client
      .from('user_daily_questions')
      .select('skipped_on')
      .eq('user_id', userId)
      .eq('question_id', questionId);

    const totalSkips = (allAssignments || []).reduce(
      (sum, a) => sum + (a.skipped_on?.length || 0), 0
    );

    // After 2 lifetime skips, permanently exclude from the question pool
    if (totalSkips >= 2) {
      if (todayAssignment) {
        await this.client
          .from('user_daily_questions')
          .update({ answered: true })
          .eq('id', todayAssignment.id);
      }
      const { data: existingResponse } = await this.client
        .from('user_question_responses')
        .select('id')
        .eq('user_id', userId)
        .eq('question_id', questionId)
        .maybeSingle();
      if (!existingResponse) {
        await this.client.from('user_question_responses').insert({
          user_id: userId,
          question_id: questionId,
          response_text: '[Skipped twice — permanently excluded]',
          skip_count: totalSkips,
        });
      }
    }

    // Count how many distinct questions the user has skipped today
    const { data: todayRows } = await this.client
      .from('user_daily_questions')
      .select('skipped_on')
      .eq('user_id', userId)
      .eq('assigned_date', today);

    const todaySkipCount = (todayRows || []).filter(
      row => (row.skipped_on || []).includes(today)
    ).length;

    // User can get a replacement question only on their first skip of the day
    return { can_get_new: todaySkipCount < 2 };
  }
  async getUserQuestionStats(userId: string): Promise<UserProgress> {
    // Count answered questions
    const { data: answeredData, error: answeredError } = await this.client
      .from('user_question_responses')
      .select('id')
      .eq('user_id', userId);

    // Count total active questions
    const { data: totalData, error: totalError } = await this.client
      .from('daily_questions')
      .select('id')
      .eq('active', true);

    console.log('DEBUG - answered rows:', answeredData?.length);
    console.log('DEBUG - total rows:', totalData?.length);
    console.log('DEBUG - errors:', answeredError, totalError);

    const answered = answeredData?.length || 0;
    const total = totalData?.length || 0;

    return {
      answered,
      total,
      percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
      streak_days: 0,
    };
  }
  async getQuestionHistory(userId: string, limit: number = 50): Promise<QuestionResponse[]> {
    const { data, error } = await this.client
      .from('user_question_responses')
      .select('*')
      .eq('user_id', userId)
      .order('answered_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting question history:', error);
      return [];
    }

    return data || [];
  }

  async getQuestionById(questionId: string): Promise<DailyQuestion | null> {
    const { data, error } = await this.client
      .from('daily_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (error) {
      console.error('Error getting question by ID:', error);
      return null;
    }

    return data;
  }

  // ============================================
  // MEMORY PROFILE OPERATIONS
  // ============================================

  async getMemoryProfile(userId: string): Promise<MemoryProfile | null> {
    const { data, error } = await this.client
      .from('user_memory_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting memory profile:', error);
      return null;
    }

    return data || null;
  }

  async updateMemoryProfile(
    userId: string,
    updates: Partial<MemoryProfile>
  ): Promise<MemoryProfile> {
    const { data, error } = await this.client
      .from('user_memory_profiles')
      .upsert({
        user_id: userId,
        ...updates,
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update memory profile: ${error.message}`);
    }

    return data;
  }

  // ============================================
  // CHAT OPERATIONS
  // ============================================

  async createChat(
    userId: string,
    title: string = 'New Chat',
    chatType: 'question' | 'general' = 'general',
    linkedQuestionId: string | null = null
  ): Promise<Chat> {
    const { data, error } = await this.client
      .from('chats')
      .insert({
        user_id: userId,
        title,
        chat_type: chatType,
        linked_question_id: linkedQuestionId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create chat: ${error.message}`);
    }

    return data;
  }

  async getUserChats(userId: string, limit: number = 50): Promise<Chat[]> {
    const { data, error } = await this.client
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .order('pinned', { ascending: false })  // Pinned first
      .order('updated_at', { ascending: false })  // Then by recent
      .limit(limit);

    if (error) {
      console.error('Error getting user chats:', error);
      return [];
    }

    return data || [];
  }

  async getChatMessages(chatId: string, limit: number = 100): Promise<ChatMessage[]> {
    const { data, error } = await this.client
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error getting chat messages:', error);
      return [];
    }

    return data || [];
  }

  async saveChatMessage(
    chatId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<ChatMessage> {
    const { data, error } = await this.client
      .from('chat_messages')
      .insert({
        chat_id: chatId,
        user_id: userId,
        role,
        content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save message: ${error.message}`);
    }

    // Update chat's updated_at
    await this.touchChat(chatId);

    return data;
  }

  async touchChat(chatId: string): Promise<void> {
    await this.client
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId);
  }

  async pinChat(chatId: string): Promise<Chat> {
    const { data, error } = await this.client
      .from('chats')
      .update({
        pinned: true,
        pinned_at: new Date().toISOString(),
      })
      .eq('id', chatId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to pin chat: ${error.message}`);
    }

    return data;
  }

  async unpinChat(chatId: string): Promise<Chat> {
    const { data, error } = await this.client
      .from('chats')
      .update({
        pinned: false,
        pinned_at: null,
      })
      .eq('id', chatId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to unpin chat: ${error.message}`);
    }

    return data;
  }

  async deleteChat(chatId: string, userId: string): Promise<void> {
    // First delete all messages
    const { error: messagesError } = await this.client
      .from('chat_messages')
      .delete()
      .eq('chat_id', chatId);

    if (messagesError) {
      throw new Error(`Failed to delete messages: ${messagesError.message}`);
    }

    // Then delete the chat
    const { error: chatError } = await this.client
      .from('chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);  // Security: only delete own chats

    if (chatError) {
      throw new Error(`Failed to delete chat: ${chatError.message}`);
    }
  }

  async getChat(chatId: string): Promise<Chat | null> {
    const { data, error } = await this.client
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting chat:', error);
      return null;
    }

    return data || null;
  }

  async markChatSummarized(chatId: string): Promise<void> {
    await this.client
      .from('chats')
      .update({ summarized: true })
      .eq('id', chatId);
  }

  // ============================================
  // UTILITY
  // ============================================

  private async incrementQuestionCount(userId: string): Promise<void> {
    const profile = await this.getMemoryProfile(userId);
    const newCount = (profile?.questions_answered || 0) + 1;

    // Get total questions to calculate completeness
    const { count: totalCount } = await this.client
      .from('daily_questions')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const total = totalCount || 10;

    await this.updateMemoryProfile(userId, {
      questions_answered: newCount,
      profile_completeness: Math.min(newCount / total, 1.0),
    });
  }

  // ============================================
  // ROUTINE OPERATIONS
  // ============================================

  async createRoutineTask(
    userId: string,
    text: string,
    type: 'non-negotiable' | 'nice-to-have',
    dayOfWeek: string
  ): Promise<RoutineTask> {
    const { data: maxData } = await this.client
      .from('routine_tasks')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .eq('type', type)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxData?.sort_order ?? -1) + 1;

    const { data, error } = await this.client
      .from('routine_tasks')
      .insert({
        user_id: userId,
        text,
        type,
        day_of_week: dayOfWeek,
        completed: false,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create routine task: ${error.message}`);
    }

    return data;
  }

  async getRoutineTasksForDay(userId: string, dayOfWeek: string): Promise<RoutineTask[]> {
    const { data, error } = await this.client
      .from('routine_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to get routine tasks: ${error.message}`);
    }

    return data || [];
  }

  async updateRoutineTaskCompletion(
    taskId: string,
    userId: string,
    completed: boolean
  ): Promise<RoutineTask> {
    const { data, error } = await this.client
      .from('routine_tasks')
      .update({ completed })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update task completion: ${error.message}`);
    }

    return data;
  }

  async deleteRoutineTask(taskId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('routine_tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete routine task: ${error.message}`);
    }
  }

  async createRoutineGoal(
    userId: string,
    text: string,
    type: 'weekly' | 'monthly'
  ): Promise<RoutineGoal> {
    const now = new Date();
    const year = now.getFullYear();

    let weekNumber = null;
    let month = null;

    if (type === 'weekly') {
      weekNumber = this.getISOWeek(now);
    } else {
      month = now.getMonth() + 1; // 1-12
    }

    const { data: maxData } = await this.client
      .from('routine_goals')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('type', type)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = (maxData?.sort_order ?? -1) + 1;

    const { data, error } = await this.client
      .from('routine_goals')
      .insert({
        user_id: userId,
        text,
        type,
        week_number: weekNumber,
        month,
        year,
        completed: false,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create routine goal: ${error.message}`);
    }

    return data;
  }

  async getWeeklyGoals(userId: string): Promise<RoutineGoal[]> {
    const { data, error } = await this.client
      .from('routine_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'weekly')
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to get weekly goals: ${error.message}`);
    }

    return data || [];
  }

  async getMonthlyGoals(userId: string): Promise<RoutineGoal[]> {
    const { data, error } = await this.client
      .from('routine_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'monthly')
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to get monthly goals: ${error.message}`);
    }

    return data || [];
  }

  async getYearlyGoals(userId: string): Promise<RoutineGoal[]> {
    const { data, error } = await this.client
      .from('routine_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'yearly')
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to get yearly goals: ${error.message}`);
    }

    return data || [];
  }

  async updateRoutineGoalCompletion(
    goalId: string,
    userId: string,
    completed: boolean
  ): Promise<RoutineGoal> {
    const { data, error } = await this.client
      .from('routine_goals')
      .update({ completed })
      .eq('id', goalId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update goal completion: ${error.message}`);
    }

    return data;
  }

  async deleteRoutineGoal(goalId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('routine_goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete routine goal: ${error.message}`);
    }
  }

  async reorderRoutineTasks(userId: string, orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.client
          .from('routine_tasks')
          .update({ sort_order: index })
          .eq('id', id)
          .eq('user_id', userId)
      )
    );
  }

  async reorderRoutineGoals(userId: string, orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.client
          .from('routine_goals')
          .update({ sort_order: index })
          .eq('id', id)
          .eq('user_id', userId)
      )
    );
  }

  async resetAllTaskCompletions(): Promise<void> {
    const { error } = await this.client
      .from('routine_tasks')
      .update({ completed: false })
      .neq('user_id', '00000000-0000-0000-0000-000000000000'); // Update all

    if (error) {
      throw new Error(`Failed to reset task completions: ${error.message}`);
    }

    console.log('[Reset] All task completions reset to false');
  }

  async resetAllWeeklyGoalCompletions(): Promise<void> {
    const { error } = await this.client
      .from('routine_goals')
      .update({ completed: false })
      .eq('type', 'weekly');

    if (error) {
      throw new Error(`Failed to reset weekly goal completions: ${error.message}`);
    }

    console.log('[Reset] All weekly goal completions reset to false');
  }

  async resetAllMonthlyGoalCompletions(): Promise<void> {
    const { error } = await this.client
      .from('routine_goals')
      .update({ completed: false })
      .eq('type', 'monthly');

    if (error) {
      throw new Error(`Failed to reset monthly goal completions: ${error.message}`);
    }

    console.log('[Reset] All monthly goal completions reset to false');
  }

  async updateWeeklyGoalsToCurrentWeek(): Promise<void> {
    const now = new Date();
    const currentWeek = this.getISOWeek(now);
    const currentYear = now.getFullYear();

    const { error } = await this.client
      .from('routine_goals')
      .update({
        week_number: currentWeek,
        year: currentYear,
      })
      .eq('type', 'weekly');

    if (error) {
      throw new Error(`Failed to update weekly goals to current week: ${error.message}`);
    }

    console.log(`[Reset] Updated all weekly goals to week ${currentWeek}, year ${currentYear}`);
  }

  async updateMonthlyGoalsToCurrentMonth(): Promise<void> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const { error } = await this.client
      .from('routine_goals')
      .update({
        month: currentMonth,
        year: currentYear,
      })
      .eq('type', 'monthly');

    if (error) {
      throw new Error(`Failed to update monthly goals to current month: ${error.message}`);
    }

    console.log(`[Reset] Updated all monthly goals to month ${currentMonth}, year ${currentYear}`);
  }

  // ============================================
  // QUOTE INTERACTION OPERATIONS
  // ============================================

  async upsertQuoteInteraction(
    userId: string,
    quoteId: number,
    interactionType: 'like' | 'dislike' | 'none'
  ): Promise<void> {
    if (interactionType === 'none') {
      await this.client
        .from('quote_interactions')
        .delete()
        .eq('user_id', userId)
        .eq('quote_id', quoteId);
      return;
    }

    const { error } = await this.client
      .from('quote_interactions')
      .upsert(
        {
          user_id: userId,
          quote_id: quoteId,
          interaction_type: interactionType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,quote_id' }
      );

    if (error) throw error;
  }

  async getQuoteLikeCount(quoteId: number): Promise<number> {
    const { data, error } = await this.client
      .rpc('get_quote_like_count', { quote_id_param: quoteId });

    if (error) throw error;
    return data || 0;
  }

  async getAllQuoteLikeCounts(): Promise<Record<number, number>> {
    const { data, error } = await this.client
      .rpc('get_all_quote_like_counts');

    if (error) throw error;

    const counts: Record<number, number> = {};
    if (data) {
      data.forEach((row: any) => {
        counts[row.quote_id] = parseInt(row.like_count);
      });
    }
    return counts;
  }

  async getUserQuoteInteraction(userId: string, quoteId: number): Promise<string | null> {
    const { data, error } = await this.client
      .from('quote_interactions')
      .select('interaction_type')
      .eq('user_id', userId)
      .eq('quote_id', quoteId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.interaction_type || null;
  }

  async getUserDislikedQuotes(userId: string): Promise<number[]> {
    const { data, error } = await this.client
      .from('quote_interactions')
      .select('quote_id')
      .eq('user_id', userId)
      .eq('interaction_type', 'dislike');

    if (error) throw error;
    return data?.map((row: any) => row.quote_id) || [];
  }

  // Helper: Calculate ISO week number (Monday = start of week)
  private getISOWeek(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Make Monday = 0
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }

  async close(): Promise<void> {
    // Supabase client doesn't require explicit closing
  }

  // ============================================
  // GYM WORKOUT LOG OPERATIONS
  // ============================================

  async getGymWorkoutLog(userId: string, dayOfWeek: string, weekNumber: number, year: number): Promise<GymWorkoutLog | null> {
    const { data, error } = await this.client
      .from('gym_workout_log')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .eq('week_number', weekNumber)
      .eq('year', year)
      .maybeSingle();

    if (error) throw new Error(`Failed to get gym workout log: ${error.message}`);
    return data || null;
  }

  async upsertGymWorkoutLog(userId: string, dayOfWeek: string, workoutGroup: string, notes: string, weekNumber: number, year: number): Promise<GymWorkoutLog> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.client
      .from('gym_workout_log')
      .upsert(
        {
          user_id: userId,
          day_of_week: dayOfWeek,
          workout_group: workoutGroup,
          notes,
          logged_date: today,
          week_number: weekNumber,
          year,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,day_of_week,week_number,year' }
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to upsert gym workout log: ${error.message}`);

    if (notes.trim()) {
      const sessionDate = getISOWeekDayDate(dayOfWeek, weekNumber, year);
      await this.saveGymMemoryEntry(userId, workoutGroup, notes, sessionDate);
    }

    return data;
  }

  async getGymWorkoutLogForWeek(userId: string, weekNumber: number, year: number): Promise<GymWorkoutLog[]> {
    const { data, error } = await this.client
      .from('gym_workout_log')
      .select('*')
      .eq('user_id', userId)
      .eq('week_number', weekNumber)
      .eq('year', year);

    if (error) throw new Error(`Failed to get gym workout log for week: ${error.message}`);
    return data || [];
  }

  async resetGymWorkoutLogs(): Promise<void> {
    const { error } = await this.client
      .from('gym_workout_log')
      .delete()
      .neq('user_id', '00000000-0000-0000-0000-000000000000');

    if (error) throw new Error(`Failed to reset gym workout logs: ${error.message}`);
    console.log('[Reset] All gym workout logs deleted');
  }

  // ============================================
  // GYM MEMORY OPERATIONS
  // ============================================

  async getGymMemory(userId: string): Promise<GymMemoryGroup[]> {
    const { data, error } = await this.client
      .from('gym_memory')
      .select('*')
      .eq('user_id', userId)
      .order('workout_group', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get gym memory: ${error.message}`);

    const groups: Record<string, GymMemoryEntry[]> = {};
    for (const row of data || []) {
      if (!groups[row.workout_group]) groups[row.workout_group] = [];
      groups[row.workout_group].push(row);
    }

    return Object.entries(groups).map(([workout_group, entries]) => ({ workout_group, entries }));
  }

  async getGymMemoryByGroup(userId: string, workoutGroup: string): Promise<GymMemoryEntry[]> {
    const normalized = workoutGroup.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
    const { data, error } = await this.client
      .from('gym_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('workout_group', normalized)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw new Error(`Failed to get gym memory by group: ${error.message}`);
    return data || [];
  }

  async saveGymMemoryEntry(userId: string, workoutGroup: string, notes: string, sessionDate: string): Promise<void> {
    const normalized = workoutGroup.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());

    // Upsert: one row per (user, group, date) — editing a session updates notes, not creates duplicates
    const { error: upsertError } = await this.client
      .from('gym_memory')
      .upsert(
        { user_id: userId, workout_group: normalized, notes, session_date: sessionDate },
        { onConflict: 'user_id,workout_group,session_date' }
      );

    if (upsertError) throw new Error(`Failed to save gym memory entry: ${upsertError.message}`);

    // Keep only the 5 most recent sessions per user+group
    const { data: recent, error: selectError } = await this.client
      .from('gym_memory')
      .select('id')
      .eq('user_id', userId)
      .eq('workout_group', normalized)
      .order('session_date', { ascending: false })
      .limit(5);

    if (selectError) throw new Error(`Failed to fetch gym memory for trimming: ${selectError.message}`);

    const keepIds = (recent || []).map((r: any) => r.id);
    if (keepIds.length === 5) {
      await this.client
        .from('gym_memory')
        .delete()
        .eq('user_id', userId)
        .eq('workout_group', normalized)
        .not('id', 'in', `(${keepIds.join(',')})`);
    }
  }

  async deleteGymMemoryGroup(userId: string, workoutGroup: string): Promise<void> {
    const normalized = workoutGroup.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
    const { error } = await this.client
      .from('gym_memory')
      .delete()
      .eq('user_id', userId)
      .eq('workout_group', normalized);

    if (error) throw new Error(`Failed to delete gym memory group: ${error.message}`);
  }

  async deleteGymMemoryEntry(userId: string, entryId: string): Promise<void> {
    const { error } = await this.client
      .from('gym_memory')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to delete gym memory entry: ${error.message}`);
  }

  async getGymPRs(userId: string): Promise<GymPRGroup[]> {
    const { data, error } = await this.client
      .from('gym_prs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get gym PRs: ${error.message}`);

    const MUSCLE_ORDER = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'];
    const groups: Record<string, GymPREntry[]> = {};
    for (const row of data ?? []) {
      if (!groups[row.muscle_group]) groups[row.muscle_group] = [];
      groups[row.muscle_group].push(row as GymPREntry);
    }
    return MUSCLE_ORDER.filter(m => groups[m]).map(m => ({ muscle_group: m, entries: groups[m] }));
  }

  async saveGymPR(userId: string, muscleGroup: string, exerciseName: string, weight: number, reps: number): Promise<GymPREntry> {
    const { data, error } = await this.client
      .from('gym_prs')
      .insert({ user_id: userId, muscle_group: muscleGroup, exercise_name: exerciseName, weight, reps })
      .select()
      .single();

    if (error) throw new Error(`Failed to save gym PR: ${error.message}`);
    return data as GymPREntry;
  }

  async deleteGymPREntry(userId: string, entryId: string): Promise<void> {
    const { error } = await this.client
      .from('gym_prs')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to delete gym PR entry: ${error.message}`);
  }

  async deleteGymPRGroup(userId: string, muscleGroup: string): Promise<void> {
    const { error } = await this.client
      .from('gym_prs')
      .delete()
      .eq('user_id', userId)
      .eq('muscle_group', muscleGroup);

    if (error) throw new Error(`Failed to delete gym PR group: ${error.message}`);
  }
}
