import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getSupabase } from '../services/supabase';
import { Achievement, UserAchievement } from '../types/stats';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const logActivitySchema = z.object({
  activityType: z.enum(['question_answered', 'ai_chat_sent', 'task_completed', 'goal_completed']),
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
// POST /api/stats/log-activity
// ============================================
router.post(
  '/log-activity',
  validate(logActivitySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { activityType } = req.body;
      const supabase = getSupabase();

      // Insert activity log
      const { error: logError } = await supabase
        .schema('oasis')
        .from('user_activity_log')
        .insert({
          user_id: userId,
          activity_type: activityType,
          activity_date: new Date().toISOString().split('T')[0],
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
    questionCountResult,
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
    // Total questions answered
    supabase.schema('oasis').from('user_question_responses').select('id', { count: 'exact', head: true }).eq('user_id', userId),
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
    question_total: questionCountResult.count ?? 0,
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

async function checkAndUnlockAchievements(
  userId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<Array<{ id: string; title: string }>> {
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
