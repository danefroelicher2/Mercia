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

  async createChat(userId: string, title: string = 'New Chat'): Promise<Chat> {
    const { data, error } = await this.client
      .from('chats')
      .insert({
        user_id: userId,
        title,
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
      .order('updated_at', { ascending: false })
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

  async close(): Promise<void> {
    // Supabase client doesn't require explicit closing
  }
}
