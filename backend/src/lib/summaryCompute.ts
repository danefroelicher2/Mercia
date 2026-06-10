import { SupabaseClient } from '@supabase/supabase-js';

export interface SummaryStats {
  week_start_date: string;
  week_end_date: string;
  nonnegotiables_completed: number;
  nonnegotiables_total: number;
  nonnegotiables_percentage: number;
  tasks_missed_frequently: { task_id: string; task_name: string }[];
  weekly_missed_tasks: { task_id: string; task_name: string; times_missed: number }[];
  overall_percentage: number;
  yesterday_overall_percentage: number;
  improvement_percentage: number;
  is_improvement: boolean;
  weekly_goals_completed: number;
  weekly_goals_total: number;
  weekly_goals_percentage: number;
  completed_weekly_goal_texts: string[];
  weekly_goals_change_today: number;
  monthly_goals_total: number;
  monthly_goals_completed: number;
  monthly_goals_percentage: number;
  completed_monthly_goal_texts: string[];
  monthly_goals_change_today: number;
  gym_days_this_week: number;
  gym_days_possible: number;
  has_complete_data: boolean;
  best_day_combined: string;
  most_consistent_day: string;
}

export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function getDayOfWeekForDate(dateStr: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const date = new Date(dateStr + 'T12:00:00Z');
  return days[date.getUTCDay()];
}

export function getDatesFromMondayToDate(dateStr: string): string[] {
  const end = new Date(dateStr + 'T12:00:00Z');
  const utcDay = end.getUTCDay();
  const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
  const dates: string[] = [];
  for (let i = daysFromMonday; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export async function computeSummaryStats(
  userId: string,
  date: string,
  supabase: SupabaseClient<any>
): Promise<SummaryStats> {
  const dayOfWeek = getDayOfWeekForDate(date);
  const weekDates = getDatesFromMondayToDate(date);
  const weekStart = weekDates[0];

  const [
    { data: completedRows },
    { data: allTaskRows },
    { data: gymRows },
    { data: weeklyGoalRows },
    { data: monthlyGoalRows },
    { data: prevRow },
    { data: allNonNegRows },
    { data: weekCompletionRows },
    { data: gymWeekRows },
  ] = await Promise.all([
    supabase
      .schema('oasis')
      .from('task_completion_history')
      .select('task_id, task_text, task_type')
      .eq('user_id', userId)
      .eq('snapshot_date', date)
      .eq('completed', true),
    supabase
      .schema('oasis')
      .from('routine_tasks')
      .select('id, text, type')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek),
    supabase
      .schema('oasis')
      .from('gym_workout_log')
      .select('workout_group')
      .eq('user_id', userId)
      .eq('logged_date', date),
    supabase
      .schema('oasis')
      .from('routine_goals')
      .select('id, text, completed')
      .eq('user_id', userId)
      .eq('type', 'weekly'),
    supabase
      .schema('oasis')
      .from('routine_goals')
      .select('id, text, completed')
      .eq('user_id', userId)
      .eq('type', 'monthly'),
    supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select('overall_percentage, weekly_goals_completed, monthly_goals_completed')
      .eq('user_id', userId)
      .lt('week_end_date', date)
      .order('week_end_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .schema('oasis')
      .from('routine_tasks')
      .select('id, text, day_of_week')
      .eq('user_id', userId)
      .eq('type', 'non-negotiable'),
    supabase
      .schema('oasis')
      .from('task_completion_history')
      .select('task_id, snapshot_date')
      .eq('user_id', userId)
      .gte('snapshot_date', weekStart)
      .lte('snapshot_date', date)
      .eq('completed', true),
    supabase
      .schema('oasis')
      .from('gym_workout_log')
      .select('logged_date')
      .eq('user_id', userId)
      .in('logged_date', weekDates)
      .not('workout_group', 'is', null)
      .neq('workout_group', ''),
  ]);

  const completedTasks = completedRows || [];
  const allTasks = allTaskRows || [];
  const completedIds = new Set(completedTasks.map((t: any) => t.task_id));

  const nonNegTasks = allTasks.filter((t: any) => t.type === 'non-negotiable');
  const nonnegTotal = nonNegTasks.length;
  const nonnegCompleted = nonNegTasks.filter((t: any) => completedIds.has(t.id)).length;
  const nonnegPct = nonnegTotal > 0 ? Math.round((nonnegCompleted / nonnegTotal) * 100) : 0;

  const weeklyGoals = weeklyGoalRows || [];
  const weeklyGoalsTotal = weeklyGoals.length;
  const weeklyGoalsCompleted = weeklyGoals.filter((g: any) => g.completed).length;
  const weeklyGoalsPct = weeklyGoalsTotal > 0 ? Math.round((weeklyGoalsCompleted / weeklyGoalsTotal) * 100) : 0;
  const completedWeeklyGoalTexts = weeklyGoals.filter((g: any) => g.completed).map((g: any) => g.text as string);

  const monthlyGoals = monthlyGoalRows || [];
  const monthlyGoalsTotal = monthlyGoals.length;
  const monthlyGoalsCompleted = monthlyGoals.filter((g: any) => g.completed).length;
  const monthlyGoalsPct = monthlyGoalsTotal > 0 ? Math.round((monthlyGoalsCompleted / monthlyGoalsTotal) * 100) : 0;
  const completedMonthlyGoalTexts = monthlyGoals.filter((g: any) => g.completed).map((g: any) => g.text as string);

  const gymLogged = (gymRows || []).length > 0;
  const questionAnswered = false;
  const hasData = nonnegCompleted > 0 || gymLogged || questionAnswered;

  const seenIds = new Set<string>();
  const tasksMissedFrequently = allTasks
    .filter((t: any) => {
      if (completedIds.has(t.id) || seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    })
    .map((t: any) => ({ task_id: t.id, task_name: t.text }));

  const activePctSources = [
    ...(nonnegTotal > 0 ? [nonnegPct] : []),
    ...(weeklyGoalsTotal > 0 ? [weeklyGoalsPct] : []),
  ];
  const overallPct = activePctSources.length > 0
    ? Math.round(activePctSources.reduce((a, b) => a + b, 0) / activePctSources.length)
    : 0;

  const yesterdayOverallPct = prevRow ? Number(prevRow.overall_percentage || 0) : 0;
  let improvementPct = 0;
  let isImprovement = false;
  if (prevRow && activePctSources.length > 0) {
    const diff = overallPct - yesterdayOverallPct;
    improvementPct = Math.abs(Math.round(diff));
    isImprovement = diff >= 0;
  }

  const prevWeeklyGoalsCompleted = prevRow ? Number(prevRow.weekly_goals_completed || 0) : 0;
  const prevMonthlyGoalsCompleted = prevRow ? Number(prevRow.monthly_goals_completed || 0) : 0;
  const weeklyGoalsChangeToday = weeklyGoalsCompleted - prevWeeklyGoalsCompleted;
  const monthlyGoalsChangeToday = monthlyGoalsCompleted - prevMonthlyGoalsCompleted;

  const weekCompletedSet = new Set(
    (weekCompletionRows || []).map((c: any) => `${c.task_id}::${c.snapshot_date}`)
  );
  const weekMissedMap = new Map<string, { task_id: string; task_name: string; times_missed: number }>();
  for (const d of weekDates) {
    const dow = getDayOfWeekForDate(d);
    const tasksForDay = (allNonNegRows || []).filter((t: any) => t.day_of_week === dow);
    for (const task of tasksForDay as any[]) {
      if (!weekCompletedSet.has(`${task.id}::${d}`)) {
        const existing = weekMissedMap.get(task.id);
        if (existing) {
          existing.times_missed++;
        } else {
          weekMissedMap.set(task.id, { task_id: task.id, task_name: task.text, times_missed: 1 });
        }
      }
    }
  }
  const weeklyMissedTasks = Array.from(weekMissedMap.values())
    .sort((a, b) => b.times_missed - a.times_missed);

  const gymDaysSet = new Set((gymWeekRows || []).map((r: any) => r.logged_date as string));
  const gymDaysThisWeek = gymDaysSet.size;
  const gymDaysPossible = weekDates.length;

  return {
    week_start_date: weekStart,
    week_end_date: date,
    nonnegotiables_completed: nonnegCompleted,
    nonnegotiables_total: nonnegTotal,
    nonnegotiables_percentage: nonnegPct,
    tasks_missed_frequently: tasksMissedFrequently,
    weekly_missed_tasks: weeklyMissedTasks,
    overall_percentage: overallPct,
    yesterday_overall_percentage: yesterdayOverallPct,
    improvement_percentage: improvementPct,
    is_improvement: isImprovement,
    weekly_goals_completed: weeklyGoalsCompleted,
    weekly_goals_total: weeklyGoalsTotal,
    weekly_goals_percentage: weeklyGoalsPct,
    completed_weekly_goal_texts: completedWeeklyGoalTexts,
    weekly_goals_change_today: weeklyGoalsChangeToday,
    monthly_goals_total: monthlyGoalsTotal,
    monthly_goals_completed: monthlyGoalsCompleted,
    monthly_goals_percentage: monthlyGoalsPct,
    completed_monthly_goal_texts: completedMonthlyGoalTexts,
    monthly_goals_change_today: monthlyGoalsChangeToday,
    gym_days_this_week: gymDaysThisWeek,
    gym_days_possible: gymDaysPossible,
    has_complete_data: hasData,
    best_day_combined: '—',
    most_consistent_day: '—',
  };
}
