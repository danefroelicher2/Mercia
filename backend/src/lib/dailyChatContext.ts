import { SupabaseClient } from '@supabase/supabase-js';
import { computeSummaryStats } from './summaryCompute';

interface MonthLogParams {
  userId: string;
  todayDateStr: string; // YYYY-MM-DD, user-local
  supabase: SupabaseClient<any>;
}

// Assembles a compact, natural-language day-by-day log for the user's current
// calendar month (oldest first), ending with today's live numbers. This is the
// first piece of the day -> month -> year condensation pyramid: for now it only
// reaches back to the start of the current month via weekly_summaries rows,
// which are written once per day by dailySummaryJob. Prior months and
// condensation into month/year rollups are a later phase.
export async function buildMonthLog({ userId, todayDateStr, supabase }: MonthLogParams): Promise<string> {
  const monthStart = `${todayDateStr.slice(0, 7)}-01`;

  const [{ data: monthRows }, todayStats] = await Promise.all([
    supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select(
        'week_end_date, today_completed, today_total, overall_percentage, ' +
        'weekly_goals_completed, weekly_goals_total, monthly_goals_completed, ' +
        'monthly_goals_total, gym_days_this_week, has_complete_data'
      )
      .eq('user_id', userId)
      .gte('week_end_date', monthStart)
      .lt('week_end_date', todayDateStr)
      .order('week_end_date', { ascending: true }),
    computeSummaryStats(userId, todayDateStr, supabase),
  ]);

  const historyLines: string[] = [];
  for (const row of (monthRows || []) as any[]) {
    if (!row.has_complete_data) continue;
    historyLines.push(
      `${row.week_end_date}: today ${row.today_completed}/${row.today_total}, ` +
      `overall ${row.overall_percentage}%, weekly goals ${row.weekly_goals_completed}/${row.weekly_goals_total}, ` +
      `monthly goals ${row.monthly_goals_completed}/${row.monthly_goals_total}, gym days ${row.gym_days_this_week}`
    );
  }

  const todayLine =
    `${todayDateStr} (today, live): today ${todayStats.today_completed}/${todayStats.today_total}, ` +
    `overall ${todayStats.overall_percentage}%, weekly goals ${todayStats.weekly_goals_completed}/${todayStats.weekly_goals_total}, ` +
    `monthly goals ${todayStats.monthly_goals_completed}/${todayStats.monthly_goals_total}, ` +
    `gym this week ${todayStats.gym_days_this_week}/${todayStats.gym_days_possible}`;

  if (historyLines.length === 0) {
    return `No prior days logged yet this month.\n${todayLine}`;
  }

  return [...historyLines, todayLine].join('\n');
}

// Same day-arithmetic trick used in summaryCompute.ts's getDayOfWeekForDate —
// anchoring at noon UTC avoids DST/date-line edge cases when stepping a
// YYYY-MM-DD string back by one calendar day.
export function getPreviousDateString(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

interface YesterdayLogParams {
  userId: string;
  yesterdayDateStr: string; // YYYY-MM-DD, user-local
  supabase: SupabaseClient<any>;
}

// Assembles a single-day, retrospective log for "Day in Review" — yesterday's
// numbers only, reconstructed live via computeSummaryStats (works for any past
// date, not just "today") rather than read from weekly_summaries, so it's
// correct even before dailySummaryJob's 6am cron has written that day's row.
export async function buildYesterdayLog({ userId, yesterdayDateStr, supabase }: YesterdayLogParams): Promise<string> {
  const [stats, { data: gymRows }] = await Promise.all([
    computeSummaryStats(userId, yesterdayDateStr, supabase),
    supabase
      .schema('oasis')
      .from('gym_workout_log')
      .select('workout_group, is_rest')
      .eq('user_id', userId)
      .eq('logged_date', yesterdayDateStr),
  ]);

  const gymRowList = (gymRows || []) as any[];
  const restDay = gymRowList.some((r) => r.is_rest);
  const workoutRow = gymRowList.find((r) => !r.is_rest);
  const missedTasks = stats.tasks_missed_frequently.map((t) => t.task_name);

  // Rest days are intentional recovery, not skips — phrase it so the coach
  // treats it as taking care of the body, never as a missed session.
  const gymPart = workoutRow
    ? `yes — ${workoutRow.workout_group ?? 'logged'}`
    : restDay
      ? 'planned rest day (intentional recovery, not a skip)'
      : 'no';

  return (
    `${yesterdayDateStr}: today-tasks ${stats.today_completed}/${stats.today_total}, ` +
    `overall ${stats.overall_percentage}%, weekly goals ${stats.weekly_goals_completed}/${stats.weekly_goals_total}, ` +
    `monthly goals ${stats.monthly_goals_completed}/${stats.monthly_goals_total}, ` +
    `gym: ${gymPart}, ` +
    `missed: ${missedTasks.length > 0 ? missedTasks.join(', ') : 'none'}`
  );
}
