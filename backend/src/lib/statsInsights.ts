import { getSupabase } from '../services/supabase';

// The Gym, Streaks and App-wide parts of the Stats tab, computed per user and
// returned as display-ready sections (title + rows). The Routine part is the
// yearly summary in lib/routineYear. `group` is the feature a section belongs
// to; the app draws a header wherever the group changes.

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

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
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
const dayOfWeek = (date: string) => DAYS[(new Date(toMs(date)).getUTCDay() + 6) % 7];
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

export async function computeInsights(userId: string, tz: string): Promise<InsightSection[]> {
  const sb = getSupabase().schema('oasis');
  const today = localDate(new Date(), tz);
  const year = today.slice(0, 4);

  const [gymRes, restRes, prsRes, profileRes, streaksRes, activityRes, actionDaysRes] = await Promise.all([
    // Every session ever logged — gym_memory archives old sessions, it never deletes them.
    sb.from('gym_memory').select('workout_group, session_date').eq('user_id', userId)
      .gte('session_date', `${year}-01-01`).lte('session_date', `${year}-12-31`),
    sb.from('gym_rest_days').select('rest_date').eq('user_id', userId)
      .gte('rest_date', `${year}-01-01`).lte('rest_date', today),
    sb.from('gym_prs').select('exercise_name, muscle_group, weight, reps, created_at').eq('user_id', userId).order('created_at', { ascending: true }),
    sb.from('user_profiles').select('created_at').eq('id', userId).maybeSingle(),
    sb.from('streaks').select('name, started_at, ended_at').eq('user_id', userId).order('started_at', { ascending: true }),
    sb.from('user_activity_log').select('activity_type, activity_date').eq('user_id', userId),
    sb.from('user_action_days').select('action_date').eq('user_id', userId),
  ]);

  const sections: InsightSection[] = [];

  // ===== GYM (this calendar year) =====
  const sessions = (gymRes.data ?? []).filter((s: any) => s.workout_group);
  const groups = new Map<string, { n: number; last: string }>();
  const byWeekday = new Map<string, number>();
  for (const s of sessions) {
    const g = groups.get(s.workout_group) ?? { n: 0, last: '' };
    g.n++;
    if (s.session_date > g.last) g.last = s.session_date;
    groups.set(s.workout_group, g);
    const wd = dayOfWeek(s.session_date);
    byWeekday.set(wd, (byWeekday.get(wd) ?? 0) + 1);
  }
  const favDay = Array.from(byWeekday.entries()).sort((a, b) => b[1] - a[1])[0];
  const restDays = (restRes.data ?? []).length;
  sections.push({
    id: 'gym-training',
    group: 'Gym',
    title: 'Training',
    note: year,
    rows: [
      { label: 'Sessions logged', value: String(sessions.length) },
      { label: 'Favorite training day', value: favDay ? DAY_LABEL[favDay[0]] : '—', sub: favDay ? plural(favDay[1], 'session') : undefined },
      { label: 'Rest days', value: String(restDays) },
    ],
  });
  sections.push({
    id: 'gym-split',
    group: 'Gym',
    title: 'Split',
    note: year,
    rows: groups.size
      ? Array.from(groups.entries()).sort((a, b) => b[1].n - a[1].n).map(([g, v]) => ({
          label: g,
          value: pct(v.n, sessions.length),
          sub: `${plural(v.n, 'session')} · last ${daysBetween(v.last, today)}d ago`,
        }))
      : [{ label: 'No sessions yet this year', value: '—' }],
  });
  // Best set per exercise: heaviest weight, then most reps at that weight.
  const prBest = new Map<string, any>();
  for (const p of prsRes.data ?? []) {
    const cur = prBest.get(p.exercise_name);
    const w = Number(p.weight);
    if (!cur || w > Number(cur.weight) || (w === Number(cur.weight) && p.reps > cur.reps)) prBest.set(p.exercise_name, p);
  }
  sections.push({
    id: 'gym-prs',
    group: 'Gym',
    title: 'PRs',
    rows: prBest.size
      ? Array.from(prBest.values()).map(p => ({ label: p.exercise_name, value: `${Number(p.weight)} × ${p.reps}`, sub: p.muscle_group }))
      : [{ label: 'No PRs logged yet', value: '—' }],
  });

  // ===== STREAKS =====
  const runs = streaksRes.data ?? [];
  const nowMs = Date.now();
  const len = (r: any) => ((r.ended_at ? Date.parse(r.ended_at) : nowMs) - Date.parse(r.started_at)) / DAY_MS;
  const names = new Map<string, any[]>();
  for (const r of runs) {
    const k = r.name.trim().toLowerCase();
    names.set(k, [...(names.get(k) ?? []), r]);
  }
  // Most restarts; ties go to the one restarted most recently.
  const leastConsistent = Array.from(names.values())
    .filter(rs => rs.length > 1)
    .sort((a, b) => b.length - a.length || Date.parse(b[b.length - 1].started_at) - Date.parse(a[a.length - 1].started_at))[0];
  const longest = runs.reduce((b: any, r: any) => (!b || len(r) > len(b) ? r : b), null);
  sections.push({
    id: 'streaks-totals',
    group: 'Streaks',
    title: 'Totals',
    rows: [
      { label: 'Current streaks', value: String(runs.filter((r: any) => !r.ended_at).length) },
      {
        label: 'Least consistent',
        value: leastConsistent ? leastConsistent[0].name : '—',
        sub: leastConsistent ? `restarted ${plural(leastConsistent.length - 1, 'time')}` : 'no restarts yet',
      },
      {
        label: 'Longest streak',
        value: longest ? longest.name : '—',
        sub: longest ? `${len(longest).toFixed(1)} days${longest.ended_at ? '' : ' · still going'}` : undefined,
      },
    ],
  });

  // ===== APP-WIDE =====
  const activity = activityRes.data ?? [];
  const count = (type: string) => activity.filter((a: any) => a.activity_type === type).length;
  const gymDaysEver = await sb.from('gym_memory').select('session_date').eq('user_id', userId);
  const lifetimeActions = count('task_completed') + count('goal_completed') + count('ai_chat_sent')
    + new Set((gymDaysEver.data ?? []).map((r: any) => r.session_date)).size;
  const joined = profileRes.data?.created_at ? localDate(profileRes.data.created_at, tz) : today;
  const activeDays = new Set<string>([
    ...activity.map((a: any) => a.activity_date),
    ...(actionDaysRes.data ?? []).map((a: any) => a.action_date),
  ]);
  const byMonth = new Map<string, number>();
  for (const d of activeDays) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
  const topMonth = Array.from(byMonth.entries()).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  sections.push({
    id: 'app',
    group: 'App-wide',
    title: 'All time',
    rows: [
      { label: 'Lifetime actions', value: lifetimeActions.toLocaleString('en-US'), sub: 'items and goals crossed off, gym days, messages' },
      { label: 'Days since joining', value: String(daysBetween(joined, today) + 1) },
      { label: 'Most active month', value: topMonth ? `${MONTHS[Number(topMonth[0].slice(5)) - 1]} ${topMonth[0].slice(0, 4)}` : '—', sub: topMonth ? plural(topMonth[1], 'active day') : undefined },
    ],
  });

  return sections;
}
