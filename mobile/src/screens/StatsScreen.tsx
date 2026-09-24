import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import ActivityHeatmap from '../components/ActivityHeatmap';
import YearStats, { LiveExtras } from '../components/YearStats';
import type { ArchivedYearData } from './statsArchiveData';

const colors = {
  screenBg: '#0D0D0D',
  cardBg: '#161616',
  textPrimary: '#E8E8E8',
  textSecondary: '#888',
  textTertiary: '#666',
  primary: '#1D9E75',
  border: '#232323',
};

interface StreakData {
  currentStreak: number;
  longestStreak: {
    length: number;
    endedAt: string | null;
    isCurrent: boolean;
  };
}

interface HeatmapDay {
  date: string;
  count: number;
}

interface HeatmapData {
  year: number;
  month: number;
  days: HeatmapDay[];
  canGoPrevious: boolean;
  canGoNext: boolean;
}


const StatsScreen: React.FC = () => {
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loadingStreak, setLoadingStreak] = useState(true);

  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // This year so far — the same layout a Stats Archive year uses.
  const [year, setYear] = useState<{ year: ArchivedYearData; live: LiveExtras } | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs so month navigation always reads the latest state.
  const heatmapRef = useRef(heatmapData);
  const yearRef = useRef(currentYear);
  const monthRef = useRef(currentMonth);
  heatmapRef.current = heatmapData;
  yearRef.current = currentYear;
  monthRef.current = currentMonth;

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev' && heatmapRef.current?.canGoPrevious) {
      if (monthRef.current === 1) {
        setCurrentYear(yearRef.current - 1);
        setCurrentMonth(12);
      } else {
        setCurrentMonth(monthRef.current - 1);
      }
    } else if (direction === 'next' && heatmapRef.current?.canGoNext) {
      if (monthRef.current === 12) {
        setCurrentYear(yearRef.current + 1);
        setCurrentMonth(1);
      } else {
        setCurrentMonth(monthRef.current + 1);
      }
    }
  }, []);


  // Refetch all data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchStreakData();
      fetchHeatmapData();
      fetchYear();
    }, [currentYear, currentMonth])
  );

  // Refetch heatmap when month changes (in addition to focus)
  useEffect(() => {
    fetchHeatmapData();
  }, [currentYear, currentMonth]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchStreakData(),
      fetchHeatmapData(),
      fetchYear(),
    ]);
    setIsRefreshing(false);
  };

  const fetchStreakData = async () => {
    try {
      setLoadingStreak(true);
      const response = await api.get('/api/stats/streaks');
      setStreakData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch streak data:', error);
    } finally {
      setLoadingStreak(false);
    }
  };

  const fetchHeatmapData = async () => {
    try {
      const response = await api.get(
        `/api/stats/heatmap?year=${currentYear}&month=${currentMonth}`
      );
      setHeatmapData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error);
    }
  };

  const fetchYear = async () => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await api.get(`/api/stats/year?timezone=${encodeURIComponent(timezone)}`);
      setYear(response.data.data ?? null);
    } catch (error) {
      console.error('Failed to fetch year stats:', error);
    }
  };


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Streak Cards */}
        <View style={styles.streakContainer}>
          <View style={styles.streakCard}>
            <Text style={styles.streakLabel}>Current streak</Text>
            {loadingStreak ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.streakNumberRow}>
                <Text style={styles.streakNumber}>{streakData?.currentStreak ?? 0}</Text>
                <Text style={styles.streakUnit}>days</Text>
              </View>
            )}
          </View>

          <View style={styles.streakCard}>
            <Text style={styles.streakLabel}>Best streak</Text>
            {loadingStreak ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.streakNumberRow}>
                <Text style={styles.streakNumber}>{streakData?.longestStreak.length ?? 0}</Text>
                <Text style={styles.streakUnit}>days</Text>
              </View>
            )}
          </View>
        </View>

        <ActivityHeatmap
          year={currentYear}
          month={currentMonth}
          days={heatmapData && heatmapData.year === currentYear && heatmapData.month === currentMonth ? heatmapData.days : null}
          canGoPrevious={!!heatmapData?.canGoPrevious}
          canGoNext={!!heatmapData?.canGoNext}
          onPrevious={() => navigateMonth('prev')}
          onNext={() => navigateMonth('next')}
        />

        {/* This year so far, laid out like a Stats Archive year */}
        {year ? <YearStats data={year.year} live={year.live} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },

  // Streak Cards
  streakContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  streakCard: {
    flex: 1,
    backgroundColor: 'rgba(29, 158, 117, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29, 158, 117, 0.3)',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  streakLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#777',
    marginBottom: 10,
    fontWeight: '500',
  },
  streakNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  streakNumber: {
    fontSize: 32,
    fontWeight: '500',
    color: '#5DCAA5',
  },
  streakUnit: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
  },


});

export default StatsScreen;
