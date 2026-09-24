import { getSupabase } from '../services/supabase';
import { WEEKDAYS, localDate, weekdayOf } from './routineYear';
import { ACTION_TYPES } from './yearGymStreaks';

// The Stats tab's all-time numbers. Everything else on the Stats tab is the
// year so far (lib/routineYear + lib/yearGymStreaks), the same summary the
// Stats Archive saves at year end.

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

// Numbers only the Stats tab shows (never saved with a year): the Lifetime
// group, and current streaks.
export interface LiveExtras {
  currentStreaks: number;
  lifetime: {
    actions: number;            // items + goals + messages + gym days, all time
    itemsCrossedOff: number;
    goalsCompleted: number;
    gymDays: number;            // distinct gym days (the gym part of actions)
    messages: number;
    gymSessions: number;        // gym_memory rows (one per muscle group per day)
    favoriteGymDay: { day: string; sessions: number } | null;
    mostUsedWeekday: { day: string; activeDays: number } | null; // weekday with the most active days
    mostUsedMonth: { month: number; activeDays: number } | null; // 1–12, active days summed over every year
    joined: string;             // YYYY-MM-DD, user's zone
    daysSinceJoining: number;   // joined … today, both counted
  };
}

const WEEK: string[] = [...WEEKDAYS];
// Highest count; ties go to the earlier key in `order`.
function top<K>(counts: Map<K, number>, order: K[]): { key: K; n: number } | null {
  let best: { key: K; n: number } | null = null;
  for (const key of order) {
    const n = counts.get(key) ?? 0;
    if (n > 0 && (!best || n > best.n)) best = { key, n };
  }
  return best;
}

export async function liveExtras(userId: string, tz: string): Promise<LiveExtras> {
  const sb = getSupabase().schema('oasis');
  const today = localDate(new Date(), tz);
  const [streaksRes, profileRes, activityRes, actionDaysRes, gymRes] = await Promise.all([
    sb.from('streaks').select('ended_at').eq('user_id', userId),
    sb.from('user_profiles').select('created_at').eq('id', userId).maybeSingle(),
    sb.from('user_activity_log').select('activity_type, activity_date').eq('user_id', userId),
    sb.from('user_action_days').select('action_date').eq('user_id', userId),
    sb.from('gym_memory').select('session_date, workout_group').eq('user_id', userId),
  ]);
  for (const r of [streaksRes, profileRes, activityRes, actionDaysRes, gymRes]) if (r.error) throw r.error;

  const activity = activityRes.data ?? [];
  const count = (type: string) => activity.filter((a: any) => a.activity_type === type).length;
  const gymRows = (gymRes.data ?? []).filter((g: any) => g.workout_group);
  const gymDays = new Set(gymRows.map((g: any) => g.session_date)).size;
  const itemsCrossedOff = count('task_completed');
  const goalsCompleted = count('goal_completed');
  const messages = count('ai_chat_sent');

  const gymByWeekday = new Map<string, number>();
  for (const g of gymRows) gymByWeekday.set(weekdayOf(g.session_date), (gymByWeekday.get(weekdayOf(g.session_date)) ?? 0) + 1);
  const fav = top(gymByWeekday, WEEK);

  // Active days: any recorded activity or action.
  const active = new Set<string>([
    ...activity.map((a: any) => a.activity_date as string),
    ...(actionDaysRes.data ?? []).map((a: any) => a.action_date as string),
  ]);
  const activeByWeekday = new Map<string, number>();
  const activeByMonth = new Map<number, number>();
  for (const d of active) {
    activeByWeekday.set(weekdayOf(d), (activeByWeekday.get(weekdayOf(d)) ?? 0) + 1);
    const m = Number(d.slice(5, 7));
    activeByMonth.set(m, (activeByMonth.get(m) ?? 0) + 1);
  }
  const wd = top(activeByWeekday, WEEK);
  const mo = top(activeByMonth, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  const joined = profileRes.data?.created_at ? localDate(profileRes.data.created_at, tz) : today;
  return {
    currentStreaks: (streaksRes.data ?? []).filter((r: any) => !r.ended_at).length,
    lifetime: {
      // The same action types the yearly count uses, plus gym days.
      actions: activity.filter((a: any) => ACTION_TYPES.has(a.activity_type)).length + gymDays,
      itemsCrossedOff,
      goalsCompleted,
      gymDays,
      messages,
      gymSessions: gymRows.length,
      favoriteGymDay: fav ? { day: fav.key, sessions: fav.n } : null,
      mostUsedWeekday: wd ? { day: wd.key, activeDays: wd.n } : null,
      mostUsedMonth: mo ? { month: mo.key, activeDays: mo.n } : null,
      joined,
      daysSinceJoining: daysBetween(joined, today) + 1,
    },
  };
}
