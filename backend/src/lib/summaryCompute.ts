import { SupabaseClient } from '@supabase/supabase-js';

export interface SummaryStats {
  week_start_date: string;
  week_end_date: string;
  today_completed: number;
  today_total: number;
  today_percentage: number;
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

// LEGACY daily-frame ring weights + remaining-pool scoring, kept DELIBERATELY.
// These compute the historical per-day overall_percentage written into
// weekly_summaries rows (one row per day) — a self-consistent daily series
// used by the LLM month log, best-day stats, and monthly/yearly reviews.
// The Home tab's Momentum ring moved to a WEEKLY accumulator with different
// weights (40/25/25/10 — see MerciaHomeScreen.tsx); do NOT "sync"
// these to match it, or every stored day's history changes meaning.
const ROUTINE_WEIGHT = 30;
const GYM_WEIGHT = 20;
const WEEKLY_WEIGHT = 20;
const MONTHLY_WEIGHT = 30;

interface GoalForScoring {
  completed: boolean;
  completed_at: string | null;
}

// Same "remaining pool" formula as the Overall ring, generalized to any target date
// (not just literal today) so the identical math produces a day's archived score
// whether it's being computed live or reconstructed for history.
function computeCategoryScore(
  goals: GoalForScoring[],
  weight: number,
  targetDateStr: string
): { score: number; isActive: boolean } {
  const total = goals.length;
  if (total === 0) {
    return { score: 0, isActive: false };
  }

  let alreadyDoneBeforeTarget = 0;
  let completedOnTarget = 0;
  for (const goal of goals) {
    if (!goal.completed || !goal.completed_at) continue;
    const completedDateStr = goal.completed_at.split('T')[0];
    if (completedDateStr < targetDateStr) {
      alreadyDoneBeforeTarget++;
    } else if (completedDateStr === targetDateStr) {
      completedOnTarget++;
    }
  }

  const remaining = total - alreadyDoneBeforeTarget;
  const score = remaining === 0
    ? weight
    : weight * (completedOnTarget / remaining);

  return { score, isActive: true };
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
    { data: allTodayRows },
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
      .eq('logged_date', date)
      .eq('is_rest', false), // intentional rest days are not gym sessions
    supabase
      .schema('oasis')
      .from('routine_goals')
      .select('id, text, completed, completed_at')
      .eq('user_id', userId)
      .eq('type', 'weekly'),
    supabase
      .schema('oasis')
      .from('routine_goals')
      .select('id, text, completed, completed_at')
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
      .eq('type', 'today'),
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
      .neq('workout_group', '')
      .eq('is_rest', false), // rest markers don't count toward gym days
  ]);

  const completedTasks = completedRows || [];
  const allTasks = allTaskRows || [];
  const completedIds = new Set(completedTasks.map((t: any) => t.task_id));

  const todayTasks = allTasks.filter((t: any) => t.type === 'today');
  const todayTotal = todayTasks.length;
  const todayCompleted = todayTasks.filter((t: any) => completedIds.has(t.id)).length;
  const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

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
  const hasData = todayCompleted > 0 || gymLogged;

  const seenIds = new Set<string>();
  const tasksMissedFrequently = allTasks
    .filter((t: any) => {
      if (completedIds.has(t.id) || seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    })
    .map((t: any) => ({ task_id: t.id, task_name: t.text }));

  // Overall % — same weighted, remaining-pool-aware formula as the Home tab's
  // Overall ring (see computeCategoryScore above). Routine and Weekly/Monthly are
  // excluded from the calculation entirely (not just scored 0) when the user has
  // no items of that type at all; Gym is always counted.
  const routineActive = todayTotal > 0;
  const routineScore = routineActive ? (todayPct / 100) * ROUTINE_WEIGHT : 0;
  const gymScore = gymLogged ? GYM_WEIGHT : 0;
  const weeklyResult = computeCategoryScore(weeklyGoals as GoalForScoring[], WEEKLY_WEIGHT, date);
  const monthlyResult = computeCategoryScore(monthlyGoals as GoalForScoring[], MONTHLY_WEIGHT, date);

  let activeWeight = GYM_WEIGHT;
  let rawScore = gymScore;
  if (routineActive) {
    activeWeight += ROUTINE_WEIGHT;
    rawScore += routineScore;
  }
  if (weeklyResult.isActive) {
    activeWeight += WEEKLY_WEIGHT;
    rawScore += weeklyResult.score;
  }
  if (monthlyResult.isActive) {
    activeWeight += MONTHLY_WEIGHT;
    rawScore += monthlyResult.score;
  }

  const hasAnyActiveCategory = routineActive || weeklyResult.isActive || monthlyResult.isActive || gymLogged;
  const overallPct = activeWeight > 0
    ? Math.min(100, Math.max(0, Math.round((rawScore / activeWeight) * 100)))
    : 0;

  const yesterdayOverallPct = prevRow ? Number(prevRow.overall_percentage || 0) : 0;
  let improvementPct = 0;
  let isImprovement = false;
  if (prevRow && hasAnyActiveCategory) {
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
    const tasksForDay = (allTodayRows || []).filter((t: any) => t.day_of_week === dow);
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
    today_completed: todayCompleted,
    today_total: todayTotal,
    today_percentage: todayPct,
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
