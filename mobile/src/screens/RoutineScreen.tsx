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
  KeyboardAvoidingView,
  Platform,
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
  screenBg: '#0D0D0D',
  cardBg: '#161616',
  inputBg: '#1F1F1F',
  textPrimary: '#E8E8E8',
  textSecondary: '#888',
  textTertiary: '#666',
  primary: '#1D9E75',
  border: '#232323',
  success: '#1D9E75',
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
  const renderWeekNavigator = () => {
    const today = new Date();
    const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const weekDates = DAYS.map((_, index) => {
      const d = new Date(today);
      d.setDate(today.getDate() + mondayOffset + index);
      return d.getDate();
    });

    return (
      <View style={styles.weekNavigator}>
        {DAYS.map((day, index) => {
          const isSelected = selectedDay === day;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDay(day)}
              style={[styles.weekDay, isSelected && styles.weekDaySelected]}
            >
              <Text style={[styles.weekDayLabel, isSelected && styles.weekDayLabelSelected]}>
                {DAY_LABELS[index].toUpperCase()}
              </Text>
              <Text style={[styles.weekDayDate, isSelected && styles.weekDayDateSelected]}>
                {weekDates[index]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTaskItem = (task: RoutineTask) => (
    <TouchableOpacity
      key={task.id}
      onPress={() => handleToggleTask(task.id, task.completed)}
      style={styles.taskItem}
      activeOpacity={0.7}
    >
      <View style={styles.checkbox}>
        {task.completed && <View style={styles.checkboxChecked} />}
      </View>

      <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
        {task.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteTask(task.id)}
        style={styles.deleteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderGoalItem = (goal: RoutineGoal) => (
    <TouchableOpacity
      key={goal.id}
      onPress={() => handleToggleGoal(goal.id, goal.completed, goal.type)}
      style={styles.taskItem}
      activeOpacity={0.7}
    >
      <View style={styles.checkbox}>
        {goal.completed && <View style={styles.checkboxChecked} />}
      </View>

      <Text style={[styles.taskText, goal.completed && styles.taskTextCompleted]}>
        {goal.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteGoal(goal.id, goal.type)}
        style={styles.deleteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Weekly Summary Banner - Monday only */}
      <WeeklySummaryBanner
        summary={currentSummary}
        onPress={() => setSummaryModalVisible(true)}
      />

      {/* Quote Card */}
      <QuoteCard quote={currentQuote} />

      {/* Week Navigator */}
      {renderWeekNavigator()}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Today's Tasks Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Today's tasks</Text>
        </View>

        {/* Required (Non-Negotiables) Card */}
        <View style={styles.taskCard}>
          <View style={styles.taskCardHeader}>
            <Text style={styles.taskCardTitle}>Required</Text>
            <TouchableOpacity
              style={styles.taskCardAddButton}
              onPress={() => { setTaskType('non-negotiable'); setTaskModalVisible(true); }}
            >
              <Text style={styles.taskCardAddButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {nonNegotiables.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : nonNegotiables.map(renderTaskItem)}
        </View>

        {/* Optional (Nice to Have) Card */}
        <View style={styles.taskCard}>
          <View style={styles.taskCardHeader}>
            <Text style={styles.taskCardTitle}>Optional</Text>
            <TouchableOpacity
              style={styles.taskCardAddButton}
              onPress={() => { setTaskType('nice-to-have'); setTaskModalVisible(true); }}
            >
              <Text style={styles.taskCardAddButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {niceToHave.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : niceToHave.map(renderTaskItem)}
        </View>

        {/* Goals Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Goals</Text>
        </View>

        {/* Weekly Goals Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardHeader}>
            <View style={styles.goalCardTitleRow}>
              <Text style={styles.goalCardTitle}>This week</Text>
              {weeklyCountdown.text ? (
                <Text style={[styles.goalCardCountdown, weeklyCountdown.urgent && styles.countdownUrgent]}>
                  {weeklyCountdown.text}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.taskCardAddButton}
              onPress={() => { setGoalType('weekly'); setGoalModalVisible(true); }}
            >
              <Text style={styles.taskCardAddButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {weeklyGoals.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : weeklyGoals.map(renderGoalItem)}
        </View>

        {/* Monthly Goals Card */}
        <View style={[styles.goalCard, styles.goalCardMonthly]}>
          <View style={styles.goalCardHeader}>
            <View style={styles.goalCardTitleRow}>
              <Text style={styles.goalCardTitle}>This month</Text>
              {monthlyCountdown.text ? (
                <Text style={[styles.goalCardCountdown, monthlyCountdown.urgent && styles.countdownUrgent]}>
                  {monthlyCountdown.text}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.taskCardAddButton}
              onPress={() => { setGoalType('monthly'); setGoalModalVisible(true); }}
            >
              <Text style={styles.taskCardAddButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {monthlyGoals.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : monthlyGoals.map(renderGoalItem)}
        </View>
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setTaskModalVisible(false); setNewTaskText(''); }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
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
                  Required
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
                  Optional
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
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Goal Modal */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setGoalModalVisible(false); setNewGoalText(''); }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
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
                  This week
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
                  This month
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
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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
    backgroundColor: '#0D0D0D',
  },

  // Week Navigator
  weekNavigator: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 4,
  },
  weekDay: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaySelected: {
    backgroundColor: '#1D9E75',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  weekDayLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
    fontWeight: '500',
  },
  weekDayLabelSelected: {
    color: '#B3E5D6',
  },
  weekDayDate: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  weekDayDateSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Scroll content
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionAccent: {
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

  // Task cards (Required / Optional)
  taskCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
  },
  taskCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  taskCardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  taskCardAddButton: {
    backgroundColor: 'rgba(29, 158, 117, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29, 158, 117, 0.3)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  taskCardAddButtonText: {
    fontSize: 11,
    color: '#5DCAA5',
    fontWeight: '500',
  },

  // Goal cards (This week / This month)
  goalCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(29, 158, 117, 0.4)',
  },
  goalCardMonthly: {
    borderLeftColor: 'rgba(15, 110, 86, 0.5)',
  },
  goalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  goalCardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  goalCardCountdown: {
    fontSize: 10,
    color: '#1D9E75',
    fontWeight: '500',
  },
  countdownUrgent: {
    color: '#FF6B6B',
  },

  emptyText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    paddingVertical: 4,
  },

  // Task/Goal Items
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#1D9E75',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1D9E75',
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    color: '#E8E8E8',
    fontWeight: '400',
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '400',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  modalContent: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#232323',
    minHeight: 280,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 20,
    color: '#E8E8E8',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  typeButtonActive: {
    backgroundColor: 'rgba(29, 158, 117, 0.2)',
    borderColor: 'rgba(29, 158, 117, 0.4)',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  typeButtonTextActive: {
    color: '#5DCAA5',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 120,
    maxHeight: 180,
    textAlignVertical: 'top',
    marginBottom: 20,
    color: '#E8E8E8',
    backgroundColor: '#1F1F1F',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1D9E75',
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },

  // Tuesday Last Chance Modal
  tuesdayOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  tuesdayCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#232323',
  },
  tuesdayCloseButton: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 4,
  },
  tuesdayCloseText: {
    fontSize: 18,
    color: '#888',
    fontWeight: '400',
  },
  tuesdayTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#E8E8E8',
    marginBottom: 12,
    marginRight: 24,
  },
  tuesdaySubtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 22,
    marginBottom: 24,
  },
  tuesdayViewButton: {
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  tuesdayViewButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default RoutineScreen;
