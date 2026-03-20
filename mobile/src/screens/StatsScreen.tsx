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
  screenBg: '#0D0D0D',
  cardBg: '#161616',
  textPrimary: '#E8E8E8',
  textSecondary: '#888',
  textTertiary: '#666',
  primary: '#1D9E75',
  border: '#232323',
  heatmapEmpty: '#1F1F1F',
  heatmapLight: 'rgba(29, 158, 117, 0.3)',
  heatmapMedium: 'rgba(29, 158, 117, 0.6)',
  heatmapDark: 'rgba(29, 158, 117, 0.8)',
  heatmapMax: '#1D9E75',
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
    if (count <= 5) return colors.heatmapDark;
    return colors.heatmapMax;
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
          <View style={styles.achievementsHeader}>
            <View style={styles.achievementsAccent} />
            <Text style={styles.sectionTitle}>Milestones</Text>
            <Text style={styles.achievementCount}>
              {achievements.filter((a) => a.unlocked).length}/{achievements.length}
            </Text>
          </View>

          {loadingAchievements ? (
            <ActivityIndicator color={colors.primary} />
          ) : achievements.length === 0 ? (
            <Text style={styles.emptyText}>No milestones yet</Text>
          ) : (
            achievements.map((achievement) => (
              <View
                key={achievement.id}
                style={[
                  styles.achievementCard,
                  !achievement.unlocked && styles.achievementCardLocked,
                ]}
              >
                <View style={[
                  styles.achievementIconBadge,
                  achievement.unlocked ? styles.achievementIconUnlocked : styles.achievementIconLocked,
                ]}>
                  <Text style={{ fontSize: 18 }}>
                    {achievement.unlocked ? '🔥' : '🎯'}
                  </Text>
                </View>

                <View style={styles.achievementContent}>
                  <Text style={styles.achievementTitle}>{achievement.title}</Text>
                  <Text style={styles.achievementDescription}>{achievement.description}</Text>

                  {achievement.unlocked ? (
                    <Text style={styles.achievementDate}>
                      Unlocked {formatCompletionDate(achievement.unlockedAt)}
                    </Text>
                  ) : (
                    <>
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
                      <Text style={styles.achievementProgress}>
                        {achievement.progress}/{achievement.requirement} completed
                      </Text>
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

const CELL_SIZE = 100 / 7;

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

  // Heatmap
  heatmapContainer: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 16,
    paddingBottom: 8,
    marginBottom: 24,
    borderTopWidth: 3,
    borderTopColor: '#1D9E75',
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
    fontSize: 18,
    color: '#E8E8E8',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayLabel: {
    width: `${CELL_SIZE}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
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
    borderRadius: 4,
    marginBottom: 2,
  },
  calendarDayText: {
    fontSize: 11,
    color: '#E8E8E8',
  },
  loadingIndicator: {
    marginVertical: 12,
  },

  // Achievements
  achievementsContainer: {
    marginBottom: 24,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  achievementsAccent: {
    width: 3,
    height: 14,
    backgroundColor: '#1D9E75',
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: '#777',
    fontWeight: '500',
  },
  achievementCount: {
    fontSize: 12,
    color: '#888',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
  },
  achievementCard: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  achievementCardLocked: {
    opacity: 0.5,
  },
  achievementIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  achievementIconUnlocked: {
    backgroundColor: 'rgba(29, 158, 117, 0.2)',
  },
  achievementIconLocked: {
    backgroundColor: '#1F1F1F',
  },
  achievementContent: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E8E8E8',
    marginBottom: 2,
  },
  achievementDate: {
    fontSize: 10,
    color: '#1D9E75',
  },
  achievementDescription: {
    fontSize: 11,
    color: '#888',
    marginBottom: 3,
  },
  achievementProgress: {
    fontSize: 10,
    color: '#666',
    marginTop: 3,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: '#1F1F1F',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 3,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1D9E75',
    borderRadius: 2,
  },
});

export default StatsScreen;
