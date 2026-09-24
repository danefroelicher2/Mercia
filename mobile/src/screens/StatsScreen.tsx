import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import ActivityHeatmap from '../components/ActivityHeatmap';
import StreakSummary, { StreakData } from '../components/StreakSummary';
import YearStats, { LiveExtras } from '../components/YearStats';
import type { ArchivedYearData } from './statsArchiveData';

const REFRESH_TINT = '#1D9E75';

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
      const response = await api.get('/api/stats/streaks');
      setStreakData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch streak data:', error);
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
            tintColor={REFRESH_TINT}
          />
        }
      >
        <StreakSummary data={streakData} />

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
});

export default StatsScreen;
