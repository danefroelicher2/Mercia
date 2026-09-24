import { getSupabase } from '../services/supabase';

// Year-based routine stats: for each part of the day and each weekday,
// (items crossed off + goal points) ÷ items on the list.
//
// Every finished day is recorded in oasis.routine_day_log by the nightly
// job (including days the app wasn't opened: 0 of N counts). A weekly goal
// completed that day adds 1.5 points, a monthly goal 3 — they only add, so
// a day can go over 100%. Yearly goals don't count.
//
// When a year ends its numbers are saved to oasis.stats_archive.

export const SECTIONS = ['morning', 'afternoon', 'night'] as const;
export type Section = (typeof SECTIONS)[number];
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const GOAL_POINTS: Record<string, number> = { weekly: 1.5, monthly: 3 };
const DAY_MS = 86400_000;

export interface DayCounts {
  section: Section;
  planned: number;
  done: number;
  goal_points: number;
}

export interface YearStats {
  year: number;
  from: string | null;
  to: string | null;
  days: number;
  bySection: Record<Section, { planned: number; done: number; points: number; rate: number | null }>;
  byWeekday: Record<string, { planned: number; done: number; points: number; rate: number | null }>;
}

// ---------- dates ----------

export function localDate(iso: string | Date, tz: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function localMinutes(iso: string, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return Number(p.find(x => x.type === 'hour')?.value ?? 0) * 60 + Number(p.find(x => x.type === 'minute')?.value ?? 0);
}
const toMs = (date: string) => Date.parse(`${date}T12:00:00Z`);
export const addDays = (date: string, n: number) => new Date(toMs(date) + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (date: string) => WEEKDAYS[(new Date(toMs(date)).getUTCDay() + 6) % 7];

export function validZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function sectionAt(minutes: number, afternoonStart: number, nightStart: number): Section {
  if (minutes < afternoonStart) return 'morning';
  if (minutes < nightStart) return 'afternoon';
  return 'night';
}

// ---------- one day ----------

interface Profile {
  timezone: string;
  afternoonStart: number;
  nightStart: number;
}

// Counts for one date, from the routine as it stands and the completion
// history for that date. Used for finished days (stored) and today (live).
export async function countDay(userId: string, date: string, p: Profile): Promise<DayCounts[]> {
  const sb = getSupabase().schema('oasis');
  const weekday = weekdayOf(date);
  const [tasksRes, histRes, goalsRes] = await Promise.all([
    sb.from('routine_tasks').select('id, time_of_day, created_at, type').eq('user_id', userId).eq('day_of_week', weekday),
    sb.from('task_completion_history').select('task_id').eq('user_id', userId).eq('snapshot_date', date).eq('completed', true),
    sb.from('goal_completion_history').select('goal_type, created_at').eq('user_id', userId).eq('completed_date', date),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (histRes.error) throw histRes.error;
  if (goalsRes.error) throw goalsRes.error;

  // On the list that day: this weekday's items that existed by then.
  const planned = (tasksRes.data ?? []).filter(
    (t: any) => t.type === 'today' && localDate(t.created_at, p.timezone) <= date,
  );
  const doneIds = new Set((histRes.data ?? []).map((h: any) => h.task_id));

  const counts: Record<Section, DayCounts> = {
    morning: { section: 'morning', planned: 0, done: 0, goal_points: 0 },
    afternoon: { section: 'afternoon', planned: 0, done: 0, goal_points: 0 },
    night: { section: 'night', planned: 0, done: 0, goal_points: 0 },
  };
  for (const t of planned) {
    const s: Section = (SECTIONS as readonly string[]).includes(t.time_of_day) ? t.time_of_day : 'morning';
    counts[s].planned++;
    if (doneIds.has(t.id)) counts[s].done++;
  }
  for (const g of goalsRes.data ?? []) {
    const points = GOAL_POINTS[g.goal_type];
    if (!points) continue;
    const s = sectionAt(localMinutes(g.created_at, p.timezone), p.afternoonStart, p.nightStart);
    counts[s].goal_points += points;
  }
  return SECTIONS.map(s => counts[s]);
}

// ---------- the year ----------

function emptyStats(year: number): YearStats {
  const blank = () => ({ planned: 0, done: 0, points: 0, rate: null as number | null });
  return {
    year,
    from: null,
    to: null,
    days: 0,
    bySection: { morning: blank(), afternoon: blank(), night: blank() },
    byWeekday: Object.fromEntries(WEEKDAYS.map(d => [d, blank()])),
  };
}

export function summarize(year: number, rows: { log_date: string; section: string; planned: number; done: number; goal_points: number | string }[]): YearStats {
  const stats = emptyStats(year);
  const dates = new Set<string>();
  for (const r of rows) {
    const points = Number(r.goal_points) || 0;
    const sec = stats.bySection[r.section as Section];
    if (sec) {
      sec.planned += r.planned;
      sec.done += r.done;
      sec.points += points;
    }
    const wd = stats.byWeekday[weekdayOf(r.log_date)];
    wd.planned += r.planned;
    wd.done += r.done;
    wd.points += points;
    dates.add(r.log_date);
  }
  const sorted = Array.from(dates).sort();
  stats.from = sorted[0] ?? null;
  stats.to = sorted[sorted.length - 1] ?? null;
  stats.days = sorted.length;
  const rate = (x: { planned: number; done: number; points: number }) =>
    x.planned > 0 ? (x.done + x.points) / x.planned : null;
  for (const s of SECTIONS) stats.bySection[s].rate = rate(stats.bySection[s]);
  for (const d of WEEKDAYS) stats.byWeekday[d].rate = rate(stats.byWeekday[d]);
  return stats;
}

async function loadProfile(userId: string): Promise<Profile & { start: string | null }> {
  const { data } = await getSupabase()
    .schema('oasis')
    .from('user_profiles')
    .select('timezone, afternoon_start, night_start, routine_log_start')
    .eq('id', userId)
    .maybeSingle();
  return {
    timezone: validZone(data?.timezone),
    afternoonStart: data?.afternoon_start ?? 12 * 60,
    nightStart: data?.night_start ?? 18 * 60,
    start: data?.routine_log_start ?? null,
  };
}

// This year so far: every recorded day plus today live (not stored yet).
export async function currentYear(userId: string, tzOverride?: string): Promise<YearStats & { trackingSince: string | null }> {
  const profile = await loadProfile(userId);
  const tz = validZone(tzOverride ?? profile.timezone);
  const today = localDate(new Date(), tz);
  const year = Number(today.slice(0, 4));
  const { data, error } = await getSupabase()
    .schema('oasis')
    .from('routine_day_log')
    .select('log_date, section, planned, done, goal_points')
    .eq('user_id', userId)
    .gte('log_date', `${year}-01-01`)
    .lte('log_date', `${year}-12-31`);
  if (error) throw error;
  const rows = [...(data ?? [])].filter(r => r.log_date !== today);
  const live = await countDay(userId, today, { ...profile, timezone: tz });
  for (const c of live) rows.push({ log_date: today, ...c });
  return { ...summarize(year, rows), trackingSince: profile.start };
}

// ---------- nightly job ----------

// Records every finished day (up to the user's yesterday) not yet stored,
// and saves each finished year to the archive once. Safe to run hourly:
// days and years are written once, keyed by date/year.
export async function runRoutineDayLog(): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const { data: profiles, error } = await sb
    .from('user_profiles')
    .select('id, timezone, afternoon_start, night_start, routine_log_start');
  if (error) throw error;

  for (const row of profiles ?? []) {
    try {
      const profile: Profile = {
        timezone: validZone(row.timezone),
        afternoonStart: row.afternoon_start ?? 12 * 60,
        nightStart: row.night_start ?? 18 * 60,
      };
      const today = localDate(new Date(), profile.timezone);
      const yesterday = addDays(today, -1);

      // First run for this user: tracking starts today.
      let start: string = row.routine_log_start;
      if (!start) {
        start = today;
        await sb.from('user_profiles').update({ routine_log_start: start }).eq('id', row.id);
      }

      const { data: last } = await sb
        .from('routine_day_log')
        .select('log_date')
        .eq('user_id', row.id)
        .order('log_date', { ascending: false })
        .limit(1);
      let date = last?.[0]?.log_date ? addDays(last[0].log_date, 1) : start;
      // Never back-fill more than a week (a missed job shouldn't guess far back).
      if (date < addDays(yesterday, -6)) date = addDays(yesterday, -6) > start ? addDays(yesterday, -6) : start;

      for (; date <= yesterday; date = addDays(date, 1)) {
        const counts = await countDay(row.id, date, profile);
        const { error: upErr } = await sb
          .from('routine_day_log')
          .upsert(counts.map(c => ({ user_id: row.id, log_date: date, ...c })), {
            onConflict: 'user_id,log_date,section',
            ignoreDuplicates: true,
          });
        if (upErr) throw upErr;
      }

      // Archive any finished year that has records but no archive entry.
      const thisYear = Number(today.slice(0, 4));
      const { data: years } = await sb.from('stats_archive').select('year').eq('user_id', row.id);
      const archived = new Set((years ?? []).map((y: any) => y.year));
      const startYear = Number(start.slice(0, 4));
      for (let y = startYear; y < thisYear; y++) {
        if (archived.has(y)) continue;
        const { data: logs, error: logErr } = await sb
          .from('routine_day_log')
          .select('log_date, section, planned, done, goal_points')
          .eq('user_id', row.id)
          .gte('log_date', `${y}-01-01`)
          .lte('log_date', `${y}-12-31`);
        if (logErr) throw logErr;
        if (!logs || logs.length === 0) continue;
        await sb.from('stats_archive').upsert(
          { user_id: row.id, year: y, data: summarize(y, logs) },
          { onConflict: 'user_id,year', ignoreDuplicates: true },
        );
      }
    } catch (err) {
      console.error('[RoutineDayLog] user', row.id, 'failed:', err);
    }
  }
}
