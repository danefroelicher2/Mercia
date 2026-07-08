import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/theme';
import { useSubscription } from '../context/SubscriptionContext';
import { getConsent } from '../services/consentService';
import api from '../services/api';
import { WeeklySummary } from '../types/summary';
import { RoutineTask, RoutineGoal } from '../types/routine';
import HomeRings from '../components/HomeRings';
import WeeklySummaryBanner from '../components/WeeklySummaryBanner';
import WeeklySummaryModal from '../components/WeeklySummaryModal';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getTodayDayOfWeek(): string {
  const jsDay = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  const index = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 ... Sun=6
  return DAYS[index];
}

// Ring 2 ("Overall") category weights and floors — see
// docs/superpowers/specs/2026-07-08-home-tab-rings-design.md for the full reasoning.
const ROUTINE_WEIGHT = 30;
const GYM_WEIGHT = 20;
const WEEKLY_WEIGHT = 20;
const WEEKLY_FLOOR = 5;
const MONTHLY_WEIGHT = 30;
const MONTHLY_FLOOR = 17;

function ratio(completed: number, total: number): number {
  return total > 0 ? completed / total : 0;
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
  // DAILY SUMMARY STATE
  // ============================================
  const [currentSummary, setCurrentSummary] = useState<WeeklySummary | null>(null);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveSummary, setLiveSummary] = useState<WeeklySummary | null>(null);

  // ============================================
  // RINGS STATE
  // ============================================
  const [todayPercentage, setTodayPercentage] = useState(0);
  const [overallPercentage, setOverallPercentage] = useState(0);

  // ============================================
  // EFFECTS
  // ============================================

  const loadRings = useCallback(async () => {
    try {
      const day = getTodayDayOfWeek();
      const [tasksRes, weeklyRes, monthlyRes, gymRes] = await Promise.all([
        api.get(`/api/routine/tasks/${day}`),
        api.get('/api/routine/goals/weekly'),
        api.get('/api/routine/goals/monthly'),
        api.get(`/api/gym/log/${day}`),
      ]);

      // Ring 1: today's routine completion %
      const tasks: RoutineTask[] = tasksRes.data.success ? (tasksRes.data.data || []) : [];
      const todayTasks = tasks.filter(t => t.type === 'non-negotiable');
      const todayCompleted = todayTasks.filter(t => t.completed).length;
      const todayRatio = ratio(todayCompleted, todayTasks.length);
      setTodayPercentage(Math.round(todayRatio * 100));

      // Ring 2: weighted composite — routine + gym + weekly + monthly (no yearly)
      const weeklyGoals: RoutineGoal[] = weeklyRes.data.success ? (weeklyRes.data.data || []) : [];
      const monthlyGoals: RoutineGoal[] = monthlyRes.data.success ? (monthlyRes.data.data || []) : [];
      const gymLoggedToday = gymRes.data.success && gymRes.data.data != null;

      const routineScore = todayRatio * ROUTINE_WEIGHT;
      const gymScore = gymLoggedToday ? GYM_WEIGHT : 0;
      const weeklyRatio = ratio(weeklyGoals.filter(g => g.completed).length, weeklyGoals.length);
      const weeklyScore = WEEKLY_FLOOR + (WEEKLY_WEIGHT - WEEKLY_FLOOR) * weeklyRatio;
      const monthlyRatio = ratio(monthlyGoals.filter(g => g.completed).length, monthlyGoals.length);
      const monthlyScore = MONTHLY_FLOOR + (MONTHLY_WEIGHT - MONTHLY_FLOOR) * monthlyRatio;

      const overall = Math.round(routineScore + gymScore + weeklyScore + monthlyScore);
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

  // Load daily summary on mount and show last-chance modal for unsaved summaries
  useEffect(() => {
    // Fire-and-forget: delete old unsaved summaries from DB on each mount
    api.delete('/api/summaries/cleanup-old').catch(() => {});

    const loadSummary = async () => {
      try {
        const response = await api.get('/api/summaries/current');
        if (response.data.success && response.data.data) {
          const summary: WeeklySummary = response.data.data;
          // Only show banner for summaries from yesterday or today — ignore stale records
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const todayStr = new Date().toISOString().split('T')[0];
          if (summary.week_end_date >= yesterdayStr && summary.week_end_date <= todayStr) {
            setCurrentSummary(summary);
          }
        }
      } catch (error) {
        console.error('[MerciaHomeScreen] Error loading summary:', error);
      }
    };
    loadSummary();
  }, []);

  // ============================================
  // HANDLERS
  // ============================================

  const handleOpenSummary = async () => {
    setSummaryModalVisible(true);
    setLiveLoading(true);
    setLiveSummary(null);
    try {
      const res = await api.get('/api/summaries/live');
      if (res.data.success) {
        setLiveSummary(res.data.data);
      } else {
        setLiveSummary(currentSummary);
      }
    } catch {
      setLiveSummary(currentSummary);
    } finally {
      setLiveLoading(false);
    }
  };

  const handleSaveSummary = async (summaryId: string) => {
    await api.patch(`/api/summaries/${summaryId}/save`);
    setCurrentSummary(prev => prev ? { ...prev, is_saved: true } : null);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadRings();
    setIsRefreshing(false);
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

        {/* Daily Summary Banner */}
        <WeeklySummaryBanner
          summary={currentSummary}
          onPress={handleOpenSummary}
        />
      </ScrollView>

      {/* Daily Summary Modal */}
      <WeeklySummaryModal
        visible={summaryModalVisible}
        summary={liveSummary}
        loading={liveLoading}
        onDismiss={() => {
          setSummaryModalVisible(false);
          setLiveSummary(null);
        }}
        onSave={liveSummary?.id !== 'live' ? handleSaveSummary : undefined}
      />
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
});

export default MerciaHomeScreen;
