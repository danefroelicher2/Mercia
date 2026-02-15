import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const colors = {
  screenBg: '#1A1A1A',
  cardBg: '#2A2A2A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  primary: '#FF6B35',
  border: '#3A3A3A',
  heatmapEmpty: '#2A2A2A',
  heatmapLight: '#3D5A3D',
  heatmapMedium: '#4A7A4A',
  heatmapDark: '#00D9A0',
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

interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  requirement: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Format date as M/D/YY (e.g., "1/14/25")
const formatCompletionDate = (isoDate: string | null): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
};

const StatsScreen: React.FC = () => {
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [loadingStreak, setLoadingStreak] = useState(true);

  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [loadingHeatmap, setLoadingHeatmap] = useState(true);

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for swipe navigation (to access latest state in PanResponder)
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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 40,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          navigateMonth('prev');
        } else if (gestureState.dx < -50) {
          navigateMonth('next');
        }
      },
    })
  ).current;

  // Refetch all data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchStreakData();
      fetchHeatmapData();
      fetchAchievements();
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
      fetchAchievements(),
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
      setLoadingHeatmap(true);
      const response = await api.get(
        `/api/stats/heatmap?year=${currentYear}&month=${currentMonth}`
      );
      setHeatmapData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error);
    } finally {
      setLoadingHeatmap(false);
    }
  };

  const fetchAchievements = async () => {
    try {
      setLoadingAchievements(true);
      const response = await api.get('/api/stats/achievements');
      setAchievements(response.data.data);
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
    } finally {
      setLoadingAchievements(false);
    }
  };

  const getHeatmapColor = (count: number): string => {
    if (count === 0) return colors.heatmapEmpty;
    if (count === 1) return colors.heatmapLight;
    if (count <= 3) return colors.heatmapMedium;
    return colors.heatmapDark;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Current';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderCalendarGrid = () => {
    if (!heatmapData) return null;

    const { year, month, days } = heatmapData;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const activityMap = new Map<number, number>();
    days.forEach((day) => {
      const dayNum = parseInt(day.date.split('-')[2]);
      activityMap.set(dayNum, day.count);
    });

    const cells: React.JSX.Element[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.calendarCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const count = activityMap.get(day) || 0;
      const bgColor = getHeatmapColor(count);

      cells.push(
        <View key={day} style={[styles.calendarCell, { backgroundColor: bgColor }]}>
          <Text style={styles.calendarDayText}>{day}</Text>
        </View>
      );
    }

    return cells;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
            <Text style={styles.streakLabel}>Current Streak</Text>
            {loadingStreak ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.streakNumber}>
                  {'\uD83D\uDD25'} {streakData?.currentStreak ?? 0}
                </Text>
                <Text style={styles.streakUnit}> </Text>
              </>
            )}
          </View>

          <View style={styles.streakCard}>
            <Text style={styles.streakLabel}>Longest Streak</Text>
            {loadingStreak ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.streakNumber}>
                  {'\uD83C\uDFC6'} {streakData?.longestStreak.length ?? 0}
                </Text>
                <Text style={styles.streakUnit}>
                  {streakData?.longestStreak.isCurrent
                    ? 'Current'
                    : formatDate(streakData?.longestStreak.endedAt ?? null)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Heatmap */}
        <View style={styles.heatmapContainer} {...panResponder.panHandlers}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() => navigateMonth('prev')}
              disabled={!heatmapData?.canGoPrevious}
              style={[
                styles.monthArrow,
                !heatmapData?.canGoPrevious && styles.monthArrowDisabled,
              ]}
            >
              <Text style={styles.monthArrowText}>{'\u2190'}</Text>
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </Text>

            <TouchableOpacity
              onPress={() => navigateMonth('next')}
              disabled={!heatmapData?.canGoNext}
              style={[
                styles.monthArrow,
                !heatmapData?.canGoNext && styles.monthArrowDisabled,
              ]}
            >
              <Text style={styles.monthArrowText}>{'\u2192'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dayLabelsRow}>
            {DAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.dayLabel}>
                {label}
              </Text>
            ))}
          </View>

          {loadingHeatmap ? (
            <ActivityIndicator color={colors.primary} style={styles.loadingIndicator} />
          ) : (
            <View style={styles.calendarGrid}>{renderCalendarGrid()}</View>
          )}
        </View>

        {/* Achievements */}
        <View style={styles.achievementsContainer}>
          <Text style={styles.sectionTitle}>
            Achievements  {achievements.filter((a) => a.unlocked).length}/{achievements.length}
          </Text>

          {loadingAchievements ? (
            <ActivityIndicator color={colors.primary} />
          ) : achievements.length === 0 ? (
            <Text style={styles.emptyText}>No achievements yet</Text>
          ) : (
            achievements.map((achievement) => (
                <View key={achievement.id} style={styles.achievementCard}>
                  <Text style={styles.achievementIcon}>
                    {achievement.unlocked ? '\u2713' : '\uD83D\uDD12'}
                  </Text>
                  <View style={styles.achievementContent}>
                    <View style={styles.achievementTitleRow}>
                      <Text style={styles.achievementTitle}>{achievement.title}</Text>
                      {achievement.unlocked && achievement.unlockedAt && (
                        <Text style={styles.achievementDate}>
                          {formatCompletionDate(achievement.unlockedAt)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.achievementDescription}>
                      {achievement.description}
                    </Text>
                    {!achievement.unlocked && (
                      <>
                        <Text style={styles.achievementProgress}>
                          Progress: {achievement.progress}/{achievement.requirement}
                        </Text>
                        <View style={styles.progressBarBg}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min(
                                  (achievement.progress / achievement.requirement) * 100,
                                  100
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const CELL_SIZE = 100 / 7; // percentage width per cell

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
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
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    marginVertical: 4,
  },
  streakUnit: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Heatmap
  heatmapContainer: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthArrow: {
    padding: 8,
  },
  monthArrowDisabled: {
    opacity: 0.3,
  },
  monthArrowText: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayLabel: {
    width: `${CELL_SIZE}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${CELL_SIZE}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    marginBottom: 2,
  },
  calendarDayText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  loadingIndicator: {
    marginVertical: 24,
  },

  // Achievements
  achievementsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  achievementCard: {
    flexDirection: 'row',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  achievementIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  achievementContent: {
    flex: 1,
  },
  achievementTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  achievementDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  achievementDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  achievementProgress: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
});

export default StatsScreen;
