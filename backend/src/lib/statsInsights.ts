import { getSupabase } from '../services/supabase';

// Everything the Stats tab can say from data the app already records,
// computed per user and returned as display-ready sections (title + rows).
//
// Routine rates are measured against the routine as it is TODAY: a date's
// "planned" items are the current items for that weekday. Past routines
// aren't stored, so rates for edited/deleted items are approximate.

export interface InsightRow {
  label: string;
  value: string;
  sub?: string;
}
export interface InsightSection {
  id: string;
  title: string;
  note?: string;
  rows: InsightRow[];
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABEL: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const SECTIONS = ['morning', 'afternoon', 'night'] as const;
const SECTION_LABEL: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WINDOW_DAYS = 90;
const DAY_MS = 86400_000;

// ---------- small helpers ----------

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Local YYYY-MM-DD and hour for an instant, in the user's timezone.
function localParts(iso: string | Date, tz: string) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

// Date arithmetic on YYYY-MM-DD strings (UTC-noon anchored, DST-safe).
const toMs = (date: string) => Date.parse(`${date}T12:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => fromMs(toMs(date) + n * DAY_MS);
const dayOfWeek = (date: string) => DAYS[(new Date(toMs(date)).getUTCDay() + 6) % 7];
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
function* eachDate(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
// Monday of the ISO week.
const weekStart = (date: string) => addDays(date, -DAYS.indexOf(dayOfWeek(date)));

function hourBucket(h: number) {
  if (h < 9) return 'Before 9 AM';
  if (h < 12) return '9 AM – noon';
  if (h < 15) return 'Noon – 3 PM';
  if (h < 18) return '3 – 6 PM';
  if (h < 21) return '6 – 9 PM';
  return 'After 9 PM';
}
const HOUR_BUCKETS = ['Before 9 AM', '9 AM – noon', 'Noon – 3 PM', '3 – 6 PM', '6 – 9 PM', 'After 9 PM'];

function longestRun(flags: boolean[]) {
  let best = 0;
  let cur = 0;
  for (const f of flags) {
    cur = f ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

// ---------- main ----------

export async function computeInsights(userId: string, tz: string): Promise<InsightSection[]> {
  const sb = getSupabase().schema('oasis');
  const today = localParts(new Date(), tz).date;
  const yesterday = addDays(today, -1);

  const [
    tasksRes, historyRes, goalsRes, goalHistRes, summariesRes, gymRes, gymLogRes, prsRes, profileRes,
    streaksRes, chatsRes, messagesRes, activityRes, quotesRes, notepadRes,
  ] = await Promise.all([
    sb.from('routine_tasks').select('id, text, day_of_week, time_of_day, scheduled_time, target_count, type, created_at').eq('user_id', userId),
    sb.from('task_completion_history').select('task_id, task_text, day_of_week, completed, snapshot_date, created_at').eq('user_id', userId).eq('completed', true),
    sb.from('routine_goals').select('id, text, type, completed, target_count, current_count, created_at, completed_at').eq('user_id', userId),
    sb.from('goal_completion_history').select('goal_id, goal_text, goal_type, completed_date').eq('user_id', userId).order('completed_date', { ascending: false }),
    sb.from('weekly_summaries').select('week_start_date, overall_percentage, today_percentage, most_consistent_day, weekly_goals_percentage, monthly_goals_percentage').eq('user_id', userId).order('week_start_date', { ascending: true }),
    sb.from('gym_memory').select('workout_group, session_date').eq('user_id', userId),
    sb.from('gym_workout_log').select('is_rest, logged_date, day_of_week').eq('user_id', userId),
    sb.from('gym_prs').select('exercise_name, muscle_group, weight, reps, created_at').eq('user_id', userId).order('created_at', { ascending: true }),
    sb.from('user_profiles').select('created_at, gym_target_days').eq('id', userId).maybeSingle(),
    sb.from('streaks').select('name, started_at, ended_at').eq('user_id', userId).order('started_at', { ascending: true }),
    sb.from('chats').select('id').eq('user_id', userId),
    sb.from('chat_messages').select('chat_id, created_at').eq('user_id', userId).eq('role', 'user'),
    sb.from('user_activity_log').select('activity_type, activity_date').eq('user_id', userId),
    sb.from('quote_interactions').select('interaction_type').eq('user_id', userId),
    sb.from('routine_notepad').select('content').eq('user_id', userId).maybeSingle(),
  ]);

  const tasks = (tasksRes.data ?? []).filter((t: any) => t.type === 'today');
  const history = historyRes.data ?? [];
  const taskById = new Map(tasks.map((t: any) => [t.id, t]));

  // Completed (task, date) pairs for current tasks.
  const done = new Set<string>();
  for (const h of history) {
    if (!taskById.has(h.task_id)) continue;
    done.add(`${h.task_id}|${h.snapshot_date}`);
  }

  // Window for rates: up to 90 days, from the first completion, through yesterday.
  const firstHistory = history.reduce((m: string | null, h: any) => (!m || h.snapshot_date < m ? h.snapshot_date : m), null);
  const windowStart = firstHistory ? (daysBetween(firstHistory, yesterday) > WINDOW_DAYS - 1 ? addDays(yesterday, -(WINDOW_DAYS - 1)) : firstHistory) : null;

  const tasksByDay = new Map<string, any[]>();
  for (const d of DAYS) tasksByDay.set(d, tasks.filter((t: any) => t.day_of_week === d));

  // Per-date planned/done.
  const perDate: { date: string; planned: number; done: number }[] = [];
  const bySection: Record<string, { p: number; d: number }> = { morning: { p: 0, d: 0 }, afternoon: { p: 0, d: 0 }, night: { p: 0, d: 0 } };
  const byWeekday: Record<string, { p: number; d: number }> = Object.fromEntries(DAYS.map(d => [d, { p: 0, d: 0 }]));
  const grid: Record<string, { p: number; d: number }> = {};
  const perTask = new Map<string, { p: number; d: number; flags: boolean[] }>();
  if (windowStart) {
    for (const date of eachDate(windowStart, yesterday)) {
      const wd = dayOfWeek(date);
      // An item only counts from the day it was added.
      const planned = (tasksByDay.get(wd) ?? []).filter((t: any) => !t.created_at || localParts(t.created_at, tz).date <= date);
      let n = 0;
      for (const t of planned) {
        const ok = done.has(`${t.id}|${date}`);
        if (ok) n++;
        const sec = SECTIONS.includes(t.time_of_day) ? t.time_of_day : 'morning';
        bySection[sec].p++; if (ok) bySection[sec].d++;
        byWeekday[wd].p++; if (ok) byWeekday[wd].d++;
        const g = (grid[`${wd}|${sec}`] = grid[`${wd}|${sec}`] ?? { p: 0, d: 0 });
        g.p++; if (ok) g.d++;
        const pt = perTask.get(t.id) ?? { p: 0, d: 0, flags: [] };
        pt.p++; if (ok) pt.d++; pt.flags.push(ok);
        perTask.set(t.id, pt);
      }
      perDate.push({ date, planned: planned.length, done: n });
    }
  }
  const dateRate = new Map(perDate.filter(p => p.planned > 0).map(p => [p.date, p.done / p.planned]));

  const sections: InsightSection[] = [];

  // ===== ROUTINE =====
  const routineRows: InsightRow[] = [];
  const windowNote = windowStart
    ? `Last ${daysBetween(windowStart, yesterday) + 1} days, against today's routine`
    : 'No completions recorded yet';

  for (const s of SECTIONS) routineRows.push({ label: `${SECTION_LABEL[s]} completion`, value: pct(bySection[s].d, bySection[s].p) });
  sections.push({ id: 'routine-sections', title: 'Routine · by part of day', note: windowNote, rows: routineRows });

  const wdRows = DAYS.map(d => ({ label: DAY_LABEL[d], value: pct(byWeekday[d].d, byWeekday[d].p) }));
  const ranked = DAYS.filter(d => byWeekday[d].p > 0).sort((a, b) => byWeekday[b].d / byWeekday[b].p - byWeekday[a].d / byWeekday[a].p);
  if (ranked.length) {
    wdRows.push({ label: 'Strongest day', value: DAY_LABEL[ranked[0]] });
    wdRows.push({ label: 'Weakest day', value: DAY_LABEL[ranked[ranked.length - 1]] });
  }
  sections.push({ id: 'routine-weekdays', title: 'Routine · by weekday', note: windowNote, rows: wdRows });

  // Items: kept / missed / streaks.
  const itemStats = tasks
    .map((t: any) => {
      const pt = perTask.get(t.id);
      if (!pt || pt.p === 0) return null;
      // Current run: scheduled occurrences back from yesterday, plus today if done.
      let current = 0;
      for (let i = pt.flags.length - 1; i >= 0 && pt.flags[i]; i--) current++;
      if (done.has(`${t.id}|${today}`)) current++;
      return { t, rate: pt.d / pt.p, p: pt.p, d: pt.d, current, longest: Math.max(longestRun(pt.flags), current) };
    })
    .filter(Boolean) as { t: any; rate: number; p: number; d: number; current: number; longest: number }[];
  // Same text on several weekdays → combine.
  const byText = new Map<string, { text: string; p: number; d: number; current: number; longest: number }>();
  for (const s of itemStats) {
    const key = s.t.text.trim().toLowerCase();
    const cur = byText.get(key) ?? { text: s.t.text, p: 0, d: 0, current: 0, longest: 0 };
    cur.p += s.p; cur.d += s.d; cur.current = Math.max(cur.current, s.current); cur.longest = Math.max(cur.longest, s.longest);
    byText.set(key, cur);
  }
  const items = Array.from(byText.values()).filter(i => i.p >= 3);
  const kept = [...items].sort((a, b) => b.d / b.p - a.d / a.p).slice(0, 5);
  const missed = [...items].sort((a, b) => a.d / a.p - b.d / b.p).slice(0, 5);
  sections.push({
    id: 'routine-items',
    title: 'Routine · items',
    note: 'Streaks count scheduled days in a row',
    rows: [
      ...kept.map((i, n) => ({ label: `Most kept #${n + 1}`, value: pct(i.d, i.p), sub: i.text })),
      ...missed.map((i, n) => ({ label: `Most missed #${n + 1}`, value: pct(i.d, i.p), sub: i.text })),
      ...[...items].sort((a, b) => b.current - a.current).slice(0, 5)
        .map(i => ({ label: 'Current streak', value: plural(i.current, 'day'), sub: i.text })),
      ...[...items].sort((a, b) => b.longest - a.longest).slice(0, 3)
        .map(i => ({ label: 'Longest streak', value: plural(i.longest, 'day'), sub: i.text })),
    ],
  });

  // Volume.
  const lastN = (n: number, endOffset = 0) =>
    perDate.slice(Math.max(0, perDate.length - n - endOffset), perDate.length - endOffset);
  const avg = (rows: typeof perDate) => (rows.length ? rows.reduce((s, r) => s + r.done, 0) / rows.length : 0);
  const thisMonth = today.slice(0, 7);
  const lastMonth = fromMs(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15)).slice(0, 7);
  const monthAvg = (m: string) => avg(perDate.filter(p => p.date.startsWith(m)));
  sections.push({
    id: 'routine-volume',
    title: 'Routine · volume',
    rows: [
      { label: 'Items per day (window)', value: avg(perDate).toFixed(1) },
      { label: 'Last 7 days', value: avg(lastN(7)).toFixed(1), sub: `prior 7: ${avg(lastN(7, 7)).toFixed(1)}` },
      { label: 'This month', value: monthAvg(thisMonth).toFixed(1), sub: `last month: ${monthAvg(lastMonth).toFixed(1)}` },
      { label: 'Completed today', value: String(history.filter((h: any) => h.snapshot_date === today).length) },
    ],
  });

  // Perfect days.
  const perfectFlags = perDate.map(p => p.planned > 0 && p.done === p.planned);
  const perfectByMonth = new Map<string, number>();
  perDate.forEach((p, i) => {
    if (perfectFlags[i]) perfectByMonth.set(p.date.slice(0, 7), (perfectByMonth.get(p.date.slice(0, 7)) ?? 0) + 1);
  });
  sections.push({
    id: 'routine-perfect',
    title: 'Routine · perfect days',
    rows: [
      { label: 'Longest run of perfect days', value: plural(longestRun(perfectFlags), 'day') },
      ...Array.from(perfectByMonth.entries()).sort().reverse()
        .map(([m, n]) => ({ label: `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, value: plural(n, 'perfect day') })),
    ],
  });

  // Check-off timing.
  const timing = new Map<string, number>(HOUR_BUCKETS.map(b => [b, 0]));
  let beforeNoon = 0;
  let onTime = 0;
  let timed = 0;
  let catchUp = 0;
  for (const h of history) {
    const lp = localParts(h.created_at, tz);
    if (lp.date === h.snapshot_date) {
      timing.set(hourBucket(lp.hour), (timing.get(hourBucket(lp.hour)) ?? 0) + 1);
      if (lp.hour < 12) beforeNoon++;
      const t: any = taskById.get(h.task_id);
      if (t?.scheduled_time) {
        timed++;
        const [sh, sm] = t.scheduled_time.split(':').map(Number);
        if (Math.abs(lp.hour * 60 + lp.minute - (sh * 60 + sm)) <= 60) onTime++;
      }
    } else if (lp.date > h.snapshot_date) {
      catchUp++;
    }
  }
  const sameDay = Array.from(timing.values()).reduce((a, b) => a + b, 0);
  sections.push({
    id: 'routine-timing',
    title: 'Routine · when you check things off',
    note: 'Time of the first check-off each day',
    rows: [
      ...HOUR_BUCKETS.map(b => ({ label: b, value: pct(timing.get(b) ?? 0, sameDay) })),
      { label: 'Done before noon', value: pct(beforeNoon, sameDay) },
      { label: 'Timed items on time (±1h)', value: timed ? pct(onTime, timed) : '—', sub: timed ? `${onTime} of ${timed}` : 'No timed check-offs yet' },
      { label: 'Filled in after the day', value: String(catchUp), sub: 'check-offs logged on a later date' },
    ],
  });

  // Counters.
  const counters = tasks.filter((t: any) => (t.target_count ?? 1) > 1);
  const counterByText = new Map<string, { text: string; total: number; days: number }>();
  for (const t of counters) {
    const n = history.filter((h: any) => h.task_id === t.id).length;
    const key = t.text.trim().toLowerCase();
    const c = counterByText.get(key) ?? { text: t.text, total: 0, days: 0 };
    c.total += n * t.target_count; c.days += n;
    counterByText.set(key, c);
  }
  const counterRows = Array.from(counterByText.values()).map(c => ({ label: c.text, value: String(c.total), sub: `${plural(c.days, 'full day')}` }));

  sections.push({
    id: 'routine-counters',
    title: 'Routine · counter totals',
    rows: counterRows.length ? counterRows : [{ label: 'No counter items yet', value: '—' }],
  });

  // ===== GOALS =====
  const goals = goalsRes.data ?? [];
  const goalHist = goalHistRes.data ?? [];
  const summaries = summariesRes.data ?? [];
  const byType = (type: string) => goals.filter((g: any) => g.type === type);
  const goalRows: InsightRow[] = ['weekly', 'monthly', 'yearly'].map(type => {
    const g = byType(type);
    return { label: `${type[0].toUpperCase()}${type.slice(1)} goals now`, value: pct(g.filter((x: any) => x.completed).length, g.length), sub: `${g.filter((x: any) => x.completed).length} of ${g.length}` };
  });
  const weeklyPcts = summaries.filter((s: any) => s.weekly_goals_percentage != null).slice(-8);
  for (const s of weeklyPcts.reverse()) {
    goalRows.push({ label: `Week of ${s.week_start_date.slice(5)}`, value: `${Math.round(Number(s.weekly_goals_percentage))}%`, sub: 'weekly goals' });
  }
  sections.push({ id: 'goals-rates', title: 'Goals · completion', rows: goalRows });

  sections.push({
    id: 'goals-done',
    title: 'Goals · completed',
    note: `${goalHist.length} completions recorded`,
    rows: goalHist.slice(0, 15).map((g: any) => ({ label: g.goal_text, value: g.completed_date.slice(5), sub: `${g.goal_type} goal` })),
  });

  const weeklyDone = goalHist.filter((g: any) => g.goal_type === 'weekly');
  const monthlyDone = goalHist.filter((g: any) => g.goal_type === 'monthly');
  const avgWeekday = weeklyDone.length
    ? weeklyDone.reduce((s: number, g: any) => s + DAYS.indexOf(dayOfWeek(g.completed_date)) + 1, 0) / weeklyDone.length
    : 0;
  const avgMonthDay = monthlyDone.length
    ? monthlyDone.reduce((s: number, g: any) => s + Number(g.completed_date.slice(8)), 0) / monthlyDone.length
    : 0;
  const yearly = byType('yearly');
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yearElapsed = (daysBetween(yearStart, today) + 1) / (Number(today.slice(0, 4)) % 4 === 0 ? 366 : 365);
  sections.push({
    id: 'goals-timing',
    title: 'Goals · timing',
    rows: [
      { label: 'Weekly goals finished on (avg)', value: weeklyDone.length ? DAY_LABEL[DAYS[Math.round(avgWeekday) - 1]] : '—', sub: weeklyDone.length ? `day ${avgWeekday.toFixed(1)} of 7` : undefined },
      { label: 'Monthly goals finished on (avg)', value: monthlyDone.length ? `day ${Math.round(avgMonthDay)}` : '—' },
      { label: 'Yearly goals done', value: pct(yearly.filter((g: any) => g.completed).length, yearly.length), sub: `year ${Math.round(yearElapsed * 100)}% through` },
      ...yearly.map((g: any) => ({
        label: g.text,
        value: g.completed ? 'Done' : (g.target_count ?? 1) > 1 ? `${g.target_count - g.current_count}/${g.target_count}` : 'Open',
        sub: 'yearly goal',
      })),
    ],
  });

  // ===== WEEKLY SUMMARIES =====
  const scored = summaries.filter((s: any) => s.overall_percentage != null || s.today_percentage != null)
    .map((s: any) => ({ week: s.week_start_date, score: Number(s.overall_percentage ?? s.today_percentage), day: s.most_consistent_day }));
  const best = scored.reduce((b: any, s: any) => (!b || s.score > b.score ? s : b), null);
  let improving = 0;
  for (let i = scored.length - 1; i > 0 && scored[i].score > scored[i - 1].score; i--) improving++;
  const dayWins = new Map<string, number>();
  for (const s of scored) if (s.day && s.day !== '—' && s.day !== '-') dayWins.set(s.day, (dayWins.get(s.day) ?? 0) + 1);
  sections.push({
    id: 'weekly',
    title: 'Weekly scores',
    rows: [
      { label: 'Best week', value: best ? `${Math.round(best.score)}%` : '—', sub: best ? `week of ${best.week}` : undefined },
      { label: 'Weeks improving in a row', value: String(improving) },
      ...Array.from(dayWins.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([d, n]) => ({ label: 'Most consistent day', value: String(d), sub: plural(n, 'week') })),
      ...scored.slice(-10).reverse().map((s: any) => ({ label: `Week of ${s.week}`, value: `${Math.round(s.score)}%` })),
    ],
  });

  // ===== GYM =====
  const sessions = (gymRes.data ?? []).filter((s: any) => s.workout_group);
  const target = profileRes.data?.gym_target_days ?? 4;
  const perWeek = new Map<string, number>();
  for (const s of sessions) perWeek.set(weekStart(s.session_date), (perWeek.get(weekStart(s.session_date)) ?? 0) + 1);
  const firstWeek = sessions.length ? weekStart(sessions.map((s: any) => s.session_date).sort()[0]) : null;
  const weekFlags: boolean[] = [];
  if (firstWeek) for (let w = firstWeek; w <= weekStart(today); w = addDays(w, 7)) weekFlags.push((perWeek.get(w) ?? 0) >= target);
  let targetStreak = 0;
  for (let i = weekFlags.length - 1; i >= 0; i--) {
    if (weekFlags[i]) targetStreak++;
    else if (i === weekFlags.length - 1) continue; // this week may still be in progress
    else break;
  }
  const groups = new Map<string, { n: number; last: string }>();
  for (const s of sessions) {
    const g = groups.get(s.workout_group) ?? { n: 0, last: '' };
    g.n++; if (s.session_date > g.last) g.last = s.session_date;
    groups.set(s.workout_group, g);
  }
  const gymDays = new Map<string, number>();
  for (const s of sessions) gymDays.set(dayOfWeek(s.session_date), (gymDays.get(dayOfWeek(s.session_date)) ?? 0) + 1);
  const favDay = Array.from(gymDays.entries()).sort((a, b) => b[1] - a[1])[0];
  const restThisWeek = (gymLogRes.data ?? []).filter((r: any) => r.is_rest).length;
  sections.push({
    id: 'gym-target',
    title: 'Gym · consistency',
    rows: [
      { label: 'Sessions logged', value: String(sessions.length) },
      { label: 'This week', value: `${perWeek.get(weekStart(today)) ?? 0} / ${target}` },
      { label: 'Weeks target hit', value: `${weekFlags.filter(Boolean).length} of ${weekFlags.length}` },
      { label: 'Target weeks in a row', value: String(targetStreak) },
      { label: 'Favorite training day', value: favDay ? DAY_LABEL[favDay[0]] : '—', sub: favDay ? plural(favDay[1], 'session') : undefined },
      { label: 'Rest days marked this week', value: String(restThisWeek) },
    ],
  });
  sections.push({
    id: 'gym-split',
    title: 'Gym · split',
    rows: Array.from(groups.entries()).sort((a, b) => b[1].n - a[1].n).map(([g, v]) => ({
      label: g,
      value: pct(v.n, sessions.length),
      sub: `${plural(v.n, 'session')} · last ${daysBetween(v.last, today)}d ago`,
    })),
  });
  const prs = prsRes.data ?? [];
  const prBest = new Map<string, any>();
  for (const p of prs) {
    const e1rm = Number(p.weight) * (1 + p.reps / 30);
    const cur = prBest.get(p.exercise_name);
    if (!cur || e1rm > cur.e1rm) prBest.set(p.exercise_name, { ...p, e1rm });
  }
  sections.push({
    id: 'gym-prs',
    title: 'Gym · PRs',
    note: 'Estimated one-rep max (Epley)',
    rows: prBest.size
      ? Array.from(prBest.values()).map(p => ({ label: p.exercise_name, value: `${Math.round(p.e1rm)}`, sub: `${Number(p.weight)} × ${p.reps} · ${p.muscle_group}` }))
      : [{ label: 'No PRs logged yet', value: '—' }],
  });

  // ===== STREAKS =====
  const runs = streaksRes.data ?? [];
  const nowMs = Date.now();
  const len = (r: any) => ((r.ended_at ? Date.parse(r.ended_at) : nowMs) - Date.parse(r.started_at)) / DAY_MS;
  const running = runs.filter((r: any) => !r.ended_at);
  const names = new Map<string, any[]>();
  for (const r of runs) {
    const k = r.name.trim().toLowerCase();
    names.set(k, [...(names.get(k) ?? []), r]);
  }
  sections.push({
    id: 'streaks-totals',
    title: 'Streaks · totals',
    rows: [
      { label: 'Streaks started', value: String(names.size) },
      { label: 'Running now', value: String(running.length) },
      { label: 'Combined running days', value: running.reduce((s: number, r: any) => s + len(r), 0).toFixed(1) },
      { label: 'Runs past a week', value: pct(runs.filter((r: any) => len(r) >= 7).length, runs.length) },
    ],
  });
  sections.push({
    id: 'streaks-each',
    title: 'Streaks · each',
    rows: Array.from(names.values()).map(rs => {
      const lens = rs.map(len);
      return {
        label: rs[0].name,
        value: `${Math.max(...lens).toFixed(1)}d best`,
        sub: `avg ${(lens.reduce((a: number, b: number) => a + b, 0) / lens.length).toFixed(1)}d · ${plural(rs.length - 1, 'restart')}`,
      };
    }),
  });

  // ===== MERCIA =====
  const messages = messagesRes.data ?? [];
  // Conversations you actually took part in (the app opens a daily chat on its own).
  const chats = (chatsRes.data ?? []).filter((c: any) => messages.some((m: any) => m.chat_id === c.id));
  const chatDays = new Set(messages.map((m: any) => localParts(m.created_at, tz).date));
  let chatStreak = 0;
  for (let d = chatDays.has(today) ? today : yesterday; chatDays.has(d); d = addDays(d, -1)) chatStreak++;
  const msgTiming = new Map<string, number>(HOUR_BUCKETS.map(b => [b, 0]));
  for (const m of messages) {
    const b = hourBucket(localParts(m.created_at, tz).hour);
    msgTiming.set(b, (msgTiming.get(b) ?? 0) + 1);
  }
  const activity = activityRes.data ?? [];
  sections.push({
    id: 'mercia',
    title: 'Mercia',
    rows: [
      { label: 'Conversations', value: String(chats.length) },
      { label: 'Messages sent', value: String(messages.length) },
      { label: 'Messages per conversation', value: chats.length ? (messages.length / chats.length).toFixed(1) : '—' },
      { label: 'Days you talked to Mercia', value: String(chatDays.size) },
      { label: 'Chat streak', value: plural(chatStreak, 'day') },
      { label: 'Daily questions answered', value: String(activity.filter((a: any) => a.activity_type === 'question_answered').length) },
      ...HOUR_BUCKETS.map(b => ({ label: `Messages ${b.toLowerCase()}`, value: pct(msgTiming.get(b) ?? 0, messages.length) })),
    ],
  });

  // ===== APP-WIDE =====
  const joined = profileRes.data?.created_at ? localParts(profileRes.data.created_at, tz).date : today;
  const activeDays = new Set(activity.map((a: any) => a.activity_date));
  const sinceJoin = daysBetween(joined, today) + 1;
  const byMonth = new Map<string, number>();
  for (const d of activeDays) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
  const topMonth = Array.from(byMonth.entries()).sort((a, b) => b[1] - a[1])[0];
  const quotes = quotesRes.data ?? [];
  const notepad: string = notepadRes.data?.content ?? '';
  sections.push({
    id: 'app',
    title: 'App-wide',
    rows: [
      { label: 'Days since joining', value: String(sinceJoin) },
      { label: 'Active days', value: String(activeDays.size), sub: `${pct(activeDays.size, sinceJoin)} of days` },
      { label: 'Most active month', value: topMonth ? `${MONTHS[Number(topMonth[0].slice(5)) - 1]} ${topMonth[0].slice(0, 4)}` : '—', sub: topMonth ? plural(topMonth[1], 'active day') : undefined },
      { label: 'Quotes liked', value: String(quotes.filter((q: any) => q.interaction_type === 'like').length) },
      { label: 'Quotes disliked', value: String(quotes.filter((q: any) => q.interaction_type === 'dislike').length) },
      { label: 'Notepad', value: plural(notepad.split(/\s+/).filter(Boolean).length, 'word'), sub: plural(notepad.split('\n').filter(l => l.trim()).length, 'line') },
    ],
  });

  // ===== CROSS-FEATURE =====
  const gymDates = new Set(sessions.map((s: any) => s.session_date));
  const avgRate = (dates: string[]) => {
    const r = dates.map(d => dateRate.get(d)).filter((x): x is number => x != null);
    return r.length ? `${Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100)}%` : '—';
  };
  const windowDates = Array.from(dateRate.keys());
  const gridRows: InsightRow[] = [];
  for (const d of DAYS) for (const s of SECTIONS) {
    const g = grid[`${d}|${s}`];
    if (g && g.p > 0) gridRows.push({ label: `${DAY_LABEL[d]} ${SECTION_LABEL[s].toLowerCase()}`, value: pct(g.d, g.p) });
  }
  // Goals vs routine: weeks with weekly goals ≥ 50% vs below.
  const strongGoalWeeks = summaries.filter((s: any) => Number(s.weekly_goals_percentage) >= 50).map((s: any) => s.week_start_date);
  const weakGoalWeeks = summaries.filter((s: any) => s.weekly_goals_percentage != null && Number(s.weekly_goals_percentage) < 50).map((s: any) => s.week_start_date);
  const weeksAvg = (ws: string[]) => {
    const dates = ws.flatMap(w => Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    return avgRate(dates);
  };
  // Streak restarts: routine completion 7 days before vs after each restart.
  const restarts = runs.filter((r: any, i: number) =>
    runs.slice(0, i).some((p: any) => p.name.trim().toLowerCase() === r.name.trim().toLowerCase() && p.ended_at));
  const before: string[] = [];
  const after: string[] = [];
  for (const r of restarts) {
    const d = localParts(r.started_at, tz).date;
    for (let i = 1; i <= 7; i++) { before.push(addDays(d, -i)); after.push(addDays(d, i - 1)); }
  }
  sections.push({
    id: 'cross',
    title: 'Across features',
    note: 'Routine completion under different conditions',
    rows: [
      { label: 'Gym days', value: avgRate(windowDates.filter(d => gymDates.has(d))), sub: 'routine completion' },
      { label: 'Non-gym days', value: avgRate(windowDates.filter(d => !gymDates.has(d))), sub: 'routine completion' },
      { label: 'Days you chatted with Mercia', value: avgRate(windowDates.filter(d => chatDays.has(d))) },
      { label: 'Days you didn’t', value: avgRate(windowDates.filter(d => !chatDays.has(d))) },
      { label: 'Weeks goals ≥ 50%', value: weeksAvg(strongGoalWeeks), sub: plural(strongGoalWeeks.length, 'week') },
      { label: 'Weeks goals < 50%', value: weeksAvg(weakGoalWeeks), sub: plural(weakGoalWeeks.length, 'week') },
      { label: 'Week before a streak restart', value: avgRate(before), sub: plural(restarts.length, 'restart') },
      { label: 'Week after a streak restart', value: avgRate(after) },
    ],
  });
  sections.push({ id: 'cross-grid', title: 'Weekday × part of day', note: windowNote, rows: gridRows });

  return sections;
}
