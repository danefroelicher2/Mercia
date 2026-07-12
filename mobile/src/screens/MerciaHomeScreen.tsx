import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { colors } from '../constants/theme';
import { useSubscription } from '../context/SubscriptionContext';
import { getConsent } from '../services/consentService';
import api from '../services/api';
import { RoutineTask, RoutineGoal } from '../types/routine';
import { CreateDailyChatApiResponse } from '../types/chat';
import HomeRings from '../components/HomeRings';
import DailyChatSheet from '../components/DailyChatSheet';
import { TodayRingSheet, MomentumRingSheet, MomentumData } from '../components/RingDetailSheets';
import MonthlyReviewSheet, { MonthlyReviewData } from '../components/MonthlyReviewSheet';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getTodayDayOfWeek(): string {
  const jsDay = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  const index = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 ... Sun=6
  return DAYS[index];
}

// The daily check-in card changes identity with the user's local time of day.
// new Date().getHours() is already device-local (= the user's timezone), and
// the request separately sends the IANA timezone so the backend computes
// "today"/"yesterday" against the user's calendar day, not the server's.
type DayPhase = 'morning' | 'midday' | 'evening' | 'lateNight';

function getDayPhase(now: Date = new Date()): DayPhase {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'midday';
  if (hour >= 18) return 'evening';
  // Midnight–4:59am: the calendar day has flipped but the user is still
  // living "yesterday" — the close-out must review the day they just lived,
  // not the brand-new (empty) calendar day.
  return 'lateNight';
}

interface CheckInCardConfig {
  title: string;
  subtitle: string;
  endpoint: '/api/chat/daily-outlook' | '/api/chat/day-in-review';
  body: Record<string, unknown>;
}

// Morning and midday share the same persistent daily-outlook chat (the
// morning opener bakes in yesterday's recap server-side); evening opens a
// fresh close-out of today via the review endpoint's scope param.
const CHECK_IN_CARDS: Record<DayPhase, CheckInCardConfig> = {
  morning: {
    title: 'Morning Outlook',
    subtitle: "Yesterday's recap and today's plan",
    endpoint: '/api/chat/daily-outlook',
    body: {},
  },
  midday: {
    title: 'Midday Check-In',
    subtitle: "How today's tracking so far",
    endpoint: '/api/chat/daily-outlook',
    body: {},
  },
  evening: {
    title: 'Close Out Today',
    subtitle: 'Wrap up today with Mercia',
    endpoint: '/api/chat/day-in-review',
    body: { scope: 'today' },
  },
  // Same card identity as evening, but past local midnight "the day you just
  // lived" is calendar-yesterday — so it reviews yesterday's numbers.
  lateNight: {
    title: 'Close Out Today',
    subtitle: 'Wrap up your day with Mercia',
    endpoint: '/api/chat/day-in-review',
    body: { scope: 'yesterday' },
  },
};

// Ring 2 ("Overall") category weights — see
// docs/superpowers/specs/2026-07-08-home-tab-rings-design.md for the full reasoning.
const ROUTINE_WEIGHT = 30;
const GYM_WEIGHT = 20;
const WEEKLY_WEIGHT = 20;
const MONTHLY_WEIGHT = 30;

// A task's contribution to the Today ring. Countdown tasks (target_count > 1)
// earn partial credit as they're ticked down — 4 of 5 taps is 0.8, not 0.
// (Weekly Momentum counts binary completions from task_completion_history,
// which has no partial info — partials are a Today-ring-only concept.)
function taskProgress(task: RoutineTask): number {
  if (task.completed) return 1;
  const target = task.target_count ?? 1;
  if (target <= 1) return 0;
  const current = task.current_count ?? target;
  return Math.min(1, Math.max(0, (target - current) / target));
}

// Momentum is a WEEKLY accumulator: each category is simply "banked / total
// for the period" and the whole ring resets with the Routine tab's weekly
// items (Monday 5 AM UTC — see utils/weeklyReset). A goal category with zero
// goals is excluded from the denominator entirely rather than scored 0.
function goalCompletionRatio(goals: RoutineGoal[]): { ratio: number; completed: number; total: number; isActive: boolean } {
  const total = goals.length;
  if (total === 0) return { ratio: 0, completed: 0, total: 0, isActive: false };
  const completed = goals.filter(g => g.completed).length;
  return { ratio: completed / total, completed, total, isActive: true };
}

const MerciaHomeScreen: React.FC = () => {
  // ============================================
  // AUTH
  // ============================================
  const { isSubscribed, isLoadingSubscription } = useSubscription();
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState<boolean>(true);

  // ============================================
  // SHARED STATE
  // ============================================
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // ============================================
  // RINGS STATE
  // ============================================
  const [todayPercentage, setTodayPercentage] = useState(0);
  const [momentumPercentage, setMomentumPercentage] = useState(0);
  const [todayTasks, setTodayTasks] = useState<RoutineTask[]>([]);
  const [momentumData, setMomentumData] = useState<MomentumData | null>(null);
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  const todayRingSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const momentumRingSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const monthlyReviewSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const navigation = useNavigation<any>();

  // ============================================
  // HOME EXTRAS STATE (streak / week strip / up next / monthly review)
  // ============================================
  const [currentStreak, setCurrentStreak] = useState(0);
  const [weekActivity, setWeekActivity] = useState<{ days: Array<{ date: string; active: boolean }>; todayIndex: number } | null>(null);
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReviewData | null>(null);
  const tickingTaskIds = useRef<Set<string>>(new Set());

  // ============================================
  // DAILY CHECK-IN SHEET STATE (time-of-day adaptive)
  // ============================================
  const checkInSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const [checkInChatId, setCheckInChatId] = useState<string | null>(null);
  const [isOpeningCheckIn, setIsOpeningCheckIn] = useState(false);
  const [dayPhase, setDayPhase] = useState<DayPhase>(getDayPhase);

  // ============================================
  // EFFECTS
  // ============================================

  const loadRings = useCallback(async () => {
    try {
      const day = getTodayDayOfWeek();
      const todayIndex = DAYS.indexOf(day); // Mon=0 … Sun=6
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const [tasksRes, weeklyRes, monthlyRes, gymWeekRes, gymTargetRes, summaryRes] = await Promise.all([
        api.get(`/api/routine/tasks/${day}`),
        api.get('/api/routine/goals/weekly'),
        api.get('/api/routine/goals/monthly'),
        api.get('/api/gym/week'),
        api.get('/api/gym/target'),
        // Weekly routine numbers: check-offs Mon→today (task_completion_history)
        // over the FULL Mon–Sun week's task count. Same math as Summary Data.
        api.get(`/api/routine/summary-data?timezone=${encodeURIComponent(timezone)}`),
      ]);

      // Ring 1: today's routine completion %, with partial credit for
      // countdown tasks (a 5-count task at 4 taps contributes 0.8, not 0).
      const tasks: RoutineTask[] = tasksRes.data.success ? (tasksRes.data.data || []) : [];
      const filteredTasks = tasks.filter(t => t.type === 'today');
      const todayRatio = filteredTasks.length > 0
        ? filteredTasks.reduce((sum, t) => sum + taskProgress(t), 0) / filteredTasks.length
        : 0;
      const todayPct = Math.round(todayRatio * 100);
      setTodayTasks(filteredTasks);
      setTodayPercentage(todayPct);

      // Ring 2 ("Momentum"): WEEKLY accumulator — the ring fills across the
      // Mon–Sun week as work gets banked and resets with the weekly items
      // (Monday 5 AM UTC, same clock as the Routine tab's countdown).
      // Weighted across routine + gym + weekly + monthly (no yearly); a goal
      // category with zero goals is excluded entirely (doesn't dilute the
      // percentage for someone who simply doesn't use that feature).
      const weeklyGoals: RoutineGoal[] = weeklyRes.data.success ? (weeklyRes.data.data || []) : [];
      const monthlyGoals: RoutineGoal[] = monthlyRes.data.success ? (monthlyRes.data.data || []) : [];

      // Routine: completions recorded Mon→today over the FULL week's possible
      // count (accumulator: only reaches 100% by finishing the whole week).
      // Binary per task-per-day — countdown partials exist only on the Today ring.
      const currentWeek = summaryRes.data.success ? summaryRes.data.data.current_week : null;
      const weekPossible: number = currentWeek?.total_possible ?? 0;
      const weekCompleted: number = currentWeek?.total_completed ?? 0;
      const routineActive = weekPossible > 0;
      const routineRatio = routineActive ? weekCompleted / weekPossible : 0;

      // Gym: simple fill toward the weekly target, capped at full — a 5th day
      // on a 4-day target neither helps nor hurts. Days counted Mon–today so
      // pre-logging a future day never inflates the score.
      const gymEntries: Array<{ day_of_week: string; workout_group: string }> =
        gymWeekRes.data.success ? (gymWeekRes.data.data || []) : [];
      const gymDaysDone = gymEntries.filter(
        e => e.workout_group && DAYS.indexOf(e.day_of_week) >= 0 && DAYS.indexOf(e.day_of_week) <= todayIndex
      ).length;
      const gymTargetDays: number = gymTargetRes.data.success ? gymTargetRes.data.data.targetDays : 4;
      const gymTargetIsDefault: boolean = gymTargetRes.data.success ? gymTargetRes.data.data.isDefault : true;
      const gymRatio = Math.min(1, gymDaysDone / Math.max(1, gymTargetDays));

      // Weekly/monthly goals: plain completed/total for their periods. (The
      // monthly slice persists through Monday resets by design — month
      // progress is real standing momentum, so the ring doesn't start the
      // week at exactly 0%.)
      const weeklyResult = goalCompletionRatio(weeklyGoals);
      const monthlyResult = goalCompletionRatio(monthlyGoals);

      let activeWeight = GYM_WEIGHT;
      let rawScore = gymRatio * GYM_WEIGHT;
      if (routineActive) {
        activeWeight += ROUTINE_WEIGHT;
        rawScore += routineRatio * ROUTINE_WEIGHT;
      }
      if (weeklyResult.isActive) {
        activeWeight += WEEKLY_WEIGHT;
        rawScore += weeklyResult.ratio * WEEKLY_WEIGHT;
      }
      if (monthlyResult.isActive) {
        activeWeight += MONTHLY_WEIGHT;
        rawScore += monthlyResult.ratio * MONTHLY_WEIGHT;
      }

      const momentum = activeWeight > 0
        ? Math.min(100, Math.max(0, Math.round((rawScore / activeWeight) * 100)))
        : 0;
      setMomentumPercentage(momentum);

      // Per-category breakdown for the Momentum detail sheet — same numbers
      // that built the composite, kept instead of discarded.
      setMomentumData({
        percentage: momentum,
        routine: {
          active: routineActive,
          percent: routineRatio * 100,
          weight: ROUTINE_WEIGHT,
          detail: `${weekCompleted}/${weekPossible} this week`,
        },
        gym: {
          active: true,
          percent: gymRatio * 100,
          weight: GYM_WEIGHT,
          detail: gymDaysDone >= gymTargetDays ? 'Target met ✓' : `${gymDaysDone} of ${gymTargetDays} days`,
          done: gymDaysDone,
          target: gymTargetDays,
          isDefaultTarget: gymTargetIsDefault,
        },
        weekly: {
          active: weeklyResult.isActive,
          percent: weeklyResult.ratio * 100,
          weight: WEEKLY_WEIGHT,
          detail: `${weeklyResult.completed}/${weeklyResult.total} done`,
        },
        monthly: {
          active: monthlyResult.isActive,
          percent: monthlyResult.ratio * 100,
          weight: MONTHLY_WEIGHT,
          detail: `${monthlyResult.completed}/${monthlyResult.total} this month`,
        },
      });
    } catch (error) {
      console.error('[MerciaHomeScreen] Error loading rings:', error);
    }
  }, []);

  // Streak chip, week strip, and monthly review card. Separate from
  // loadRings so a failure here never blanks the rings, and vice versa.
  const loadHomeExtras = useCallback(async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [streaksRes, weekRes, reviewRes] = await Promise.allSettled([
      api.get('/api/stats/streaks'),
      api.get(`/api/stats/week-activity?timezone=${encodeURIComponent(timezone)}`),
      api.get(`/api/stats/monthly-review?timezone=${encodeURIComponent(timezone)}`),
    ]);

    if (streaksRes.status === 'fulfilled' && streaksRes.value.data.success) {
      setCurrentStreak(streaksRes.value.data.data.currentStreak ?? 0);
    }
    if (weekRes.status === 'fulfilled' && weekRes.value.data.success) {
      setWeekActivity(weekRes.value.data.data);
    }
    if (reviewRes.status === 'fulfilled' && reviewRes.value.data.success) {
      setMonthlyReview(reviewRes.value.data.data); // null when prior month has no data
    }
  }, []);

  // Recompute both rings every time this tab gains focus, so crossing items
  // off (or undoing them) anywhere — Routine tasks, goals, gym log — is
  // always reflected accurately when the user comes back here. The check-in
  // card's phase is re-derived at the same time so a stale card never
  // survives a tab switch.
  useFocusEffect(
    useCallback(() => {
      loadRings();
      loadHomeExtras();
      setDayPhase(getDayPhase());
    }, [loadRings, loadHomeExtras])
  );

  // Keep the phase current while the screen stays open across a boundary
  // (e.g. sitting on Home at 11:59am) — cheap once-a-minute local check.
  useEffect(() => {
    const interval = setInterval(() => setDayPhase(getDayPhase()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load consent state once on mount
  useEffect(() => {
    getConsent().then(value => {
      setHasConsent(value);
      setIsLoadingConsent(false);
    });
  }, []);

  // Log subscription state for debugging (navigation guards are handled in MainNavigator tabPress)
  useEffect(() => {
    console.log('[MerciaHomeScreen] subscription state — isSubscribed:', isSubscribed, '| isLoadingSubscription:', isLoadingSubscription, '| hasConsent:', hasConsent, '| isLoadingConsent:', isLoadingConsent);
  }, [isSubscribed, isLoadingSubscription, hasConsent, isLoadingConsent]);

  // ============================================
  // HANDLERS
  // ============================================

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadRings(), loadHomeExtras()]);
    setIsRefreshing(false);
  };

  // Up Next: complete a task in place. Uses the same server-side tick as the
  // Routine tab (countdown tasks decrement one step per tap), then reloads
  // the rings so Today %, Momentum, task list, and streak stay consistent.
  const handleTickUpNext = async (taskId: string) => {
    if (tickingTaskIds.current.has(taskId)) return;
    tickingTaskIds.current.add(taskId);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.patch(`/api/routine/tasks/${taskId}`, { timezone });
      await Promise.all([loadRings(), loadHomeExtras()]);
    } catch (error) {
      console.error('[MerciaHomeScreen] Error ticking task:', error);
    } finally {
      tickingTaskIds.current.delete(taskId);
    }
  };

  const handleOpenMonthlyReview = () => {
    monthlyReviewSheetRef.current?.present();
  };

  // Open the sheet immediately (it shows its own "aggregating" loading
  // bubble), then find-or-create the chat for the current phase's endpoint in
  // the background. Morning/midday share the persistent daily-outlook chat
  // (resets at the user's local midnight); evening always regenerates a fresh
  // close-out of today. The IANA timezone is sent so the backend computes
  // dates against the user's calendar day, not the server's.
  const handleOpenCheckIn = () => {
    if (isOpeningCheckIn) return;
    const config = CHECK_IN_CARDS[dayPhase];

    setIsOpeningCheckIn(true);
    setCheckInChatId(null);
    checkInSheetRef.current?.present();

    (async () => {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await api.post<CreateDailyChatApiResponse>(config.endpoint, {
          timezone,
          ...config.body,
        });
        if (response.data.success && response.data.data) {
          setCheckInChatId(response.data.data.chat.id);
        }
      } catch (error) {
        console.error(`[MerciaHomeScreen] Error opening ${config.endpoint}:`, error);
      } finally {
        setIsOpeningCheckIn(false);
      }
    })();
  };

  const handleOpenTodayRing = () => {
    todayRingSheetRef.current?.present();
  };

  const handleOpenMomentumRing = () => {
    momentumRingSheetRef.current?.present();
  };

  const handleGoToRoutine = () => {
    todayRingSheetRef.current?.dismiss();
    navigation.navigate('Routine');
  };

  // Persist the weekly gym target, then recompute the rings — the open sheet
  // re-renders from the refreshed momentumData.
  const handleChangeGymTarget = async (targetDays: number) => {
    if (isSavingTarget) return;
    setIsSavingTarget(true);
    try {
      await api.put('/api/gym/target', { targetDays });
      await loadRings();
    } catch (error) {
      console.error('[MerciaHomeScreen] Error saving gym target:', error);
    } finally {
      setIsSavingTarget(false);
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  const upNextTasks = todayTasks.filter(t => !t.completed).slice(0, 2);
  const upNextRemaining = todayTasks.filter(t => !t.completed).length;
  // Monthly review card only appears the first week of a new month, and only
  // when the prior month actually has logged data.
  const showMonthlyReview = monthlyReview != null && new Date().getDate() <= 7;
  const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor="transparent"
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Rings */}
        <HomeRings
          todayPercentage={todayPercentage}
          momentumPercentage={momentumPercentage}
          onPressToday={handleOpenTodayRing}
          onPressMomentum={handleOpenMomentumRing}
        />

        {/* Streak chip */}
        {currentStreak > 0 && (
          <View style={styles.streakChipRow}>
            <View style={styles.streakChip}>
              <Text style={styles.streakChipText}>
                🔥 {currentStreak}-day streak
              </Text>
            </View>
          </View>
        )}

        {/* Week strip — Mon-Sun activity dots */}
        {weekActivity && (
          <View style={styles.weekStrip}>
            {weekActivity.days.map((d, index) => {
              const isToday = index === weekActivity.todayIndex;
              const isFuture = index > weekActivity.todayIndex;
              return (
                <View key={d.date} style={styles.weekStripDay}>
                  <Text style={[styles.weekStripLetter, isToday && styles.weekStripLetterToday]}>
                    {WEEK_LETTERS[index]}
                  </Text>
                  <View
                    style={[
                      styles.weekStripDot,
                      d.active && styles.weekStripDotActive,
                      isToday && styles.weekStripDotToday,
                      isFuture && styles.weekStripDotFuture,
                    ]}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* Daily check-in — one card whose identity follows the time of day */}
        <TouchableOpacity
          style={styles.outlookCard}
          onPress={handleOpenCheckIn}
          activeOpacity={0.8}
          disabled={isOpeningCheckIn}
        >
          <View style={styles.outlookTextContainer}>
            <Text style={styles.outlookTitle}>{CHECK_IN_CARDS[dayPhase].title}</Text>
            <Text style={styles.outlookSubtitle}>{CHECK_IN_CARDS[dayPhase].subtitle}</Text>
          </View>
          <Text style={styles.outlookArrow}>›</Text>
        </TouchableOpacity>

        {/* Up Next — top unfinished tasks, completable in place */}
        {upNextTasks.length > 0 && (
          <View style={styles.upNextCard}>
            <Text style={styles.upNextLabel}>UP NEXT</Text>
            {upNextTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                style={styles.upNextRow}
                onPress={() => handleTickUpNext(task.id)}
                activeOpacity={0.7}
              >
                <View style={styles.upNextCheck} />
                <Text style={styles.upNextText} numberOfLines={1}>{task.text}</Text>
                {(task.target_count ?? 1) > 1 && (
                  <Text style={styles.upNextCount}>
                    {(task.current_count ?? 1)} left
                  </Text>
                )}
              </TouchableOpacity>
            ))}
            {upNextRemaining > 2 && (
              <TouchableOpacity onPress={() => navigation.navigate('Routine')}>
                <Text style={styles.upNextMore}>+{upNextRemaining - 2} more →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Monthly review — appears the first week of a new month */}
        {showMonthlyReview && (
          <TouchableOpacity
            style={[styles.outlookCard, styles.monthlyReviewCard]}
            onPress={handleOpenMonthlyReview}
            activeOpacity={0.8}
          >
            <View style={styles.outlookTextContainer}>
              <Text style={styles.outlookTitle}>Your {monthlyReview!.monthLabel.split(' ')[0]} review is ready</Text>
              <Text style={styles.outlookSubtitle}>
                {monthlyReview!.avgOverall}% average momentum · {monthlyReview!.gymSessions} gym sessions
              </Text>
            </View>
            <Text style={[styles.outlookArrow, { color: '#D9A03F' }]}>›</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Daily check-in sheet */}
      <DailyChatSheet ref={checkInSheetRef} chatId={checkInChatId} isGenerating={isOpeningCheckIn} />

      {/* Ring detail sheets */}
      <TodayRingSheet
        ref={todayRingSheetRef}
        percentage={todayPercentage}
        tasks={todayTasks}
        onGoToRoutine={handleGoToRoutine}
      />
      <MomentumRingSheet
        ref={momentumRingSheetRef}
        data={momentumData}
        isSavingTarget={isSavingTarget}
        onChangeGymTarget={handleChangeGymTarget}
      />
      <MonthlyReviewSheet ref={monthlyReviewSheetRef} data={monthlyReview} />
    </SafeAreaView>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  outlookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    borderTopWidth: 3,
    borderTopColor: '#7B9EFF',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 16,
  },
  outlookTextContainer: {
    flex: 1,
  },
  outlookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 2,
  },
  outlookSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  outlookArrow: {
    fontSize: 22,
    color: '#7B9EFF',
    fontWeight: '300',
    marginLeft: 8,
  },

  // Streak chip
  streakChipRow: {
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 12,
  },
  streakChip: {
    backgroundColor: 'rgba(217, 160, 63, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 160, 63, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  streakChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D9A03F',
  },

  // Week strip
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  weekStripDay: {
    alignItems: 'center',
    gap: 6,
  },
  weekStripLetter: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  weekStripLetterToday: {
    color: '#00D9A0',
  },
  weekStripDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
  },
  weekStripDotActive: {
    backgroundColor: '#00D9A0',
  },
  weekStripDotToday: {
    borderWidth: 1.5,
    borderColor: '#00D9A0',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  weekStripDotFuture: {
    backgroundColor: '#1E1E1E',
  },

  // Up Next
  upNextCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
  },
  upNextLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#666',
    marginBottom: 8,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  upNextCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#00D9A0',
    flexShrink: 0,
  },
  upNextText: {
    flex: 1,
    fontSize: 14,
    color: '#E8E8E8',
  },
  upNextCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00D9A0',
  },
  upNextMore: {
    fontSize: 12,
    fontWeight: '500',
    color: '#00D9A0',
    marginTop: 6,
  },

  // Monthly review card accent
  monthlyReviewCard: {
    borderTopColor: '#D9A03F',
  },
});

export default MerciaHomeScreen;
