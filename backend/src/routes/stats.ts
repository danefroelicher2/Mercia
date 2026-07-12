import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';
import { Achievement, UserAchievement } from '../types/stats';

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
    const supabase = getSupabase();

    const [currentStreakResult, longestStreakResult] = await Promise.all([
      supabase.rpc('get_current_streak', { p_user_id: userId }),
      supabase.rpc('get_longest_streak', { p_user_id: userId }),
    ]);

    if (currentStreakResult.error) throw currentStreakResult.error;
    if (longestStreakResult.error) throw longestStreakResult.error;

    const currentStreak = currentStreakResult.data ?? 0;
    const longest = longestStreakResult.data?.[0] ?? longestStreakResult.data ?? {
      streak_length: 0,
      ended_at: null,
      is_current: false,
    };

    res.json({
      success: true,
      data: {
        currentStreak,
        longestStreak: {
          length: longest.streak_length ?? 0,
          endedAt: longest.ended_at ?? null,
          isCurrent: longest.is_current ?? false,
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
// GET /api/stats/achievements
// ============================================
router.get('/achievements', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const supabase = getSupabase();

    // Fetch all achievements and user's unlocked achievements
    const [achievementsResult, userAchievementsResult] = await Promise.all([
      supabase.schema('oasis').from('achievements').select('*').order('display_order'),
      supabase.schema('oasis').from('user_achievements').select('*').eq('user_id', userId),
    ]);

    if (achievementsResult.error) throw achievementsResult.error;
    if (userAchievementsResult.error) throw userAchievementsResult.error;

    const achievements: Achievement[] = achievementsResult.data;
    const userAchievements: UserAchievement[] = userAchievementsResult.data;

    const unlockedMap = new Map(
      userAchievements.map(ua => [ua.achievement_id, ua.unlocked_at])
    );

    // Calculate progress for each achievement
    const progressValues = await calculateProgress(userId, supabase);

    const result = achievements.map(achievement => {
      const unlocked = unlockedMap.has(achievement.id);
      const unlockedAt = unlockedMap.get(achievement.id) ?? null;
      const progress = unlocked
        ? achievement.requirement_value
        : (progressValues[achievement.requirement_type] ?? 0);

      return {
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        unlocked,
        unlockedAt,
        progress: Math.min(progress, achievement.requirement_value),
        requirement: achievement.requirement_value,
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Stats Achievements] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
    ] = await Promise.all([
      supabase.rpc('get_account_creation_date', { p_user_id: userId }),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'task_completed'),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'goal_completed'),
      supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('activity_type', 'ai_chat_sent'),
      // Only rows with an actual workout_group count as a "logged" gym day —
      // matches the filter used in summaryCompute.ts for the same table.
      supabase.schema('oasis').from('gym_workout_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).not('workout_group', 'is', null).neq('workout_group', ''),
      supabase.schema('oasis').from('user_activity_log').select('activity_date').eq('user_id', userId),
    ]);

    if (creationResult.error) throw creationResult.error;
    if (taskCountResult.error) throw taskCountResult.error;
    if (goalCountResult.error) throw goalCountResult.error;
    if (chatCountResult.error) throw chatCountResult.error;
    if (gymCountResult.error) throw gymCountResult.error;
    if (activityDatesResult.error) throw activityDatesResult.error;

    const joinedDate = creationResult.data;
    const todayItemsCheckedOff = taskCountResult.count ?? 0;
    const goalsCompleted = goalCountResult.count ?? 0;
    const chatMessagesSent = chatCountResult.count ?? 0;
    const gymDaysLogged = gymCountResult.count ?? 0;

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
        todayItemsCheckedOff,
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

      // Check for new achievements
      const newAchievements = await checkAndUnlockAchievements(userId, supabase);

      res.json({
        success: true,
        ...(newAchievements.length > 0 && { newAchievements }),
      });
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
// HELPER FUNCTIONS
// ============================================

async function calculateProgress(
  userId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<Record<string, number>> {
  const [
    streakResult,
    chatCountResult,
    taskCountResult,
    taskStreakResult,
    balancedWeekResult,
    tripleThreadResult,
    fullEngagementResult,
    firstMonthResult,
    activeMonthsResult,
  ] = await Promise.all([
    // Current streak
    supabase.rpc('get_current_streak', { p_user_id: userId }),
    // Total distinct chats where user sent a message
    supabase.schema('oasis').from('chat_messages').select('chat_id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user'),
    // Total tasks + goals completed
    supabase.schema('oasis').from('user_activity_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('activity_type', ['task_completed', 'goal_completed']),
    // Task completion streak (consecutive days)
    supabase.rpc('get_task_streak', { p_user_id: userId }),
    // Balanced week progress (questions + tasks same week)
    supabase.rpc('get_balanced_week_progress', { p_user_id: userId }),
    // Triple threat status (all 3 features same day)
    supabase.rpc('get_triple_threat_status', { p_user_id: userId }),
    // Full engagement streak (all 3 features for consecutive days)
    supabase.rpc('get_full_engagement_streak', { p_user_id: userId }),
    // First month activity (unique days in first 30 days)
    supabase.rpc('get_first_month_activity_days', { p_user_id: userId }),
    // Active months count
    supabase.rpc('get_active_months_count', { p_user_id: userId }),
  ]);

  // For routine_weekly_completion, check if user had activity on all 7 days of any week
  const { data: weeklyData } = await supabase.schema('oasis').from('user_activity_log')
    .select('activity_date')
    .eq('user_id', userId)
    .order('activity_date');

  let routineWeeklyCompletion = 0;
  if (weeklyData && weeklyData.length > 0) {
    const datesByWeek = new Map<string, Set<string>>();
    for (const row of weeklyData) {
      const date = new Date(row.activity_date);
      const weekKey = getISOWeekKey(date);
      if (!datesByWeek.has(weekKey)) {
        datesByWeek.set(weekKey, new Set());
      }
      datesByWeek.get(weekKey)!.add(row.activity_date);
    }
    for (const [, dates] of datesByWeek) {
      if (dates.size >= 7) {
        routineWeeklyCompletion = 1;
        break;
      }
    }
  }

  // For balanced_week, check if BOTH conditions met (5+ questions AND 5+ tasks this week)
  const balancedWeekData = balancedWeekResult.data?.[0];
  const balancedWeekComplete = (
    balancedWeekData?.questions_this_week >= 5 &&
    balancedWeekData?.tasks_this_week >= 5
  ) ? 1 : 0;

  return {
    streak: streakResult.data ?? 0,
    chat_total: chatCountResult.count ?? 0,
    task_total: taskCountResult.count ?? 0,
    task_streak: taskStreakResult.data ?? 0,
    balanced_week: balancedWeekComplete,
    triple_threat: tripleThreadResult.data ?? 0,
    full_engagement: fullEngagementResult.data ?? 0,
    first_month_active: firstMonthResult.data ?? 0,
    active_months: activeMonthsResult.data ?? 0,
    routine_weekly_completion: routineWeeklyCompletion,
  };
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${weekNum}`;
}

// Per-user cooldown so achievement checks don't fire 11+ DB queries on every task toggle.
// In-memory — resets on server restart, which is fine (just means one extra check).
const achievementCooldowns = new Map<string, number>();
const ACHIEVEMENT_COOLDOWN_MS = 30_000; // 30 seconds per user

async function checkAndUnlockAchievements(
  userId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<Array<{ id: string; title: string }>> {
  const now = Date.now();
  const lastCheck = achievementCooldowns.get(userId) ?? 0;
  if (now - lastCheck < ACHIEVEMENT_COOLDOWN_MS) {
    return [];
  }
  achievementCooldowns.set(userId, now);

  console.log('[checkAndUnlockAchievements] ===== START =====');
  console.log('[checkAndUnlockAchievements] User ID:', userId);

  // Get all achievements and user's already-unlocked ones
  const [achievementsResult, userAchievementsResult] = await Promise.all([
    supabase.schema('oasis').from('achievements').select('*'),
    supabase.schema('oasis').from('user_achievements').select('achievement_id').eq('user_id', userId),
  ]);

  if (achievementsResult.error) {
    console.error('[checkAndUnlockAchievements] ERROR fetching achievements:', achievementsResult.error);
    return [];
  }
  if (userAchievementsResult.error) {
    console.error('[checkAndUnlockAchievements] ERROR fetching user achievements:', userAchievementsResult.error);
    return [];
  }

  const achievements: Achievement[] = achievementsResult.data;
  const unlockedIds = new Set(userAchievementsResult.data.map((ua: any) => ua.achievement_id));

  console.log('[checkAndUnlockAchievements] Total achievements:', achievements.length);
  console.log('[checkAndUnlockAchievements] Already unlocked:', unlockedIds.size);

  // Only check locked achievements
  const lockedAchievements = achievements.filter(a => !unlockedIds.has(a.id));
  console.log('[checkAndUnlockAchievements] Locked achievements to check:', lockedAchievements.length);

  if (lockedAchievements.length === 0) {
    console.log('[checkAndUnlockAchievements] All achievements already unlocked!');
    return [];
  }

  // Calculate current progress
  console.log('[checkAndUnlockAchievements] Calculating progress...');
  const progress = await calculateProgress(userId, supabase);
  console.log('[checkAndUnlockAchievements] Progress values:', JSON.stringify(progress, null, 2));

  const newlyUnlocked: Array<{ id: string; title: string }> = [];

  for (const achievement of lockedAchievements) {
    const currentValue = progress[achievement.requirement_type] ?? 0;

    console.log(`[checkAndUnlockAchievements] Checking: ${achievement.title} (${achievement.requirement_type})`);
    console.log(`[checkAndUnlockAchievements]   Current: ${currentValue}, Required: ${achievement.requirement_value}`);

    if (currentValue >= achievement.requirement_value) {
      console.log(`[checkAndUnlockAchievements]   ✅ UNLOCKING: ${achievement.title}`);

      // Unlock this achievement
      const { error } = await supabase
        .schema('oasis')
        .from('user_achievements')
        .insert({
          user_id: userId,
          achievement_id: achievement.id,
        });

      if (error) {
        console.error(`[checkAndUnlockAchievements]   ❌ ERROR unlocking ${achievement.title}:`, error);
      } else {
        console.log(`[checkAndUnlockAchievements]   ✅ Successfully unlocked ${achievement.title}`);
        newlyUnlocked.push({ id: achievement.id, title: achievement.title });
      }
    } else {
      console.log(`[checkAndUnlockAchievements]   ❌ Not met (${currentValue}/${achievement.requirement_value})`);
    }
  }

  console.log('[checkAndUnlockAchievements] ===== END =====');
  console.log('[checkAndUnlockAchievements] Newly unlocked:', newlyUnlocked.length);

  return newlyUnlocked;
}

// Export the achievement checking function so other routes can use it
export { checkAndUnlockAchievements };

export default router;
