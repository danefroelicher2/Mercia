import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';
import { getLLM } from '../services/merciaCore';
import { liveExtras } from '../lib/statsLifetime';
import { addDays, summarizeYear, localDate, validZone } from '../lib/routineYear';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

function getLocalDateString(timezone?: string): string {
  const now = new Date();
  if (!timezone) return now.toISOString().split('T')[0];
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().split('T')[0];
  }
}

// Validation schemas
const logActivitySchema = z.object({
  activityType: z.enum(['ai_chat_sent', 'task_completed', 'goal_completed']),
  timezone: z.string().optional(),
});

// ============================================
// GET /api/stats/streaks
// ============================================
router.get('/streaks', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const zone = validZone(typeof req.query.timezone === 'string' ? req.query.timezone : req.header('x-timezone'));
    const { data, error } = await getSupabase()
      .schema('oasis')
      .from('user_activity_log')
      .select('activity_date')
      .eq('user_id', userId);
    if (error) throw error;

    // Day streaks from activity days (the heatmap's days), in the user's zone.
    // A streak is still alive today if yesterday was active — it only breaks
    // once a whole day passes with no activity.
    const days = Array.from(new Set((data ?? []).map((r: any) => r.activity_date as string))).sort();
    const active = new Set(days);
    const today = localDate(new Date(), zone);
    const yesterday = addDays(today, -1);
    const activeToday = active.has(today);

    let currentStreak = 0;
    let currentStart: string | null = null;
    for (let d = activeToday ? today : yesterday; active.has(d); d = addDays(d, -1)) {
      currentStreak++;
      currentStart = d;
    }

    // Longest run ever (ties go to the most recent).
    let best = { length: 0, start: null as string | null, end: null as string | null };
    let runStart: string | null = null;
    for (let i = 0; i < days.length; i++) {
      if (i === 0 || days[i] !== addDays(days[i - 1], 1)) runStart = days[i];
      const length = Math.round((Date.parse(days[i]) - Date.parse(runStart!)) / 86400_000) + 1;
      if (length >= best.length) best = { length, start: runStart, end: days[i] };
    }
    const isCurrent = currentStreak > 0 && best.end === (activeToday ? today : yesterday);

    res.json({
      success: true,
      data: {
        currentStreak,
        currentStartedAt: currentStart,
        activeToday,
        longestStreak: {
          length: best.length,
          startedAt: best.start,
          endedAt: best.end,
          isCurrent,
        },
      },
    });
  } catch (error: any) {
    console.error('[Stats Streaks] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// GET /api/stats/heatmap?year=2026&month=2
// ============================================
router.get('/heatmap', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string);

    if (!year || !month || month < 1 || month > 12) {
      res.status(400).json({
        success: false,
        error: 'Valid year and month (1-12) are required',
      });
      return;
    }

    // Get account creation date for navigation bounds
    const { data: creationData, error: creationError } = await supabase
      .rpc('get_account_creation_date', { p_user_id: userId });

    if (creationError) throw creationError;

    const accountCreated = new Date(creationData);
    const accountYear = accountCreated.getFullYear();
    const accountMonth = accountCreated.getMonth() + 1; // 1-indexed

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Validate: cannot request before account creation or future months
    const requestedDate = year * 12 + month;
    const accountDate = accountYear * 12 + accountMonth;
    const currentDate = currentYear * 12 + currentMonth;

    if (requestedDate < accountDate) {
      res.status(400).json({
        success: false,
        error: 'Cannot request months before account creation',
      });
      return;
    }

    if (requestedDate > currentDate) {
      res.status(400).json({
        success: false,
        error: 'Cannot request future months',
      });
      return;
    }

    // Get heatmap data
    const { data: heatmapData, error: heatmapError } = await supabase
      .rpc('get_heatmap_month', {
        p_user_id: userId,
        p_year: year,
        p_month: month,
      });

    if (heatmapError) throw heatmapError;

    const days = (heatmapData ?? []).map((row: any) => ({
      date: row.activity_date,
      count: row.activity_count,
    }));

    const canGoPrevious = requestedDate > accountDate;
    const canGoNext = requestedDate < currentDate;

    res.json({
      success: true,
      data: {
        year,
        month,
        days,
        canGoPrevious,
        canGoNext,
      },
    });
  } catch (error: any) {
    console.error('[Stats Heatmap] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// GET /api/stats/week-activity?timezone=America/Chicago
// Current Mon-Sun week as 7 dots for the Home week strip: one entry per
// date with whether any activity (task/goal/chat) was logged that day.
// Dates are computed in the user's timezone.
// ============================================
router.get('/week-activity', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
    const todayStr = getLocalDateString(timezone);

    // Monday of the user-local week containing today (noon-UTC anchor avoids
    // DST/date-line issues when stepping YYYY-MM-DD strings).
    const ref = new Date(todayStr + 'T12:00:00Z');
    const utcDay = ref.getUTCDay(); // 0=Sun … 6=Sat
    const daysFromMonday = utcDay === 0 ? 6 : utcDay - 1;
    const monday = new Date(ref);
    monday.setUTCDate(ref.getUTCDate() - daysFromMonday);

    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      weekDates.push(d.toISOString().split('T')[0]);
    }

    const { data, error } = await supabase
      .schema('oasis')
      .from('user_activity_log')
      .select('activity_date')
      .eq('user_id', userId)
      .gte('activity_date', weekDates[0])
      .lte('activity_date', weekDates[6]);

    if (error) throw error;

    const activeDates = new Set((data || []).map((r: any) => r.activity_date));
    res.json({
      success: true,
      data: {
        days: weekDates.map(date => ({ date, active: activeDates.has(date) })),
        todayIndex: daysFromMonday,
      },
    });
  } catch (error: any) {
    console.error('[Stats Week Activity] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/stats/monthly-review?timezone=America/Chicago
// Aggregates the previous calendar month (user-local) from the per-day
// weekly_summaries rows into hero stats for the Home monthly review card.
// Returns data: null when the prior month has no logged days. Note: gym
// sessions are approximated by summing each ISO week's max rolling
// gym_days_this_week snapshot (gym_workout_log itself is wiped weekly, so
// it can't be counted directly); weeks straddling month boundaries can be
// attributed to whichever month their later days fall in.
// ============================================
router.get('/monthly-review', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
    const todayStr = getLocalDateString(timezone);

    // Previous calendar month bounds from the user-local date.
    const [y, m] = todayStr.split('-').map(Number);
    const prevYear = m === 1 ? y - 1 : y;
    const prevMonth = m === 1 ? 12 : m - 1;
    const monthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const monthEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: rows, error } = await supabase
      .schema('oasis')
      .from('weekly_summaries')
      .select(
        'week_end_date, today_completed, today_total, overall_percentage, ' +
        'monthly_goals_completed, monthly_goals_total, gym_days_this_week, has_complete_data'
      )
      .eq('user_id', userId)
      .gte('week_end_date', monthStart)
      .lte('week_end_date', monthEnd)
      .order('week_end_date', { ascending: true });

    if (error) throw error;

    const complete = (rows || []).filter((r: any) => r.has_complete_data);
    if (complete.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    let routineCompleted = 0;
    let routineTotal = 0;
    let overallSum = 0;
    let bestDay = { date: '', percentage: -1 };
    const gymMaxByWeek: Record<string, number> = {};

    for (const r of complete as any[]) {
      routineCompleted += r.today_completed ?? 0;
      routineTotal += r.today_total ?? 0;
      overallSum += r.overall_percentage ?? 0;
      if ((r.overall_percentage ?? 0) > bestDay.percentage) {
        bestDay = { date: r.week_end_date, percentage: r.overall_percentage ?? 0 };
      }
      // ISO week key for the gym approximation (rolling weekly counter).
      const d = new Date(r.week_end_date + 'T12:00:00Z');
      const dayNr = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dayNr + 3);
      const weekKey = `${d.getUTCFullYear()}-${Math.ceil((((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 4)) / 86400000) + ((new Date(Date.UTC(d.getUTCFullYear(), 0, 4)).getUTCDay() + 6) % 7) + 1) / 7)}`;
      gymMaxByWeek[weekKey] = Math.max(gymMaxByWeek[weekKey] ?? 0, r.gym_days_this_week ?? 0);
    }

    const gymSessions = Object.values(gymMaxByWeek).reduce((a, b) => a + b, 0);
    const last = complete[complete.length - 1] as any;
    const monthLabel = new Date(monthStart + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    });

    res.json({
      success: true,
      data: {
        month: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
        monthLabel,
        daysLogged: complete.length,
        avgOverall: Math.round(overallSum / complete.length),
        routineCompleted,
        routineTotal,
        gymSessions,
        monthlyGoalsCompleted: last.monthly_goals_completed ?? 0,
        monthlyGoalsTotal: last.monthly_goals_total ?? 0,
        bestDay: bestDay.percentage >= 0 ? bestDay : null,
      },
    });
  } catch (error: any) {
    console.error('[Stats Monthly Review] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// YEARLY REVIEWS (Wrapped-style, completed calendar years only)
// ============================================

// Longest consecutive-day run within a sorted list of YYYY-MM-DD strings.
function longestStreakInDates(dates: string[]): { length: number; start: string; end: string } | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return null;
  let best = { length: 1, start: sorted[0], end: sorted[0] };
  let runStart = sorted[0];
  let runLen = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00Z');
    prev.setUTCDate(prev.getUTCDate() + 1);
    if (prev.toISOString().split('T')[0] === sorted[i]) {
      runLen++;
    } else {
      runStart = sorted[i];
      runLen = 1;
    }
    if (runLen > best.length) best = { length: runLen, start: runStart, end: sorted[i] };
  }
  return best;
}

// Gathers every stat a year's review needs. Data for a completed year is
// frozen (the year ended), so this is computed live per request; only the
// LLM narrative is cached (oasis.yearly_reviews).
async function computeYearReviewStats(userId: string, year: number, supabase: any) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [activityRes, gymRes, summariesRes, taskHistRes, goalHistRes, creationRes] = await Promise.all([
    supabase.schema('oasis').from('user_activity_log')
      .select('activity_type, activity_date')
      .eq('user_id', userId).gte('activity_date', yearStart).lte('activity_date', yearEnd),
    supabase.schema('oasis').from('gym_memory')
      .select('session_date, workout_group')
      .eq('user_id', userId).gte('session_date', yearStart).lte('session_date', yearEnd),
    supabase.schema('oasis').from('weekly_summaries')
      .select('week_end_date, today_completed, today_total, overall_percentage, has_complete_data')
      .eq('user_id', userId).gte('week_end_date', yearStart).lte('week_end_date', yearEnd),
    supabase.schema('oasis').from('task_completion_history')
      .select('task_text')
      .eq('user_id', userId).eq('completed', true)
      .gte('snapshot_date', yearStart).lte('snapshot_date', yearEnd),
    supabase.schema('oasis').from('goal_completion_history')
      .select('goal_text, goal_type')
      .eq('user_id', userId).eq('goal_type', 'weekly')
      .gte('completed_date', yearStart).lte('completed_date', yearEnd),
    supabase.rpc('get_account_creation_date', { p_user_id: userId }),
  ]);

  const activity = (activityRes.data ?? []) as Array<{ activity_type: string; activity_date: string }>;
  const gymRows = (gymRes.data ?? []) as Array<{ session_date: string; workout_group: string }>;
  const summaries = ((summariesRes.data ?? []) as any[]).filter(r => r.has_complete_data);

  const taskCount = activity.filter(a => a.activity_type === 'task_completed').length;
  const goalCount = activity.filter(a => a.activity_type === 'goal_completed').length;
  const chatCount = activity.filter(a => a.activity_type === 'ai_chat_sent').length;

  const gymDaysLogged = new Set(gymRows.map(r => r.session_date)).size;
  const totalActions = taskCount + goalCount + chatCount + gymDaysLogged;

  const perfectDays = summaries.filter(
    r => (r.today_total ?? 0) > 0 && (r.today_completed ?? 0) >= (r.today_total ?? 0)
  ).length;

  // Top workouts: distinct days per workout name (a rename mid-day can leave
  // two memory rows for one date; day-counting keeps it honest).
  const workoutDays: Record<string, Set<string>> = {};
  for (const r of gymRows) {
    if (!workoutDays[r.workout_group]) workoutDays[r.workout_group] = new Set();
    workoutDays[r.workout_group].add(r.session_date);
  }
  const topWorkouts = Object.entries(workoutDays)
    .map(([name, days]) => ({ name, count: days.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const countBy = (rows: Array<{ [k: string]: any }>, key: string): Array<{ text: string; count: number }> => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r[key]] = (counts[r[key]] ?? 0) + 1;
    return Object.entries(counts)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
  };
  const topTodayItems = countBy((taskHistRes.data ?? []) as any[], 'task_text').slice(0, 5);
  const topWeeklyItems = countBy((goalHistRes.data ?? []) as any[], 'goal_text').slice(0, 3);

  const longestStreak = longestStreakInDates(activity.map(a => a.activity_date));

  // Best month: highest average momentum across that month's summary days.
  const byMonth: Record<string, { sum: number; n: number }> = {};
  for (const r of summaries) {
    const m = (r.week_end_date as string).slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { sum: 0, n: 0 };
    byMonth[m].sum += r.overall_percentage ?? 0;
    byMonth[m].n++;
  }
  let bestMonth: { month: string; label: string; avgMomentum: number } | null = null;
  for (const [m, { sum, n }] of Object.entries(byMonth)) {
    const avg = Math.round(sum / n);
    if (!bestMonth || avg > bestMonth.avgMomentum) {
      const label = new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
      bestMonth = { month: m, label, avgMomentum: avg };
    }
  }

  // First-year cards note the join date (it wasn't a full year).
  const accountCreated = creationRes.data ? new Date(creationRes.data) : null;
  const startedDate = accountCreated && accountCreated.getUTCFullYear() === year
    ? accountCreated.toISOString().split('T')[0]
    : null;

  return {
    year,
    startedDate,
    totalActions,
    gymDaysLogged,
    perfectDays,
    tasksCompleted: taskCount,
    goalsCompleted: goalCount,
    chatsSent: chatCount,
    topWorkouts,
    topTodayItems,
    topWeeklyItems,
    longestStreak,
    bestMonth,
  };
}

/**
 * GET /api/stats/yearly-reviews?timezone=
 * Light list of completed-year cards (no LLM). A year qualifies only when it
 * is fully over (user-local) AND has at least one action.
 */
router.get('/yearly-reviews', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
    const currentYear = parseInt(getLocalDateString(timezone).slice(0, 4), 10);

    const { data: creationData, error: creationError } = await supabase
      .rpc('get_account_creation_date', { p_user_id: userId });
    if (creationError) throw creationError;
    const accountYear = new Date(creationData).getUTCFullYear();

    const cards: any[] = [];
    for (let year = accountYear; year < currentYear; year++) {
      const stats = await computeYearReviewStats(userId, year, supabase);
      if (stats.totalActions > 0) {
        cards.push({
          year,
          startedDate: stats.startedDate,
          totalActions: stats.totalActions,
          gymDaysLogged: stats.gymDaysLogged,
        });
      }
    }

    res.json({ success: true, data: cards.sort((a, b) => b.year - a.year) });
  } catch (error: any) {
    console.error('[Stats Yearly Reviews] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stats/yearly-review/:year?timezone=
 * Full review for one completed year: all stats + the coach retrospective.
 * The narrative is generated ONCE from the complete stat set (so Mercia can
 * reference items and workouts by name) and cached in oasis.yearly_reviews.
 */
router.get('/yearly-review/:year', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;
    const year = parseInt(req.params.year, 10);
    const currentYear = parseInt(getLocalDateString(timezone).slice(0, 4), 10);

    if (!Number.isInteger(year) || year >= currentYear) {
      res.status(400).json({ success: false, error: 'Year must be a completed calendar year' });
      return;
    }

    const stats = await computeYearReviewStats(userId, year, supabase);
    if (stats.totalActions === 0) {
      res.json({ success: true, data: null });
      return;
    }

    // Narrative: cached forever after first generation.
    let narrative: string | null = null;
    const { data: cached } = await supabase
      .schema('oasis')
      .from('yearly_reviews')
      .select('narrative')
      .eq('user_id', userId)
      .eq('year', year)
      .maybeSingle();

    if (cached?.narrative) {
      narrative = cached.narrative;
    } else {
      try {
        const llm = getLLM();
        const fmtList = (items: Array<{ text?: string; name?: string; count: number }>) =>
          items.map(i => `${i.text ?? i.name} (${i.count}x)`).join(', ') || 'none';
        const prompt =
          `You are Mercia, a direct personal AI coach writing the opening paragraph of the user's ${year} year-in-review. ` +
          `Here is the complete year data:\n` +
          `- Total actions: ${stats.totalActions} (tasks ${stats.tasksCompleted}, goals ${stats.goalsCompleted}, chats ${stats.chatsSent}, gym days ${stats.gymDaysLogged})\n` +
          `- Perfect days (100% of routine done): ${stats.perfectDays}\n` +
          `- Top workouts: ${fmtList(stats.topWorkouts)}\n` +
          `- Top routine items: ${fmtList(stats.topTodayItems)}\n` +
          `- Top weekly goals: ${fmtList(stats.topWeeklyItems)}\n` +
          `- Longest streak: ${stats.longestStreak ? `${stats.longestStreak.length} days (${stats.longestStreak.start} to ${stats.longestStreak.end})` : 'none'}\n` +
          `- Best month: ${stats.bestMonth ? `${stats.bestMonth.label} (${stats.bestMonth.avgMomentum}% avg momentum)` : 'n/a'}\n` +
          (stats.startedDate ? `- Note: the user joined ${stats.startedDate}, so this was a partial first year.\n` : '') +
          `\nWrite ONE paragraph, 4-6 sentences. Reference specific items and workouts BY NAME with their numbers. ` +
          `Call out the standout achievement and one honest area to push next year. ` +
          `No greeting, no bullet points, no generic filler, never use the word "navigate".`;

        narrative = await llm.chat(
          [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Write the year-in-review paragraph now.' },
          ],
          { temperature: 0.7, maxTokens: 260 }
        );

        await supabase
          .schema('oasis')
          .from('yearly_reviews')
          .upsert({ user_id: userId, year, narrative }, { onConflict: 'user_id,year' });
      } catch (llmError) {
        console.error('[Stats Yearly Review] Narrative generation failed:', llmError);
        // Stats still render; narrative retries on next open.
      }
    }

    res.json({ success: true, data: { ...stats, narrative } });
  } catch (error: any) {
    console.error('[Stats Yearly Review] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/stats/lifetime
// ============================================
router.get('/lifetime', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    const [
      creationResult,
      taskCountResult,
      goalCountResult,
      chatCountResult,
      gymCountResult,
      activityDatesResult,
      perfectDaysResult,
    ] = await Promise.all([
      supabase.rpc('get_account_creation_date', { p_user_id: userId }),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'task_completed'),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'goal_completed'),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'ai_chat_sent'),
      // Lifetime gym days come from gym_memory — the PERMANENT record
      // (includes archived sessions; rest markers never create memory rows).
      // gym_workout_log is wiped weekly, so counting it could only ever see
      // the current week. Distinct session_date dedupes multi-group days.
      supabase.schema('oasis').from('gym_memory').select('session_date')
        .eq('user_id', userId),
      supabase.schema('oasis').from('user_activity_log').select('activity_date').eq('user_id', userId),
      // Perfect Days: days where 100% of routine tasks were completed, from
      // the per-day weekly_summaries rows. completed >= total is compared in
      // JS because PostgREST can't filter column-vs-column; row volume is one
      // per day, so this stays tiny.
      supabase.schema('oasis').from('weekly_summaries')
        .select('today_completed, today_total')
        .eq('user_id', userId)
        .eq('has_complete_data', true)
        .gt('today_total', 0),
    ]);

    if (creationResult.error) throw creationResult.error;
    if (taskCountResult.error) throw taskCountResult.error;
    if (goalCountResult.error) throw goalCountResult.error;
    if (chatCountResult.error) throw chatCountResult.error;
    if (gymCountResult.error) throw gymCountResult.error;
    if (activityDatesResult.error) throw activityDatesResult.error;
    if (perfectDaysResult.error) throw perfectDaysResult.error;

    const joinedDate = creationResult.data;
    const todayItemsCheckedOff = taskCountResult.count ?? 0;
    const goalsCompleted = goalCountResult.count ?? 0;
    const chatMessagesSent = chatCountResult.count ?? 0;
    const gymDaysLogged = new Set(
      (gymCountResult.data ?? []).map((row: any) => row.session_date as string)
    ).size;

    const perfectDays = (perfectDaysResult.data ?? []).filter(
      (row: any) => (row.today_completed ?? 0) >= (row.today_total ?? 0)
    ).length;

    const lifetimeActions = todayItemsCheckedOff + goalsCompleted + chatMessagesSent + gymDaysLogged;

    const distinctActiveDays = new Set(
      (activityDatesResult.data ?? []).map((row: any) => row.activity_date as string)
    ).size;

    const accountCreated = new Date(joinedDate);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceJoining = Math.max(
      1,
      Math.floor((now.getTime() - accountCreated.getTime()) / msPerDay) + 1
    );

    const consistencyRatePercent = Math.min(
      100,
      Math.round((distinctActiveDays / daysSinceJoining) * 100)
    );

    res.json({
      success: true,
      data: {
        joinedDate,
        lifetimeActions,
        todayItemsCheckedOff, // kept for older app builds; UI now shows perfectDays
        perfectDays,
        gymDaysLogged,
        consistencyRatePercent,
      },
    });
  } catch (error: any) {
    console.error('[Stats Lifetime] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// POST /api/stats/log-activity
// ============================================
router.post(
  '/log-activity',
  validate(logActivitySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { activityType, timezone } = req.body;
      const supabase = getSupabase();

      // Insert activity log
      const { error: logError } = await supabase
        .schema('oasis')
        .from('user_activity_log')
        .insert({
          user_id: userId,
          activity_type: activityType,
          activity_date: getLocalDateString(timezone),
        });

      if (logError) throw logError;

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Stats Log Activity] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ============================================
// GET /api/stats/year?timezone= — this year so far, in the same shape the
// Stats Archive saves (so the Stats tab and the archive render alike), plus
// the few numbers only the Stats tab shows.
// ============================================
router.get('/year', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = validZone(typeof req.query.timezone === 'string' ? req.query.timezone : req.header('x-timezone'));
    const thisYear = Number(localDate(new Date(), zone).slice(0, 4));
    const [year, live] = await Promise.all([summarizeYear(req.user!.id, thisYear, zone), liveExtras(req.user!.id, zone)]);
    res.json({ success: true, data: { year, live } });
  } catch (error: any) {
    console.error('[Stats Year] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/stats/archive — finished years' saved stats (newest first)
// ============================================
router.get('/archive', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await getSupabase()
      .schema('oasis')
      .from('stats_archive')
      .select('year, data, created_at')
      .eq('user_id', req.user!.id)
      .order('year', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    console.error('[Stats Archive] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
