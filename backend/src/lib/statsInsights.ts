import { getSupabase } from '../services/supabase';
import type { YearSummary } from './routineYear';
import { ACTION_TYPES } from './yearGymStreaks';

// The Overall, Gym and Streaks parts of the Stats tab as display-ready
// sections (title + rows). They come from the year summary
// (lib/routineYear + lib/yearGymStreaks) — the same numbers the Stats Archive
// saves when the year ends. `group` is the feature a section belongs to; the
// app draws a header wherever the group changes.

export interface InsightRow {
  label: string;
  value: string;
  sub?: string;
}
export interface InsightSection {
  id: string;
  group: string;
  title: string;
  note?: string;
  rows: InsightRow[];
}

const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400_000;

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function localDate(iso: string | Date, tz: string) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const toMs = (date: string) => Date.parse(`${date}T12:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

export async function computeInsights(userId: string, tz: string, summary: YearSummary): Promise<InsightSection[]> {
  const sb = getSupabase().schema('oasis');
  const today = localDate(new Date(), tz);
  const year = String(summary.year);

  // Stats tab only (never saved with a year): lifetime actions and days since joining.
  const [streaksRes, profileRes, activityRes, gymDaysRes] = await Promise.all([
    sb.from('streaks').select('ended_at').eq('user_id', userId),
    sb.from('user_profiles').select('created_at').eq('id', userId).maybeSingle(),
    sb.from('user_activity_log').select('activity_type').eq('user_id', userId),
    sb.from('gym_memory').select('session_date').eq('user_id', userId),
  ]);
  for (const r of [streaksRes, profileRes, activityRes, gymDaysRes]) if (r.error) throw r.error;
  const lifetimeActions = (activityRes.data ?? []).filter((a: any) => ACTION_TYPES.has(a.activity_type)).length
    + new Set((gymDaysRes.data ?? []).map((g: any) => g.session_date)).size;
  const joined = profileRes.data?.created_at ? localDate(profileRes.data.created_at, tz) : today;

  const sections: InsightSection[] = [];

  // ===== OVERALL (shown first, above Routine) =====
  const o = summary.overall;
  const month = o.mostActiveMonth;
  sections.push({
    id: 'overall',
    group: 'Overall',
    title: 'Across the app',
    note: year,
    rows: [
      { label: 'Actions', value: o.actions.toLocaleString('en-US'), sub: 'items and goals crossed off, gym days, messages' },
      { label: 'Lifetime actions', value: lifetimeActions.toLocaleString('en-US'), sub: 'all time' },
      { label: 'Days since joining', value: (daysBetween(joined, today) + 1).toLocaleString('en-US') },
      { label: 'Most active month', value: month ? MONTHS[Number(month.month.slice(5)) - 1] : '—', sub: month ? plural(month.activeDays, 'active day') : undefined },
    ],
  });

  // ===== GYM (this calendar year) =====
  const gym = summary.gym;
  sections.push({
    id: 'gym-training',
    group: 'Gym',
    title: 'Training',
    note: year,
    rows: [
      { label: 'Sessions logged', value: String(gym.sessions) },
      { label: 'Favorite training day', value: gym.favoriteDay ? DAY_LABEL[gym.favoriteDay.day] : '—', sub: gym.favoriteDay ? plural(gym.favoriteDay.sessions, 'session') : undefined },
      { label: 'Rest days', value: String(gym.restDays) },
    ],
  });
  sections.push({
    id: 'gym-split',
    group: 'Gym',
    title: 'Split',
    note: year,
    rows: gym.split.length
      ? gym.split.map(g => ({
          label: g.group,
          value: pct(g.sessions, gym.sessions),
          sub: `${plural(g.sessions, 'session')} · last ${daysBetween(g.last, today)}d ago`,
        }))
      : [{ label: 'No sessions yet this year', value: '—' }],
  });

  // ===== STREAKS =====
  const { longest, leastConsistent } = summary.streaks;
  sections.push({
    id: 'streaks-totals',
    group: 'Streaks',
    title: 'Totals',
    note: year,
    rows: [
      { label: 'Current streaks', value: String((streaksRes.data ?? []).filter((r: any) => !r.ended_at).length), sub: 'running now' },
      {
        label: 'Least consistent',
        value: leastConsistent ? leastConsistent.name : '—',
        sub: leastConsistent ? `restarted ${plural(leastConsistent.restarts, 'time')}` : 'no restarts this year',
      },
      {
        label: 'Longest streak',
        value: longest ? longest.name : '—',
        sub: longest ? `${longest.days.toFixed(1)} days this year${longest.running ? ' · still going' : ''}` : undefined,
      },
    ],
  });

  return sections;
}

// Numbers only the Stats tab shows (never saved with a year): the Lifetime
// group, and current streaks.
export interface LiveExtras {
  currentStreaks: number;
  lifetime: {
    actions: number;            // items + goals + messages + gym days, all time
    joined: string;             // YYYY-MM-DD, user's zone
    daysSinceJoining: number;   // joined … today, both counted
    activeDays: number;         // days with any recorded activity
    itemsCrossedOff: number;
    goalsCompleted: number;
    gymSessions: number;        // gym_memory rows (one per muscle group per day)
    gymDays: number;            // distinct gym days (the part of actions)
    messages: number;           // messages sent to Mercia
    longestStreak: { name: string; days: number; running: boolean } | null;
    mostActiveMonth: { month: string; activeDays: number } | null;
  };
}
export async function liveExtras(userId: string, tz: string): Promise<LiveExtras> {
  const sb = getSupabase().schema('oasis');
  const today = localDate(new Date(), tz);
  const [streaksRes, profileRes, activityRes, actionDaysRes, gymRes] = await Promise.all([
    sb.from('streaks').select('name, started_at, ended_at').eq('user_id', userId),
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

  const active = new Set<string>([
    ...activity.map((a: any) => a.activity_date as string),
    ...(actionDaysRes.data ?? []).map((a: any) => a.action_date as string),
  ]);
  const byMonth = new Map<string, number>();
  for (const d of active) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
  const top = Array.from(byMonth.entries()).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];

  const now = Date.now();
  let longestStreak: LiveExtras['lifetime']['longestStreak'] = null;
  for (const r of streaksRes.data ?? []) {
    const days = ((r.ended_at ? Date.parse(r.ended_at) : now) - Date.parse(r.started_at)) / DAY_MS;
    if (!longestStreak || days > longestStreak.days) longestStreak = { name: r.name, days, running: !r.ended_at };
  }

  const joined = profileRes.data?.created_at ? localDate(profileRes.data.created_at, tz) : today;
  return {
    currentStreaks: (streaksRes.data ?? []).filter((r: any) => !r.ended_at).length,
    lifetime: {
      actions: itemsCrossedOff + goalsCompleted + messages + gymDays,
      joined,
      daysSinceJoining: daysBetween(joined, today) + 1,
      activeDays: active.size,
      itemsCrossedOff,
      goalsCompleted,
      gymSessions: gymRows.length,
      gymDays,
      messages,
      longestStreak,
      mostActiveMonth: top ? { month: top[0], activeDays: top[1] } : null,
    },
  };
}
