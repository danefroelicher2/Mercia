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
import { useFocusEffect } from '@react-navigation/native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { colors } from '../constants/theme';
import { useSubscription } from '../context/SubscriptionContext';
import { getConsent } from '../services/consentService';
import api from '../services/api';
import { RoutineTask, RoutineGoal } from '../types/routine';
import { CreateDailyChatApiResponse } from '../types/chat';
import HomeRings from '../components/HomeRings';
import DailyChatSheet from '../components/DailyChatSheet';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getTodayDayOfWeek(): string {
  const jsDay = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  const index = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 ... Sun=6
  return DAYS[index];
}

// Ring 2 ("Overall") category weights — see
// docs/superpowers/specs/2026-07-08-home-tab-rings-design.md for the full reasoning.
const ROUTINE_WEIGHT = 30;
const GYM_WEIGHT = 20;
const WEEKLY_WEIGHT = 20;
const MONTHLY_WEIGHT = 30;

function ratio(completed: number, total: number): number {
  return total > 0 ? completed / total : 0;
}

function getLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

interface GoalCategoryResult {
  score: number;
  isActive: boolean;
}

// Weekly/monthly goals reset to 0% every day — completing something today
// only counts against what's still left over from before today, so finishing
// a whole list early in the period doesn't get "used up" and penalize the
// days that follow, and a fresh item added mid-period just changes what's
// left, not what was already earned.
function computeGoalCategoryScore(
  goals: RoutineGoal[],
  weight: number,
  todayDateStr: string,
  timezone: string
): GoalCategoryResult {
  const total = goals.length;
  if (total === 0) {
    // No goals of this type at all — excluded from the calculation entirely,
    // not just "0 points" (that would still dilute the denominator).
    return { score: 0, isActive: false };
  }

  let alreadyDoneBeforeToday = 0;
  let completedToday = 0;
  for (const goal of goals) {
    if (!goal.completed || !goal.completed_at) continue;
    const completedDateStr = getLocalDateString(new Date(goal.completed_at), timezone);
    if (completedDateStr < todayDateStr) {
      alreadyDoneBeforeToday++;
    } else if (completedDateStr === todayDateStr) {
      completedToday++;
    }
  }

  const remaining = total - alreadyDoneBeforeToday;
  const score = remaining === 0
    ? weight // nothing left — already finished, full credit, no penalty
    : weight * (completedToday / remaining);

  return { score, isActive: true };
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
  const [overallPercentage, setOverallPercentage] = useState(0);

  // ============================================
  // DAILY OUTLOOK / DAY IN REVIEW SHEET STATE
  // ============================================
  const outlookSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const [outlookChatId, setOutlookChatId] = useState<string | null>(null);
  const [isOpeningOutlook, setIsOpeningOutlook] = useState(false);

  const reviewSheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const [reviewChatId, setReviewChatId] = useState<string | null>(null);
  const [isOpeningReview, setIsOpeningReview] = useState(false);

  // ============================================
  // EFFECTS
  // ============================================

  const loadRings = useCallback(async () => {
    try {
      const day = getTodayDayOfWeek();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const todayDateStr = getLocalDateString(new Date(), timezone);

      const [tasksRes, weeklyRes, monthlyRes, gymRes] = await Promise.all([
        api.get(`/api/routine/tasks/${day}`),
        api.get('/api/routine/goals/weekly'),
        api.get('/api/routine/goals/monthly'),
        api.get(`/api/gym/log/${day}`),
      ]);

      // Ring 1: today's routine completion %
      const tasks: RoutineTask[] = tasksRes.data.success ? (tasksRes.data.data || []) : [];
      const todayTasks = tasks.filter(t => t.type === 'today');
      const todayCompleted = todayTasks.filter(t => t.completed).length;
      const todayRatio = ratio(todayCompleted, todayTasks.length);
      setTodayPercentage(Math.round(todayRatio * 100));

      // Ring 2: weighted composite — routine + gym + weekly + monthly (no yearly).
      // Each category is either "active" (has data, counts toward the total)
      // or excluded entirely (no goals of that type at all — doesn't dilute
      // the percentage for someone who simply doesn't use that feature).
      const weeklyGoals: RoutineGoal[] = weeklyRes.data.success ? (weeklyRes.data.data || []) : [];
      const monthlyGoals: RoutineGoal[] = monthlyRes.data.success ? (monthlyRes.data.data || []) : [];
      const gymLoggedToday = gymRes.data.success && gymRes.data.data != null;

      const routineActive = todayTasks.length > 0;
      const routineScore = routineActive ? todayRatio * ROUTINE_WEIGHT : 0;

      // Gym has no "total items" concept (it's a single daily yes/no), so unlike
      // the other three it's always counted, never excluded.
      const gymScore = gymLoggedToday ? GYM_WEIGHT : 0;

      const weeklyResult = computeGoalCategoryScore(weeklyGoals, WEEKLY_WEIGHT, todayDateStr, timezone);
      const monthlyResult = computeGoalCategoryScore(monthlyGoals, MONTHLY_WEIGHT, todayDateStr, timezone);

      let activeWeight = GYM_WEIGHT;
      let rawScore = gymScore;
      if (routineActive) {
        activeWeight += ROUTINE_WEIGHT;
        rawScore += routineScore;
      }
      if (weeklyResult.isActive) {
        activeWeight += WEEKLY_WEIGHT;
        rawScore += weeklyResult.score;
      }
      if (monthlyResult.isActive) {
        activeWeight += MONTHLY_WEIGHT;
        rawScore += monthlyResult.score;
      }

      const overall = activeWeight > 0 ? Math.round((rawScore / activeWeight) * 100) : 0;
      setOverallPercentage(Math.min(100, Math.max(0, overall)));
    } catch (error) {
      console.error('[MerciaHomeScreen] Error loading rings:', error);
    }
  }, []);

  // Recompute both rings every time this tab gains focus, so crossing items
  // off (or undoing them) anywhere — Routine tasks, goals, gym log — is
  // always reflected accurately when the user comes back here.
  useFocusEffect(
    useCallback(() => {
      loadRings();
    }, [loadRings])
  );

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
    await loadRings();
    setIsRefreshing(false);
  };

  // Shared by both cards: open the sheet immediately (it shows its own
  // "aggregating" loading bubble), then find-or-create today's chat for this
  // endpoint in the background. A chat persists across app backgrounding/tab
  // switches for the rest of the day and resets at midnight — see
  // /api/chat/daily-outlook and /api/chat/day-in-review on the backend.
  const openDailyChat = (
    endpoint: '/api/chat/daily-outlook' | '/api/chat/day-in-review',
    sheetRef: React.RefObject<React.ElementRef<typeof BottomSheetModal> | null>,
    setChatId: (id: string | null) => void,
    setIsOpening: (value: boolean) => void
  ) => {
    setIsOpening(true);
    setChatId(null);
    sheetRef.current?.present();

    (async () => {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await api.post<CreateDailyChatApiResponse>(endpoint, { timezone });
        if (response.data.success && response.data.data) {
          setChatId(response.data.data.chat.id);
        }
      } catch (error) {
        console.error(`[MerciaHomeScreen] Error opening ${endpoint}:`, error);
      } finally {
        setIsOpening(false);
      }
    })();
  };

  const handleOpenDailyOutlook = () => {
    if (isOpeningOutlook) return;
    openDailyChat('/api/chat/daily-outlook', outlookSheetRef, setOutlookChatId, setIsOpeningOutlook);
  };

  const handleOpenDayInReview = () => {
    if (isOpeningReview) return;
    openDailyChat('/api/chat/day-in-review', reviewSheetRef, setReviewChatId, setIsOpeningReview);
  };

  // ============================================
  // MAIN RENDER
  // ============================================

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
        <HomeRings todayPercentage={todayPercentage} overallPercentage={overallPercentage} />

        {/* Day in Review */}
        <TouchableOpacity
          style={styles.outlookCard}
          onPress={handleOpenDayInReview}
          activeOpacity={0.8}
          disabled={isOpeningReview}
        >
          <View style={styles.outlookTextContainer}>
            <Text style={styles.outlookTitle}>Day in Review</Text>
            <Text style={styles.outlookSubtitle}>Look back at yesterday with Mercia</Text>
          </View>
          <Text style={styles.outlookArrow}>›</Text>
        </TouchableOpacity>

        {/* Daily Outlook */}
        <TouchableOpacity
          style={styles.outlookCard}
          onPress={handleOpenDailyOutlook}
          activeOpacity={0.8}
          disabled={isOpeningOutlook}
        >
          <View style={styles.outlookTextContainer}>
            <Text style={styles.outlookTitle}>Daily Outlook</Text>
            <Text style={styles.outlookSubtitle}>Talk to Mercia about your day</Text>
          </View>
          <Text style={styles.outlookArrow}>›</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Day in Review Sheet */}
      <DailyChatSheet ref={reviewSheetRef} chatId={reviewChatId} isGenerating={isOpeningReview} />

      {/* Daily Outlook Sheet */}
      <DailyChatSheet ref={outlookSheetRef} chatId={outlookChatId} isGenerating={isOpeningOutlook} />
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
});

export default MerciaHomeScreen;
