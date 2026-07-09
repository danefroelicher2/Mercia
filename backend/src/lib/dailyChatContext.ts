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
