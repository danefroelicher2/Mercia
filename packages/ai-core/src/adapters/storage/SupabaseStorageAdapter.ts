import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageAdapter } from './StorageAdapter';
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

      // Check if user has unanswered question for today
      const { data: existingQuestion } = await this.client
        .from('user_daily_questions')
        .select('question_id, skipped_on')
        .eq('user_id', userId)
        .eq('assigned_date', today)
        .eq('answered', false)
        .maybeSingle();

      if (existingQuestion) {
        // Return existing question
        const { data: question } = await this.client
          .from('daily_questions')
          .select('*')
          .eq('id', existingQuestion.question_id)
          .single();

        return {
          question_id: question.id,
          question_text: question.question_text,
          category: question.category,
          assigned_date: new Date(today),
          skip_count: existingQuestion.skipped_on?.length || 0,
        };
      }

      // Get random unanswered question
      const { data: answeredIds } = await this.client
        .from('user_question_responses')
        .select('question_id')
        .eq('user_id', userId);

      const answeredQuestionIds = answeredIds?.map(r => r.question_id) || [];

      let query = this.client
        .from('daily_questions')
        .select('*')
        .eq('active', true);

      if (answeredQuestionIds.length > 0) {
        query = query.not('id', 'in', `(${answeredQuestionIds.join(',')})`);
      }

      const { data: questions } = await query.limit(10);

      if (!questions || questions.length === 0) {
        return null; // All questions answered
      }

      // Pick random question
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

    // Update profile stats
    await this.incrementQuestionCount(userId);

    return responseData;
  }

  async skipQuestion(userId: string, questionId: string, date: Date): Promise<void> {
    // Get current skip data
    const { data: existingData } = await this.client
      .from('user_daily_questions')
      .select('skipped_on')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .single();

    const skippedDates = existingData?.skipped_on || [];
    skippedDates.push(date.toISOString().split('T')[0]);

    // If skipped 3 times, mark as answered
    if (skippedDates.length >= 3) {
      await this.client
        .from('user_daily_questions')
        .update({
          answered: true,
          skipped_on: skippedDates,
        })
        .eq('user_id', userId)
        .eq('question_id', questionId);

      // Create placeholder response
      await this.client.from('user_question_responses').insert({
        user_id: userId,
        question_id: questionId,
        response_text: '[Auto-skipped after 3 attempts]',
        skip_count: 3,
      });
    } else {
      await this.client
        .from('user_daily_questions')
        .update({ skipped_on: skippedDates })
        .eq('user_id', userId)
        .eq('question_id', questionId);
    }
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
    const { data, error } = await this.client
      .from('routine_tasks')
      .insert({
        user_id: userId,
        text,
        type,
        day_of_week: dayOfWeek,
        completed: false,
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
      .order('created_at', { ascending: true });

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
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create routine goal: ${error.message}`);
    }

    return data;
  }

  async getWeeklyGoals(userId: string): Promise<RoutineGoal[]> {
    const now = new Date();
    const currentWeek = this.getISOWeek(now);
    const currentYear = now.getFullYear();

    const { data, error } = await this.client
      .from('routine_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'weekly')
      .eq('week_number', currentWeek)
      .eq('year', currentYear)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get weekly goals: ${error.message}`);
    }

    return data || [];
  }

  async getMonthlyGoals(userId: string): Promise<RoutineGoal[]> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const { data, error } = await this.client
      .from('routine_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'monthly')
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get monthly goals: ${error.message}`);
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
}
