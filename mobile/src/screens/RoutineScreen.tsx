import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { RoutineTask, RoutineGoal, DayOfWeek } from '../types/routine';
import QuoteCard from '../components/QuoteCard';
import WeeklySummaryBanner from '../components/WeeklySummaryBanner';
import WeeklySummaryModal from '../components/WeeklySummaryModal';
import { QUOTES } from '../data/quotes';
import { WeeklySummary } from '../types/summary';

const colors = {
  screenBg: '#1A1A1A',
  cardBg: '#2A2A2A',
  inputBg: '#333333',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#707070',
  primary: '#FF6B35',
  border: '#3A3A3A',
  success: '#00D9A0',
};

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const getNextMonday = (): Date => {
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // If today is Monday and the reset (5 AM UTC) hasn't happened yet, use today
  if (dayUTC === 1) {
    const todayReset = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0, 0
    ));
    if (now < todayReset) return todayReset;
  }

  const daysUntil = (8 - dayUTC) % 7 || 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil, 5, 0, 0, 0
  ));
};

const getNextFirstOfMonth = (): Date => {
  const now = new Date();

  // If today is the 1st and the reset hasn't happened yet, use today
  if (now.getUTCDate() === 1) {
    const todayReset = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), 1, 5, 0, 0, 0
    ));
    if (now < todayReset) return todayReset;
  }

  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 5, 0, 0, 0
  ));
};

const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0) return 'Resetting...';
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
};

const shouldShowUrgent = (ms: number): boolean => ms > 0 && ms < TWELVE_HOURS_MS;

const RoutineScreen: React.FC = () => {
  const { user } = useAuth();

  // State
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<RoutineGoal[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<RoutineGoal[]>([]);

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const [newTaskText, setNewTaskText] = useState('');
  const [newGoalText, setNewGoalText] = useState('');

  const [taskType, setTaskType] = useState<'non-negotiable' | 'nice-to-have'>('non-negotiable');
  const [goalType, setGoalType] = useState<'weekly' | 'monthly'>('weekly');

  const [refreshing, setRefreshing] = useState(false);

  // Countdown state
  const [weeklyCountdown, setWeeklyCountdown] = useState<{ text: string; urgent: boolean }>({ text: '', urgent: false });
  const [monthlyCountdown, setMonthlyCountdown] = useState<{ text: string; urgent: boolean }>({ text: '', urgent: false });

  // Weekly summary state
  const [currentSummary, setCurrentSummary] = useState<WeeklySummary | null>(null);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [tuesdayModalVisible, setTuesdayModalVisible] = useState(false);

  // Quote state - only need disliked IDs for rotation filtering
  const [dislikedQuoteIds, setDislikedQuoteIds] = useState<number[]>([]);

  const availableQuotes = useMemo(() => {
    const filtered = QUOTES.filter(q => !dislikedQuoteIds.includes(q.id));
    return filtered.length > 0 ? filtered : QUOTES;
  }, [dislikedQuoteIds]);

  const currentQuote = useMemo(() => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    const index = dayOfYear % availableQuotes.length;
    return availableQuotes[index];
  }, [availableQuotes]);

  // Countdown timers
  useEffect(() => {
    const updateCountdowns = () => {
      const now = new Date();
      const weeklyMs = getNextMonday().getTime() - now.getTime();
      const monthlyMs = getNextFirstOfMonth().getTime() - now.getTime();
      setWeeklyCountdown({ text: formatTimeRemaining(weeklyMs), urgent: shouldShowUrgent(weeklyMs) });
      setMonthlyCountdown({ text: formatTimeRemaining(monthlyMs), urgent: shouldShowUrgent(monthlyMs) });
    };
    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load disliked quotes on mount
  useEffect(() => {
    const loadDisliked = async () => {
      try {
        const response = await api.get('/api/routine/quotes/user-disliked');
        if (response.data.success) {
          setDislikedQuoteIds(response.data.data);
        }
      } catch (error) {
        console.error('[RoutineScreen] Error loading disliked quotes:', error);
      }
    };
    loadDisliked();
  }, []);

  // Get today's day on mount
  useEffect(() => {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayIndex = today === 0 ? 6 : today - 1; // Convert to Mon=0, Tue=1, ..., Sun=6
    setSelectedDay(DAYS[dayIndex]);
  }, []);

  // Load weekly summary on mount and check for Tuesday last-chance modal
  useEffect(() => {
    // Fire-and-forget: delete old unsaved summaries from DB on each mount
    api.delete('/api/summaries/cleanup-old').catch(() => {});

    const loadSummary = async () => {
      try {
        const response = await api.get('/api/summaries/current');
        if (response.data.success && response.data.data) {
          const summary: WeeklySummary = response.data.data;
          setCurrentSummary(summary);
          await checkTuesdayModal(summary);
        }
      } catch (error) {
        console.error('[RoutineScreen] Error loading summary:', error);
      }
    };
    loadSummary();
  }, []);

  const checkTuesdayModal = async (summary: WeeklySummary) => {
    const today = new Date();
    if (today.getDay() !== 2 || summary.is_saved) return;

    // Calculate the week_start_date we expect: last week's Monday
    // (today is Tuesday, so "last Monday" is yesterday; the summary covers
    //  the week starting 7 days before that Monday)
    const expectedStart = new Date(today);
    expectedStart.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
    const expectedStartStr = expectedStart.toISOString().split('T')[0];

    if (summary.week_start_date !== expectedStartStr) return;

    const key = `dismissed_summary_${summary.week_start_date}`;
    const alreadyShown = await AsyncStorage.getItem(key);
    if (alreadyShown) return;

    // Mark as shown before displaying — prevents repeat on subsequent opens
    await AsyncStorage.setItem(key, 'true');
    setTuesdayModalVisible(true);
    await cleanupOldSummaryKeys();
  };

  const cleanupOldSummaryKeys = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const summaryKeys = allKeys.filter(k => k.startsWith('dismissed_summary_'));
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const keysToRemove = summaryKeys.filter(k => {
        const dateStr = k.replace('dismissed_summary_', '');
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) && date < twoWeeksAgo;
      });
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error cleaning up summary keys:', error);
    }
  };

  // Load data when day changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedDay]);

  const handleSaveSummary = async (summaryId: string) => {
    await api.patch(`/api/summaries/${summaryId}/save`);
    setCurrentSummary(prev => prev ? { ...prev, is_saved: true } : null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const loadData = async () => {
    try {
      await Promise.all([
        loadTasks(),
        loadWeeklyGoals(),
        loadMonthlyGoals(),
      ]);
    } catch (error) {
      console.error('[RoutineScreen] Error loading data:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const response = await api.get(`/api/routine/tasks/${selectedDay}`);
      if (response.data.success) {
        setTasks(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading tasks:', error);
    }
  };

  const loadWeeklyGoals = async () => {
    try {
      const response = await api.get('/api/routine/goals/weekly');
      if (response.data.success) {
        setWeeklyGoals(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading weekly goals:', error);
    }
  };

  const loadMonthlyGoals = async () => {
    try {
      const response = await api.get('/api/routine/goals/monthly');
      if (response.data.success) {
        setMonthlyGoals(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading monthly goals:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Task handlers
  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;

    try {
      const response = await api.post('/api/routine/tasks', {
        text: newTaskText.trim(),
        type: taskType,
        dayOfWeek: selectedDay,
      });

      if (response.data.success) {
        setTasks([...tasks, response.data.data]);
        setNewTaskText('');
        setTaskModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const response = await api.patch(`/api/routine/tasks/${taskId}`, {
        completed: !currentStatus,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (response.data.success) {
        setTasks(tasks.map(t =>
          t.id === taskId ? { ...t, completed: !currentStatus } : t
        ));
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling task:', error);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/routine/tasks/${taskId}`);
              setTasks(tasks.filter(t => t.id !== taskId));
            } catch (error) {
              console.error('[RoutineScreen] Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task.');
            }
          },
        },
      ]
    );
  };

  // Goal handlers
  const handleAddGoal = async () => {
    if (!newGoalText.trim()) return;

    try {
      const response = await api.post('/api/routine/goals', {
        text: newGoalText.trim(),
        type: goalType,
      });

      if (response.data.success) {
        if (goalType === 'weekly') {
          setWeeklyGoals([...weeklyGoals, response.data.data]);
        } else {
          setMonthlyGoals([...monthlyGoals, response.data.data]);
        }
        setNewGoalText('');
        setGoalModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal. Please try again.');
    }
  };

  const handleToggleGoal = async (goalId: string, currentStatus: boolean, type: 'weekly' | 'monthly') => {
    try {
      const response = await api.patch(`/api/routine/goals/${goalId}`, {
        completed: !currentStatus,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (response.data.success) {
        if (type === 'weekly') {
          setWeeklyGoals(weeklyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        } else {
          setMonthlyGoals(monthlyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        }
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling goal:', error);
    }
  };

  const handleDeleteGoal = (goalId: string, type: 'weekly' | 'monthly') => {
    Alert.alert(
      'Delete Goal',
      'Are you sure you want to delete this goal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/routine/goals/${goalId}`);
              if (type === 'weekly') {
                setWeeklyGoals(weeklyGoals.filter(g => g.id !== goalId));
              } else {
                setMonthlyGoals(monthlyGoals.filter(g => g.id !== goalId));
              }
            } catch (error) {
              console.error('[RoutineScreen] Error deleting goal:', error);
              Alert.alert('Error', 'Failed to delete goal.');
            }
          },
        },
      ]
    );
  };

  // Filter tasks by type
  const nonNegotiables = tasks.filter(t => t.type === 'non-negotiable');
  const niceToHave = tasks.filter(t => t.type === 'nice-to-have');

  // Render helpers
  const renderDaySwitcher = () => (
    <View style={styles.daySwitcherContainer}>
      {DAYS.map((day, index) => (
        <TouchableOpacity
          key={day}
          onPress={() => setSelectedDay(day)}
          style={[
            styles.dayButton,
            selectedDay === day && styles.activeDayButton,
          ]}
        >
          <Text style={[
            styles.dayText,
            selectedDay === day && styles.activeDayText,
          ]}>
            {DAY_LABELS[index]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTaskItem = (task: RoutineTask) => (
    <View key={task.id} style={styles.taskItem}>
      <TouchableOpacity
        onPress={() => handleToggleTask(task.id, task.completed)}
        style={styles.checkbox}
      >
        {task.completed && (
          <View style={styles.checkboxChecked}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[
        styles.taskText,
        task.completed && styles.taskTextCompleted,
      ]}>
        {task.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteTask(task.id)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGoalItem = (goal: RoutineGoal) => (
    <View key={goal.id} style={styles.taskItem}>
      <TouchableOpacity
        onPress={() => handleToggleGoal(goal.id, goal.completed, goal.type)}
        style={styles.checkbox}
      >
        {goal.completed && (
          <View style={styles.checkboxChecked}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[
        styles.taskText,
        goal.completed && styles.taskTextCompleted,
      ]}>
        {goal.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteGoal(goal.id, goal.type)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSection = (
    title: string,
    items: any[],
    onAddPress: () => void,
    renderItem: (item: any) => React.ReactNode,
    countdown?: { text: string; urgent: boolean }
  ) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {countdown?.text ? (
            <Text
              style={[styles.countdownText, countdown.urgent && styles.countdownUrgent]}
              numberOfLines={1}
            >
              {countdown.text}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={onAddPress} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>Nothing here yet</Text>
      ) : (
        items.map(renderItem)
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Weekly Summary Banner - Monday only */}
      <WeeklySummaryBanner
        summary={currentSummary}
        onPress={() => setSummaryModalVisible(true)}
      />

      {/* Quote Card - positioned above day switcher */}
      <QuoteCard quote={currentQuote} />

      {renderDaySwitcher()}

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {renderSection(
          'Non-Negotiables',
          nonNegotiables,
          () => {
            setTaskType('non-negotiable');
            setTaskModalVisible(true);
          },
          renderTaskItem
        )}

        {renderSection(
          'Nice to Have',
          niceToHave,
          () => {
            setTaskType('nice-to-have');
            setTaskModalVisible(true);
          },
          renderTaskItem
        )}

        {renderSection(
          'Weekly Goals',
          weeklyGoals,
          () => {
            setGoalType('weekly');
            setGoalModalVisible(true);
          },
          renderGoalItem,
          weeklyCountdown
        )}

        {renderSection(
          'Monthly Goals',
          monthlyGoals,
          () => {
            setGoalType('monthly');
            setGoalModalVisible(true);
          },
          renderGoalItem,
          monthlyCountdown
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Task</Text>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  taskType === 'non-negotiable' && styles.typeButtonActive,
                ]}
                onPress={() => setTaskType('non-negotiable')}
              >
                <Text style={[
                  styles.typeButtonText,
                  taskType === 'non-negotiable' && styles.typeButtonTextActive,
                ]}>
                  Non-Negotiable
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  taskType === 'nice-to-have' && styles.typeButtonActive,
                ]}
                onPress={() => setTaskType('nice-to-have')}
              >
                <Text style={[
                  styles.typeButtonText,
                  taskType === 'nice-to-have' && styles.typeButtonTextActive,
                ]}>
                  Nice to Have
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter task..."
              placeholderTextColor={colors.textTertiary}
              value={newTaskText}
              onChangeText={setNewTaskText}
              autoFocus
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setTaskModalVisible(false);
                  setNewTaskText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddTask}
              >
                <Text style={styles.saveButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Goal Modal */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Goal</Text>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'weekly' && styles.typeButtonActive,
                ]}
                onPress={() => setGoalType('weekly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'weekly' && styles.typeButtonTextActive,
                ]}>
                  Weekly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'monthly' && styles.typeButtonActive,
                ]}
                onPress={() => setGoalType('monthly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'monthly' && styles.typeButtonTextActive,
                ]}>
                  Monthly
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter goal..."
              placeholderTextColor={colors.textTertiary}
              value={newGoalText}
              onChangeText={setNewGoalText}
              autoFocus
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setGoalModalVisible(false);
                  setNewGoalText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddGoal}
              >
                <Text style={styles.saveButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tuesday Last Chance Modal */}
      <Modal
        visible={tuesdayModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTuesdayModalVisible(false)}
      >
        <View style={styles.tuesdayOverlay}>
          <View style={styles.tuesdayCard}>
            <TouchableOpacity
              style={styles.tuesdayCloseButton}
              onPress={() => setTuesdayModalVisible(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.tuesdayCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.tuesdayTitle}>Last Chance: Weekly Summary</Text>

            {currentSummary && (
              <Text style={styles.tuesdaySubtitle}>
                Your weekly summary from{'\n'}
                {formatDate(currentSummary.week_start_date)} – {formatDate(currentSummary.week_end_date)}
              </Text>
            )}

            <TouchableOpacity
              style={styles.tuesdayViewButton}
              onPress={() => {
                setTuesdayModalVisible(false);
                setSummaryModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.tuesdayViewButtonText}>View Summary</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Weekly Summary Modal */}
      <WeeklySummaryModal
        visible={summaryModalVisible}
        summary={currentSummary}
        onDismiss={() => setSummaryModalVisible(false)}
        onSave={handleSaveSummary}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  // Day Switcher
  daySwitcherContainer: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'space-between',
  },
  dayButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 20,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDayButton: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeDayText: {
    color: colors.textPrimary,
  },

  // Content
  scrollContent: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionHeaderLeft: {
    flexDirection: 'column',
  },
  countdownText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B0B0B0',
    marginTop: 4,
  },
  countdownUrgent: {
    color: '#FF6B6B',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  addButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },

  // Task/Goal Items
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  taskText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 24,
    color: colors.textTertiary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 220,
  },
  modalContent: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeButtonTextActive: {
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: colors.textPrimary,
    backgroundColor: colors.inputBg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // Tuesday Last Chance Modal
  tuesdayOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  tuesdayCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 360,
  },
  tuesdayCloseButton: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 4,
  },
  tuesdayCloseText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tuesdayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    marginRight: 24,
  },
  tuesdaySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  tuesdayViewButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tuesdayViewButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});

export default RoutineScreen;
