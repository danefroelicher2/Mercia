import { getSupabase } from '../services/supabase';
import { WEEKDAYS, weekdayOf } from './routineYear';

// The Gym, Streaks and Overall parts of a calendar year. Shared by the Stats tab (the
// year in progress) and the Stats Archive (a finished year), so both always
// agree.
//
// GYM
//   - Sessions logged = gym_memory rows dated in the year. One row per muscle
//     group per day, so Chest + Back on the same day is 2 sessions. Sessions
//     the Gym tab has archived still count — gym_memory never deletes.
//   - Favorite training day = the weekday with the most sessions (ties go to
//     the earlier weekday).
//   - Rest days = days marked as rest (oasis.gym_rest_days), counted once the
//     day has arrived.
//   - Split = sessions per muscle group, and its share of all sessions.
//   In the year in progress, only days up to today count.
//
// STREAKS
//   - Longest streak = the run with the most time inside the year (a run that
//     crosses New Year counts only its days in this year).
//   - Least consistent = the streak restarted most often in the year; a
//     restart is a run that began in the year after an earlier run with the
//     same name (ties go to the one restarted most recently).
//   Year edges are midnight in the user's time zone.
//
// OVERALL (the year only — nothing lifetime is saved with a year)
//   - Actions = items crossed off + goals completed + messages to Mercia +
//     gym days, in the year.
//   - Most active month = the month of the year with the most active days
//     (days with any recorded activity; ties go to the later month).

export interface GymYear {
  sessions: number;
  restDays: number;
  favoriteDay: { day: string; sessions: number } | null;
  split: { group: string; sessions: number; last: string }[];
}

export interface StreaksYear {
  longest: { name: string; days: number; running: boolean } | null;
  leastConsistent: { name: string; restarts: number } | null;
}

export interface OverallYear {
  actions: number;
  mostActiveMonth: { month: string; activeDays: number } | null; // month = YYYY-MM
}

const DAY_MS = 86400_000;
// user_activity_log types that count as an action (plus gym days).
export const ACTION_TYPES = new Set(['task_completed', 'goal_completed', 'ai_chat_sent']);

// Epoch ms of local midnight starting `date` (YYYY-MM-DD) in `tz`.
function startOfDay(date: string, tz: string): number {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const offset = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const n = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - ms;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

export async function gymYear(userId: string, year: number, today: string): Promise<GymYear> {
  const sb = getSupabase().schema('oasis');
  const from = `${year}-01-01`;
  const to = today.slice(0, 4) === String(year) ? today : `${year}-12-31`;
  const [memRes, restRes] = await Promise.all([
    sb.from('gym_memory').select('workout_group, session_date').eq('user_id', userId).gte('session_date', from).lte('session_date', to),
    sb.from('gym_rest_days').select('rest_date').eq('user_id', userId).gte('rest_date', from).lte('rest_date', to),
  ]);
  if (memRes.error) throw memRes.error;
  if (restRes.error) throw restRes.error;

  const sessions = (memRes.data ?? []).filter((s: any) => s.workout_group);
  const groups = new Map<string, { sessions: number; last: string }>();
  const byWeekday = new Map<string, number>();
  for (const s of sessions) {
    const g = groups.get(s.workout_group) ?? { sessions: 0, last: '' };
    g.sessions++;
    if (s.session_date > g.last) g.last = s.session_date;
    groups.set(s.workout_group, g);
    const wd = weekdayOf(s.session_date);
    byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
  }
  let favoriteDay: GymYear['favoriteDay'] = null;
  for (const day of WEEKDAYS) {
    const n = byWeekday.get(day) ?? 0;
    if (n > 0 && (!favoriteDay || n > favoriteDay.sessions)) favoriteDay = { day, sessions: n };
  }
  return {
    sessions: sessions.length,
    restDays: (restRes.data ?? []).length,
    favoriteDay,
    split: Array.from(groups.entries())
      .map(([group, v]) => ({ group, ...v }))
      .sort((a, b) => b.sessions - a.sessions || a.group.localeCompare(b.group)),
  };
}

export async function streaksYear(userId: string, year: number, tz: string): Promise<StreaksYear> {
  const { data, error } = await getSupabase()
    .schema('oasis')
    .from('streaks')
    .select('name, started_at, ended_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: true });
  if (error) throw error;
  const runs = (data ?? []).map((r: any) => ({
    name: String(r.name),
    key: String(r.name).trim().toLowerCase(),
    start: Date.parse(r.started_at),
    end: r.ended_at ? Date.parse(r.ended_at) : null,
  }));
  const now = Date.now();
  const winStart = startOfDay(`${year}-01-01`, tz);
  const winEnd = Math.min(startOfDay(`${year + 1}-01-01`, tz), now);

  let longest: StreaksYear['longest'] = null;
  let best = 0;
  for (const r of runs) {
    const inYear = Math.min(r.end ?? now, winEnd) - Math.max(r.start, winStart);
    if (inYear > best) {
      best = inYear;
      longest = { name: r.name, days: inYear / DAY_MS, running: r.end === null && winEnd === now };
    }
  }

  const restarts = new Map<string, { name: string; restarts: number; latest: number }>();
  const seen = new Set<string>();
  for (const r of runs) {
    if (seen.has(r.key) && r.start >= winStart && r.start < winEnd) {
      const c = restarts.get(r.key) ?? { name: r.name, restarts: 0, latest: 0 };
      c.restarts++;
      c.latest = r.start;
      c.name = r.name;
      restarts.set(r.key, c);
    }
    seen.add(r.key);
  }
  const worst = Array.from(restarts.values()).sort((a, b) => b.restarts - a.restarts || b.latest - a.latest)[0];

  return { longest, leastConsistent: worst ? { name: worst.name, restarts: worst.restarts } : null };
}

export async function overallYear(userId: string, year: number, today: string): Promise<OverallYear> {
  const sb = getSupabase().schema('oasis');
  const from = `${year}-01-01`;
  const to = today.slice(0, 4) === String(year) ? today : `${year}-12-31`;
  const [activityRes, actionDaysRes, gymRes] = await Promise.all([
    sb.from('user_activity_log').select('activity_type, activity_date').eq('user_id', userId).gte('activity_date', from).lte('activity_date', to),
    sb.from('user_action_days').select('action_date').eq('user_id', userId).gte('action_date', from).lte('action_date', to),
    sb.from('gym_memory').select('session_date').eq('user_id', userId).gte('session_date', from).lte('session_date', to),
  ]);
  for (const r of [activityRes, actionDaysRes, gymRes]) if (r.error) throw r.error;

  const activity = activityRes.data ?? [];
  const actions = activity.filter((a: any) => ACTION_TYPES.has(a.activity_type)).length
    + new Set((gymRes.data ?? []).map((g: any) => g.session_date as string)).size;

  const active = new Set<string>([
    ...activity.map((a: any) => a.activity_date as string),
    ...(actionDaysRes.data ?? []).map((a: any) => a.action_date as string),
  ]);
  const byMonth = new Map<string, number>();
  for (const d of active) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
  const top = Array.from(byMonth.entries()).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];

  return { actions, mostActiveMonth: top ? { month: top[0], activeDays: top[1] } : null };
}
