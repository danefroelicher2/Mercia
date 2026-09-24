import { getSupabase } from '../services/supabase';
import { GymYear, OverallYear, StreaksYear, gymYear, overallYear, streaksYear } from './yearGymStreaks';

// Yearly stats. Everything here is per calendar year (the user's own year,
// in their time zone) and is saved to oasis.stats_archive once the year ends.
//
// ROUTINE (oasis.routine_day_log — one row per day per part of the day):
//   Each finished day is "closed": the items that were on that day's list
//   (their ids), how many were crossed off, and goal points earned that day.
//   Weekly goal = 1.5 points, monthly goal = 3; points only add (can pass
//   100%); yearly goals give none. A closed day never changes when items are
//   edited or deleted later; checking off a past day re-counts it against its
//   saved list. Days the app isn't opened still close (0 of N).
//   - By part of day / by weekday = (crossed off + points) ÷ items on list.
//   - Perfect day = every item in Morning, Afternoon and Night crossed off
//     (goals excluded; a day with nothing planned isn't perfect).
//
// ACTIONS (oasis.user_action_days — one row per day the user did anything):
//   - Missed day = a finished day with no action at all.
//   - Consistency = days with an action ÷ days since tracking began this
//     year (today counts once there's been an action today).
//
// GOALS (oasis.goal_period_log — written by the weekly/monthly/yearly reset
// just before it un-checks goals: goals that existed and how many were done):
//   - Weekly % = average of each finished week's %; a week belongs to the
//     year its Thursday falls in (ISO weeks). Monthly likewise.
//   - Yearly % = the year's yearly goals completed ÷ total.
//   - The period in progress is shown separately ("so far"), not averaged.
//
// GYM, STREAKS and OVERALL for the year come from lib/yearGymStreaks.

export const SECTIONS = ['morning', 'afternoon', 'night'] as const;
export type Section = (typeof SECTIONS)[number];
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const GOAL_POINTS: Record<string, number> = { weekly: 1.5, monthly: 3 };
const DAY_MS = 86400_000;

// ---------- dates ----------

export function validZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}
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
// ISO week of a date and the year that week belongs to (its Thursday's year).
export function isoWeekOf(date: string): { weekNumber: number; year: number } {
  const monday = addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)));
  const year = Number(addDays(monday, 3).slice(0, 4));
  const jan4 = `${year}-01-04`; // always in ISO week 1
  const week1Monday = addDays(jan4, -WEEKDAYS.indexOf(weekdayOf(jan4)));
  return { weekNumber: Math.round((toMs(monday) - toMs(week1Monday)) / (7 * DAY_MS)) + 1, year };
}
const daysInclusive = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS) + 1;

// ---------- profile ----------

export interface Profile {
  timezone: string;
  afternoonStart: number;
  nightStart: number;
  start: string; // first tracked day
}

async function loadProfile(userId: string, tzOverride?: string): Promise<Profile> {
  const sb = getSupabase().schema('oasis');
  const { data } = await sb
    .from('user_profiles')
    .select('timezone, afternoon_start, night_start, routine_log_start, created_at')
    .eq('id', userId)
    .maybeSingle();
  const timezone = validZone(tzOverride ?? data?.timezone);
  let start: string | null = data?.routine_log_start ?? null;
  if (!start) {
    // New account: tracking starts the day it was made (if recent), else today.
    const today = localDate(new Date(), timezone);
    const made = data?.created_at ? localDate(data.created_at, timezone) : today;
    start = made >= addDays(today, -2) ? made : today;
    await sb.from('user_profiles').update({ routine_log_start: start }).eq('id', userId);
  }
  return {
    timezone,
    afternoonStart: data?.afternoon_start ?? 12 * 60,
    nightStart: data?.night_start ?? 18 * 60,
    start,
  };
}

function sectionAt(minutes: number, p: Profile): Section {
  if (minutes < p.afternoonStart) return 'morning';
  if (minutes < p.nightStart) return 'afternoon';
  return 'night';
}

// ---------- one day ----------

export interface DayRow {
  log_date: string;
  section: Section;
  planned: number;
  done: number;
  goal_points: number;
  task_ids: string[];
}

// Counts one date from the routine as it stands now (used to close a day
// right after it ends, and for today live).
async function countDay(userId: string, date: string, p: Profile): Promise<DayRow[]> {
  const sb = getSupabase().schema('oasis');
  const [tasksRes, histRes, goalsRes] = await Promise.all([
    sb.from('routine_tasks').select('id, time_of_day, created_at, type').eq('user_id', userId).eq('day_of_week', weekdayOf(date)),
    sb.from('task_completion_history').select('task_id').eq('user_id', userId).eq('snapshot_date', date).eq('completed', true),
    sb.from('goal_completion_history').select('goal_type, created_at').eq('user_id', userId).eq('completed_date', date),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (histRes.error) throw histRes.error;
  if (goalsRes.error) throw goalsRes.error;

  const doneIds = new Set((histRes.data ?? []).map((h: any) => h.task_id));
  const rows: Record<Section, DayRow> = Object.fromEntries(
    SECTIONS.map(s => [s, { log_date: date, section: s, planned: 0, done: 0, goal_points: 0, task_ids: [] as string[] }]),
  ) as Record<Section, DayRow>;

  for (const t of tasksRes.data ?? []) {
    // On that day's list: this weekday's items that existed by the end of it.
    if (t.type !== 'today' || localDate(t.created_at, p.timezone) > date) continue;
    const s: Section = (SECTIONS as readonly string[]).includes(t.time_of_day) ? t.time_of_day : 'morning';
    rows[s].planned++;
    rows[s].task_ids.push(t.id);
    if (doneIds.has(t.id)) rows[s].done++;
  }
  for (const g of goalsRes.data ?? []) {
    const points = GOAL_POINTS[g.goal_type];
    if (points) rows[sectionAt(localMinutes(g.created_at, p.timezone), p)].goal_points += points;
  }
  return SECTIONS.map(s => rows[s]);
}

// Close every finished day (start … yesterday) not closed yet. Idempotent.
async function closeDays(userId: string, p: Profile): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const yesterday = addDays(localDate(new Date(), p.timezone), -1);
  const { data: last, error } = await sb
    .from('routine_day_log')
    .select('log_date')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  let date = last?.[0]?.log_date ? addDays(last[0].log_date, 1) : p.start;
  if (date < p.start) date = p.start;
  for (; date <= yesterday; date = addDays(date, 1)) {
    const rows = await countDay(userId, date, p);
    const { error: upErr } = await sb
      .from('routine_day_log')
      .upsert(rows.map(r => ({ user_id: userId, ...r })), { onConflict: 'user_id,log_date,section', ignoreDuplicates: true });
    if (upErr) throw upErr;
  }
}

// Remembers the last day closed per user so request-time checks are cheap.
const closedThrough = new Map<string, string>();

// Called before any change to a user's routine: makes sure every finished
// day is closed with the routine as it was, before the change lands.
export async function ensureDaysClosed(userId: string, tz?: string): Promise<void> {
  const p = await loadProfile(userId, tz);
  const yesterday = addDays(localDate(new Date(), p.timezone), -1);
  if (closedThrough.get(userId) === yesterday) return;
  await closeDays(userId, p);
  closedThrough.set(userId, yesterday);
}

// A past day's item was checked off (delta +1) or un-checked (-1) after the
// day closed: adjust that day's count for the part of the day holding the
// item. Adjusts by the one change rather than re-counting from history, since
// deleting an item also deletes its history and would undercount the day.
export async function adjustDay(userId: string, date: string, taskId: string, delta: 1 | -1): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const { data, error } = await sb
    .from('routine_day_log')
    .select('section, planned, done, task_ids')
    .eq('user_id', userId)
    .eq('log_date', date);
  if (error) throw error;
  const row = (data ?? []).find((r: any) => (r.task_ids ?? []).includes(taskId));
  if (!row) return; // not on that day's list (or the day isn't tracked)
  const done = Math.max(0, Math.min(row.planned, row.done + delta));
  const { error: upErr } = await sb.from('routine_day_log').update({ done }).eq('user_id', userId).eq('log_date', date).eq('section', row.section);
  if (upErr) throw upErr;
}

// A past day's goal completions changed after the day closed: recompute that
// day's goal points from its remaining completions.
export async function recountGoalPoints(userId: string, date: string): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const p = await loadProfile(userId);
  const [rowsRes, goalsRes] = await Promise.all([
    sb.from('routine_day_log').select('section').eq('user_id', userId).eq('log_date', date),
    sb.from('goal_completion_history').select('goal_type, created_at').eq('user_id', userId).eq('completed_date', date),
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (goalsRes.error) throw goalsRes.error;
  if (!(rowsRes.data ?? []).length) return; // day not closed / not tracked
  const points: Record<Section, number> = { morning: 0, afternoon: 0, night: 0 };
  for (const g of goalsRes.data ?? []) {
    const pts = GOAL_POINTS[g.goal_type];
    if (pts) points[sectionAt(localMinutes(g.created_at, p.timezone), p)] += pts;
  }
  for (const s of SECTIONS) {
    const { error } = await sb.from('routine_day_log').update({ goal_points: points[s] }).eq('user_id', userId).eq('log_date', date).eq('section', s);
    if (error) throw error;
  }
}

// Take back one logged action (an item or goal un-checked), so lifetime and
// yearly action counts can't be inflated by checking something on and off.
export async function removeOneActivity(userId: string, type: string, date: string): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const { data, error } = await sb
    .from('user_activity_log')
    .select('id')
    .eq('user_id', userId)
    .eq('activity_type', type)
    .eq('activity_date', date)
    .limit(1);
  if (error) throw error;
  if (!data?.length) return;
  const { error: delErr } = await sb.from('user_activity_log').delete().eq('id', data[0].id);
  if (delErr) throw delErr;
}

// The user did something today.
export async function markAction(userId: string, tz?: string): Promise<void> {
  const p = await loadProfile(userId, tz);
  await getSupabase()
    .schema('oasis')
    .from('user_action_days')
    .upsert({ user_id: userId, action_date: localDate(new Date(), p.timezone) }, { onConflict: 'user_id,action_date', ignoreDuplicates: true });
}

// ---------- the year ----------

interface Bucket {
  planned: number;
  done: number;
  points: number;
  rate: number | null;
  days: number; // days of the year included (for weekdays: that weekday's days)
}
export interface YearSummary {
  year: number;
  trackingStart: string;
  from: string | null;
  to: string | null;
  bySection: Record<Section, Bucket>;
  byWeekday: Record<string, Bucket>;
  perfectDays: number;
  missedDays: number;
  actionDays: number;
  countedDays: number;
  consistency: number | null;
  goals: {
    weekly: { average: number | null; periods: number; soFar: number | null };
    monthly: { average: number | null; periods: number; soFar: number | null };
    yearly: { rate: number | null; completed: number; total: number };
  };
  overall: OverallYear;
  gym: GymYear;
  streaks: StreaksYear;
  final?: boolean;
}

const blank = (): Bucket => ({ planned: 0, done: 0, points: 0, rate: null, days: 0 });
const rateOf = (b: Bucket) => (b.planned > 0 ? (b.done + b.points) / b.planned : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// ISO week-year of a Monday: the year its Thursday falls in.
const isoYearOfWeek = (monday: string) => Number(addDays(monday, 3).slice(0, 4));

export async function summarizeYear(userId: string, year: number, tzOverride?: string): Promise<YearSummary> {
  const sb = getSupabase().schema('oasis');
  const p = await loadProfile(userId, tzOverride);
  const today = localDate(new Date(), p.timezone);
  const isCurrent = Number(today.slice(0, 4)) === year;
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  const [overall, gym, streaks, logRes, actRes, goalLogRes, goalsNowRes] = await Promise.all([
    overallYear(userId, year, today),
    gymYear(userId, year, today),
    streaksYear(userId, year, p.timezone),
    sb.from('routine_day_log').select('log_date, section, planned, done, goal_points, task_ids').eq('user_id', userId).gte('log_date', yStart).lte('log_date', yEnd),
    sb.from('user_action_days').select('action_date').eq('user_id', userId).gte('action_date', yStart).lte('action_date', yEnd),
    sb.from('goal_period_log').select('period_type, period_start, total, completed').eq('user_id', userId)
      .gte('period_start', `${year - 1}-12-20`).lte('period_start', yEnd),
    isCurrent ? sb.from('routine_goals').select('type, completed').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [logRes, actRes, goalLogRes, goalsNowRes]) if (r.error) throw r.error;

  // Routine rows: closed days, plus today live.
  const rows: DayRow[] = (logRes.data ?? []).map((r: any) => ({ ...r, goal_points: Number(r.goal_points) || 0 }));
  if (isCurrent && today >= p.start) {
    const live = await countDay(userId, today, p);
    rows.push(...live.filter(r => !rows.some(x => x.log_date === today && x.section === r.section)));
  }

  const bySection = Object.fromEntries(SECTIONS.map(s => [s, blank()])) as Record<Section, Bucket>;
  const byWeekday = Object.fromEntries(WEEKDAYS.map(d => [d, blank()])) as Record<string, Bucket>;
  const perDate = new Map<string, { planned: number; done: number }>();
  for (const r of rows) {
    for (const b of [bySection[r.section], byWeekday[weekdayOf(r.log_date)]]) {
      b.planned += r.planned;
      b.done += r.done;
      b.points += r.goal_points;
    }
    const d = perDate.get(r.log_date) ?? { planned: 0, done: 0 };
    d.planned += r.planned;
    d.done += r.done;
    perDate.set(r.log_date, d);
  }
  for (const s of SECTIONS) bySection[s].rate = rateOf(bySection[s]);
  for (const d of WEEKDAYS) byWeekday[d].rate = rateOf(byWeekday[d]);
  // Every day of the year so far counts toward each part of the day.
  for (const s of SECTIONS) bySection[s].days = perDate.size;
  for (const date of perDate.keys()) byWeekday[weekdayOf(date)].days++;
  const perfectDays = Array.from(perDate.values()).filter(d => d.planned > 0 && d.done >= d.planned).length;
  const dates = Array.from(perDate.keys()).sort();

  // Actions.
  const actionDates = new Set((actRes.data ?? []).map((a: any) => a.action_date));
  const from = p.start > yStart ? p.start : yStart;
  const lastFinished = isCurrent ? addDays(today, -1) : yEnd;
  let missedDays = 0;
  for (let d = from; d <= lastFinished; d = addDays(d, 1)) if (!actionDates.has(d)) missedDays++;
  const countedThrough = isCurrent ? (actionDates.has(today) ? today : addDays(today, -1)) : yEnd;
  const countedDays = from <= countedThrough ? daysInclusive(from, countedThrough) : 0;
  const actionDays = Array.from(actionDates).filter(d => d >= from && d <= countedThrough).length;

  // Goals.
  const goalLog = goalLogRes.data ?? [];
  const pctOf = (g: any) => g.completed / g.total;
  const weeks = goalLog.filter((g: any) => g.period_type === 'weekly' && isoYearOfWeek(g.period_start) === year);
  const months = goalLog.filter((g: any) => g.period_type === 'monthly' && g.period_start.slice(0, 4) === String(year));
  const yearly = goalLog.find((g: any) => g.period_type === 'yearly' && g.period_start === yStart);
  const now = goalsNowRes.data ?? [];
  const soFar = (type: string) => {
    const g = now.filter((x: any) => x.type === type);
    return g.length ? g.filter((x: any) => x.completed).length / g.length : null;
  };
  const yearlyNow = now.filter((x: any) => x.type === 'yearly');
  const yearlyCompleted = yearly ? yearly.completed : yearlyNow.filter((x: any) => x.completed).length;
  const yearlyTotal = yearly ? yearly.total : yearlyNow.length;

  return {
    year,
    trackingStart: p.start,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    bySection,
    byWeekday,
    perfectDays,
    missedDays,
    actionDays,
    countedDays,
    consistency: countedDays > 0 ? actionDays / countedDays : null,
    goals: {
      weekly: { average: avg(weeks.map(pctOf)), periods: weeks.length, soFar: isCurrent ? soFar('weekly') : null },
      monthly: { average: avg(months.map(pctOf)), periods: months.length, soFar: isCurrent ? soFar('monthly') : null },
      yearly: { rate: yearlyTotal > 0 ? yearlyCompleted / yearlyTotal : null, completed: yearlyCompleted, total: yearlyTotal },
    },
    overall,
    gym,
    streaks,
  };
}

// A finished year is final once every period belonging to it has been
// captured: the Jan 1 resets (05:00 UTC) and the Monday reset after the
// year's last ISO week (11:10 UTC).
function yearIsFinal(year: number): boolean {
  let lastMonday = `${year}-12-28`; // always in the year's last ISO week
  lastMonday = addDays(lastMonday, -WEEKDAYS.indexOf(weekdayOf(lastMonday)));
  const weekReset = Date.parse(`${addDays(lastMonday, 7)}T11:30:00Z`);
  const yearReset = Date.parse(`${year + 1}-01-01T05:30:00Z`);
  return Date.now() > Math.max(weekReset, yearReset);
}

// ---------- scheduled job ----------

// One user: close finished days, then save each finished year to the
// archive — re-saved on each run until all its periods are in, then frozen.
export async function logAndArchiveUser(userId: string): Promise<void> {
  const sb = getSupabase().schema('oasis');
  const p = await loadProfile(userId);
  await closeDays(userId, p);
  closedThrough.set(userId, addDays(localDate(new Date(), p.timezone), -1));

  const thisYear = Number(localDate(new Date(), p.timezone).slice(0, 4));
  const { data: archived, error } = await sb.from('stats_archive').select('year, data').eq('user_id', userId);
  if (error) throw error;
  const byYear = new Map((archived ?? []).map((a: any) => [a.year, a.data]));
  for (let y = Number(p.start.slice(0, 4)); y < thisYear; y++) {
    if (byYear.get(y)?.final) continue;
    const summary = await summarizeYear(userId, y);
    summary.final = yearIsFinal(y);
    const { error: upErr } = await sb.from('stats_archive').upsert({ user_id: userId, year: y, data: summary }, { onConflict: 'user_id,year' });
    if (upErr) throw upErr;
  }
}

// Hourly: every user, one at a time; one user's failure never stops the rest.
export async function runRoutineDayLog(): Promise<void> {
  const { data: users, error } = await getSupabase().schema('oasis').from('user_profiles').select('id');
  if (error) throw error;
  for (const u of users ?? []) {
    try {
      await logAndArchiveUser(u.id);
    } catch (err) {
      console.error('[YearStats] user', u.id, 'failed:', err);
    }
  }
}
