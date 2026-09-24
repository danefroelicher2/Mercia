import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageAdapter, GymWorkoutLog, GymMemoryEntry, GymMemoryGroup, GymPREntry, GymPRGroup } from './StorageAdapter';
import {
  Chat,
  ChatMessage,
  RoutineTask,
  TimeOfDay,
  RoutineGoal,
} from '../../types';

// Gym memory retention: at most 5 sessions kept per user+group, of which at most
// 3 may be pinned. Pinned sessions bypass deletion but still count toward the cap.
const GYM_MEMORY_MAX = 5;
const GYM_MEMORY_MAX_PINNED = 3;

const DAY_OFFSETS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

// Returns the calendar date (YYYY-MM-DD) for a given day of the week within an ISO week+year.
function getISOWeekDayDate(dayOfWeek: string, weekNumber: number, year: number): string {
  // `year` is the ISO week-year. All UTC so the server's own time zone can't
  // shift the date. Jan 4 is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = (jan4.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const offset = DAY_OFFSETS[dayOfWeek.toLowerCase()] ?? 0;
  const result = new Date(jan4);
  result.setUTCDate(jan4.getUTCDate() - jan4DayOfWeek + (weekNumber - 1) * 7 + offset);
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

  // ============================================
  // ROUTINE OPERATIONS
  // ============================================

  async createRoutineTask(
    userId: string,
    text: string,
    type: 'today',
    dayOfWeek: string,
    targetCount: number = 1,
    timeOfDay?: TimeOfDay,
    scheduledTime?: string | null
  ): Promise<RoutineTask> {
    const clampedTargetCount = Math.min(999, Math.max(1, Math.trunc(targetCount)));

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
        target_count: clampedTargetCount,
        current_count: clampedTargetCount,
        // Omitted when not given so the column default ('morning') applies.
        ...(timeOfDay ? { time_of_day: timeOfDay } : {}),
        ...(scheduledTime ? { scheduled_time: scheduledTime } : {}),
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

  async tickRoutineTask(
    taskId: string,
    userId: string
  ): Promise<{ task: RoutineTask; becameCompleted: boolean; becameUncompleted: boolean }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing, error: fetchError } = await this.client
        .from('routine_tasks')
        .select('current_count, target_count, completed')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch task for tick: ${fetchError.message}`);
      }

      const wasCompleted = existing.completed;
      const newCount = existing.current_count > 0
        ? existing.current_count - 1
        : Math.min(existing.current_count + 1, existing.target_count);
      const newCompleted = newCount === 0;

      const { data, error } = await this.client
        .from('routine_tasks')
        .update({ current_count: newCount, completed: newCompleted })
        .eq('id', taskId)
        .eq('user_id', userId)
        .eq('current_count', existing.current_count)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to tick task: ${error.message}`);
      }

      if (data) {
        return {
          task: data,
          becameCompleted: !wasCompleted && newCompleted,
          becameUncompleted: wasCompleted && !newCompleted,
        };
      }
      // current_count changed between fetch and update (concurrent tick) — retry up to 4 times
    }

    throw new Error('Failed to tick task: concurrent update conflict');
  }

  async updateRoutineTask(
    taskId: string,
    userId: string,
    changes: { text?: string; timeOfDay?: TimeOfDay; targetCount?: number; scheduledTime?: string | null }
  ): Promise<RoutineTask> {
    const update: Record<string, unknown> = {};
    if (changes.text !== undefined) update.text = changes.text;
    if (changes.timeOfDay !== undefined) update.time_of_day = changes.timeOfDay;
    if (changes.scheduledTime !== undefined) update.scheduled_time = changes.scheduledTime;

    if (changes.targetCount !== undefined) {
      const { data: existing, error: fetchError } = await this.client
        .from('routine_tasks')
        .select('current_count, target_count')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch task for update: ${fetchError.message}`);
      }

      // Keep taps already made: 2 of 5 done, retargeted to 8 → 6 remaining.
      const newTarget = Math.min(999, Math.max(1, Math.trunc(changes.targetCount)));
      const tapsDone = existing.target_count - existing.current_count;
      const newCurrent = Math.max(0, newTarget - tapsDone);
      update.target_count = newTarget;
      update.current_count = newCurrent;
      update.completed = newCurrent === 0;
    }

    const { data, error } = await this.client
      .from('routine_tasks')
      .update(update)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update routine task: ${error.message}`);
    }

    return data;
  }

  async updateRoutineGoal(
    goalId: string,
    userId: string,
    changes: { text?: string; targetCount?: number }
  ): Promise<RoutineGoal> {
    const update: Record<string, unknown> = {};
    if (changes.text !== undefined) update.text = changes.text;

    if (changes.targetCount !== undefined) {
      const { data: existing, error: fetchError } = await this.client
        .from('routine_goals')
        .select('current_count, target_count, completed, completed_at')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch goal for update: ${fetchError.message}`);
      }

      // Keep taps already made: 2 of 5 done, retargeted to 8 → 6 remaining.
      const newTarget = Math.min(999, Math.max(1, Math.trunc(changes.targetCount)));
      const tapsDone = existing.target_count - existing.current_count;
      const newCurrent = Math.max(0, newTarget - tapsDone);
      const completed = newCurrent === 0;
      update.target_count = newTarget;
      update.current_count = newCurrent;
      update.completed = completed;
      if (completed !== existing.completed) {
        update.completed_at = completed ? new Date().toISOString() : null;
      }
    }

    const { data, error } = await this.client
      .from('routine_goals')
      .update(update)
      .eq('id', goalId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update routine goal: ${error.message}`);
    }

    return data;
  }

  async deleteRoutineTasks(taskIds: string[], userId: string): Promise<void> {
    if (taskIds.length === 0) return;
    const { error } = await this.client
      .from('routine_tasks')
      .delete()
      .in('id', taskIds)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete routine tasks: ${error.message}`);
    }
  }

  async deleteRoutineGoals(goalIds: string[], userId: string): Promise<void> {
    if (goalIds.length === 0) return;
    const { error } = await this.client
      .from('routine_goals')
      .delete()
      .in('id', goalIds)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete routine goals: ${error.message}`);
    }
  }

  async copyRoutineDay(
    userId: string,
    fromDay: string,
    toDay: string
  ): Promise<{ deletedIds: string[]; tasks: RoutineTask[] }> {
    const [source, target] = await Promise.all([
      this.client
        .from('routine_tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('day_of_week', fromDay)
        .order('sort_order', { ascending: true }),
      this.client.from('routine_tasks').select('id').eq('user_id', userId).eq('day_of_week', toDay),
    ]);
    if (source.error) throw new Error(`Failed to read ${fromDay}: ${source.error.message}`);
    if (target.error) throw new Error(`Failed to read ${toDay}: ${target.error.message}`);

    const deletedIds = (target.data ?? []).map((t: { id: string }) => t.id);
    if (deletedIds.length > 0) {
      const { error } = await this.client
        .from('routine_tasks')
        .delete()
        .in('id', deletedIds)
        .eq('user_id', userId);
      if (error) throw new Error(`Failed to clear ${toDay}: ${error.message}`);
    }

    const rows = (source.data ?? []).map((t: RoutineTask & { sort_order?: number }, index: number) => ({
      user_id: userId,
      text: t.text,
      type: t.type,
      day_of_week: toDay,
      completed: false,
      sort_order: index,
      target_count: t.target_count,
      current_count: t.target_count,
      time_of_day: t.time_of_day,
      scheduled_time: t.scheduled_time,
    }));
    if (rows.length === 0) return { deletedIds, tasks: [] };

    const { data, error } = await this.client.from('routine_tasks').insert(rows).select();
    if (error) throw new Error(`Failed to copy ${fromDay} to ${toDay}: ${error.message}`);

    const tasks = ((data ?? []) as (RoutineTask & { sort_order: number })[]).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    return { deletedIds, tasks };
  }

  async clearRoutine(userId: string): Promise<void> {
    const [tasks, goals, notepad] = await Promise.all([
      this.client.from('routine_tasks').delete().eq('user_id', userId),
      this.client.from('routine_goals').delete().eq('user_id', userId),
      this.client
        .from('routine_notepad')
        .update({ content: '', updated_at: new Date().toISOString() })
        .eq('user_id', userId),
    ]);

    const error = tasks.error ?? goals.error ?? notepad.error;
    if (error) {
      throw new Error(`Failed to clear routine: ${error.message}`);
    }
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
    type: 'weekly' | 'monthly' | 'yearly',
    targetCount: number = 1
  ): Promise<RoutineGoal> {
    const now = new Date();
    const year = now.getFullYear();
    const clampedTargetCount = Math.min(999, Math.max(1, Math.trunc(targetCount)));

    let weekNumber = null;
    let month = null;

    if (type === 'weekly') {
      weekNumber = this.getISOWeek(now);
    } else if (type === 'monthly') {
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
        target_count: clampedTargetCount,
        current_count: clampedTargetCount,
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

  async tickRoutineGoal(
    goalId: string,
    userId: string
  ): Promise<{ goal: RoutineGoal; becameCompleted: boolean; becameUncompleted: boolean }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing, error: fetchError } = await this.client
        .from('routine_goals')
        .select('current_count, target_count, completed')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch goal for tick: ${fetchError.message}`);
      }

      const wasCompleted = existing.completed;
      const newCount = existing.current_count > 0
        ? existing.current_count - 1
        : Math.min(existing.current_count + 1, existing.target_count);
      const newCompleted = newCount === 0;

      // completed_at drives the home-tab rings' "already done before today"
      // math — only touch it on an actual completion-state transition.
      const updatePayload: {
        current_count: number;
        completed: boolean;
        completed_at?: string | null;
      } = { current_count: newCount, completed: newCompleted };
      if (newCompleted && !wasCompleted) {
        updatePayload.completed_at = new Date().toISOString();
      } else if (!newCompleted && wasCompleted) {
        updatePayload.completed_at = null;
      }

      const { data, error } = await this.client
        .from('routine_goals')
        .update(updatePayload)
        .eq('id', goalId)
        .eq('user_id', userId)
        .eq('current_count', existing.current_count)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to tick goal: ${error.message}`);
      }

      if (data) {
        return {
          goal: data,
          becameCompleted: !wasCompleted && newCompleted,
          becameUncompleted: wasCompleted && !newCompleted,
        };
      }
      // current_count changed between fetch and update (concurrent tick) — retry up to 4 times
    }

    throw new Error('Failed to tick goal: concurrent update conflict');
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
    // RPC resets completed=false AND current_count=target_count (column-to-column),
    // mirroring reset_goal_progress so countdown tasks restore their full count.
    const { error } = await this.client
      .rpc('reset_task_progress');

    if (error) {
      throw new Error(`Failed to reset task completions: ${error.message}`);
    }

    console.log('[Reset] All task completions and counts reset');
  }

  async resetAllWeeklyGoalCompletions(): Promise<void> {
    const { error } = await this.client
      .rpc('reset_goal_progress', { goal_type: 'weekly' });

    if (error) {
      throw new Error(`Failed to reset weekly goal completions: ${error.message}`);
    }

    console.log('[Reset] All weekly goal completions and counts reset');
  }

  async resetAllMonthlyGoalCompletions(): Promise<void> {
    const { error } = await this.client
      .rpc('reset_goal_progress', { goal_type: 'monthly' });

    if (error) {
      throw new Error(`Failed to reset monthly goal completions: ${error.message}`);
    }

    console.log('[Reset] All monthly goal completions and counts reset');
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

  async getGymTargetDays(userId: string): Promise<number | null> {
    const { data, error } = await this.client
      .from('user_profiles')
      .select('gym_target_days')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get gym target: ${error.message}`);
    return data?.gym_target_days ?? null;
  }

  async setGymTargetDays(userId: string, targetDays: number): Promise<number> {
    const clamped = Math.min(7, Math.max(1, Math.trunc(targetDays)));
    const { error } = await this.client
      .from('user_profiles')
      .upsert(
        { id: userId, gym_target_days: clamped, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

    if (error) throw new Error(`Failed to set gym target: ${error.message}`);
    return clamped;
  }

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
          is_rest: false, // typing a real workout always clears a rest marker
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

  async setGymRestDay(userId: string, dayOfWeek: string, weekNumber: number, year: number, rest: boolean): Promise<GymWorkoutLog | null> {
    if (rest) {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await this.client
        .from('gym_workout_log')
        .upsert(
          {
            user_id: userId,
            day_of_week: dayOfWeek,
            workout_group: 'Rest',
            notes: '',
            logged_date: today,
            week_number: weekNumber,
            year,
            is_rest: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,day_of_week,week_number,year' }
        )
        .select()
        .single();

      if (error) throw new Error(`Failed to set rest day: ${error.message}`);
      return data;
    }

    // Unmark: rest rows are pure markers, so remove the row — but only if it
    // actually is a rest marker, never a real logged workout.
    const { error } = await this.client
      .from('gym_workout_log')
      .delete()
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .eq('week_number', weekNumber)
      .eq('year', year)
      .eq('is_rest', true);

    if (error) throw new Error(`Failed to unset rest day: ${error.message}`);
    return null;
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
      .eq('archived', false)
      .order('workout_group', { ascending: true })
      .order('pinned', { ascending: false })
      .order('session_date', { ascending: false });

    if (error) throw new Error(`Failed to get gym memory: ${error.message}`);

    const groups: Record<string, GymMemoryEntry[]> = {};
    for (const row of data || []) {
      if (!groups[row.workout_group]) groups[row.workout_group] = [];
      groups[row.workout_group].push(row);
    }

    return Object.entries(groups).map(([workout_group, entries]) => ({ workout_group, entries }));
  }

  async getGymMemoryArchive(userId: string): Promise<GymMemoryGroup[]> {
    const { data, error } = await this.client
      .from('gym_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', true)
      .order('workout_group', { ascending: true })
      .order('session_date', { ascending: false });

    if (error) throw new Error(`Failed to get gym memory archive: ${error.message}`);

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
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('session_date', { ascending: false })
      .limit(6);

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

    // Retention: at most 5 ACTIVE sessions per user+group. Pinned sessions never
    // age out; they still count toward the cap of 5, leaving (5 - pinnedCount)
    // slots for the most-recent unpinned sessions. The oldest unpinned overflow
    // is ARCHIVED (archived=true), not deleted — it moves to the Gym Archive in
    // settings and the permanent gym history is never destroyed.
    const { data: all, error: selectError } = await this.client
      .from('gym_memory')
      .select('id, pinned, session_date')
      .eq('user_id', userId)
      .eq('workout_group', normalized)
      .eq('archived', false)
      .order('session_date', { ascending: false });

    if (selectError) throw new Error(`Failed to fetch gym memory for trimming: ${selectError.message}`);

    const rows = all || [];
    const pinned = rows.filter((r: any) => r.pinned);
    const unpinned = rows.filter((r: any) => !r.pinned); // already newest-first
    const unpinnedKeep = Math.max(0, GYM_MEMORY_MAX - pinned.length);

    const keepIds = new Set<string>([
      ...pinned.map((r: any) => r.id),
      ...unpinned.slice(0, unpinnedKeep).map((r: any) => r.id),
    ]);
    const archiveIds = rows.filter((r: any) => !keepIds.has(r.id)).map((r: any) => r.id);

    if (archiveIds.length > 0) {
      await this.client
        .from('gym_memory')
        .update({ archived: true })
        .eq('user_id', userId)
        .in('id', archiveIds);
    }
  }

  async setGymMemoryPinned(userId: string, entryId: string, pinned: boolean): Promise<GymMemoryEntry> {
    // Look up the target entry (scoped to the user) to find its group.
    const { data: entry, error: fetchError } = await this.client
      .from('gym_memory')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw new Error(`Failed to fetch gym memory entry: ${fetchError.message}`);
    if (!entry) throw new Error('Gym memory entry not found');

    // Enforce max pins per group when pinning (server is the source of truth).
    if (pinned && !entry.pinned) {
      const { count, error: countError } = await this.client
        .from('gym_memory')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('workout_group', entry.workout_group)
        .eq('pinned', true)
        .eq('archived', false);

      if (countError) throw new Error(`Failed to count pinned entries: ${countError.message}`);
      if ((count ?? 0) >= GYM_MEMORY_MAX_PINNED) {
        throw new Error('PIN_LIMIT');
      }
    }

    const { data, error } = await this.client
      .from('gym_memory')
      .update({ pinned })
      .eq('id', entryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update gym memory pin: ${error.message}`);
    return data;
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
