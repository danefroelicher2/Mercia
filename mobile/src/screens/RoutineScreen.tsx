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
  ActivityIndicator,
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
import GymScreen from './GymScreen';
import DrawerMenu from '../components/DrawerMenu';
import { Ionicons } from '@expo/vector-icons';

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

const getCalendarDateForDay = (day: DayOfWeek): string => {
  const today = new Date();
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const dayIndex = DAYS.indexOf(day); // DAYS = ['monday','tuesday',...,'sunday']
  const target = new Date(today);
  target.setDate(today.getDate() + mondayOffset + dayIndex);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDayOfYear = (): { day: number; total: number } => {
  const now = new Date();
  const year = now.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const total = isLeap ? 366 : 365;
  const start = new Date(year, 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return { day, total };
};

const RoutineScreen: React.FC = () => {
  const { user } = useAuth();

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<'routine' | 'gym'>('routine');

  // State
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<RoutineGoal[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<RoutineGoal[]>([]);
  const [yearlyGoals, setYearlyGoals] = useState<RoutineGoal[]>([]);

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const [newTaskText, setNewTaskText] = useState('');
  const [newGoalText, setNewGoalText] = useState('');

  const [goalType, setGoalType] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');

  const [copyModeActive, setCopyModeActive] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyNoTasksMessage, setCopyNoTasksMessage] = useState('');

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

  // Edit mode state — each card manages its own independently
  const [editingCard, setEditingCard] = useState<'non-negotiable' | 'weekly' | 'monthly' | 'yearly' | null>(null);
  const [editNonNeg, setEditNonNeg] = useState<RoutineTask[]>([]);
  const [editWeekly, setEditWeekly] = useState<RoutineGoal[]>([]);
  const [editMonthly, setEditMonthly] = useState<RoutineGoal[]>([]);
  const [editYearly, setEditYearly] = useState<RoutineGoal[]>([]);

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
            await checkUnsavedSummaryModal(summary);
          }
        }
      } catch (error) {
        console.error('[RoutineScreen] Error loading summary:', error);
      }
    };
    loadSummary();
  }, []);

  const checkUnsavedSummaryModal = async (summary: WeeklySummary) => {
    if (summary.is_saved || !summary.has_complete_data) return;

    // Only prompt for yesterday's summary
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (summary.week_end_date !== yesterdayStr) return;

    // Show once per summary date — don't re-prompt if already dismissed
    const key = `dismissed_summary_${summary.week_end_date}`;
    const alreadyShown = await AsyncStorage.getItem(key);
    if (alreadyShown) return;

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
        loadYearlyGoals(),
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

  const loadYearlyGoals = async () => {
    try {
      const response = await api.get('/api/routine/goals/yearly');
      if (response.data.success) {
        setYearlyGoals(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading yearly goals:', error);
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
        type: 'non-negotiable',
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
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const selectedDate = getCalendarDateForDay(selectedDay);
      const now = new Date();
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const body: { completed: boolean; timezone: string; date?: string } = {
        completed: !currentStatus,
        timezone,
      };

      if (selectedDate < todayDate) {
        body.date = selectedDate;
      }

      const response = await api.patch(`/api/routine/tasks/${taskId}`, body);

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

  const handleCopyFromDay = async (sourceDay: DayOfWeek) => {
    setIsCopying(true);
    setCopyNoTasksMessage('');
    try {
      const response = await api.get(`/api/routine/tasks/${sourceDay}`);
      if (response.data.success) {
        const allSourceTasks: RoutineTask[] = response.data.data;
        const filtered = allSourceTasks.filter(t => t.type === 'non-negotiable');
        if (filtered.length === 0) {
          const dayLabel = sourceDay.charAt(0).toUpperCase() + sourceDay.slice(1);
          setCopyNoTasksMessage(`No Required tasks on ${dayLabel}`);
          setCopyModeActive(false);
          setIsCopying(false);
          return;
        }
        for (const task of filtered) {
          try {
            await api.post('/api/routine/tasks', {
              text: task.text,
              type: 'non-negotiable',
              dayOfWeek: selectedDay,
            });
          } catch (err) {
            console.error('[RoutineScreen] Error copying task:', err);
          }
        }
        await loadTasks();
        setTaskModalVisible(false);
        setNewTaskText('');
        setCopyModeActive(false);
        setCopyNoTasksMessage('');
      }
    } catch (error) {
      console.error('[RoutineScreen] Error fetching source tasks for copy:', error);
    }
    setIsCopying(false);
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
        } else if (goalType === 'monthly') {
          setMonthlyGoals([...monthlyGoals, response.data.data]);
        } else {
          setYearlyGoals([...yearlyGoals, response.data.data]);
        }
        setNewGoalText('');
        setGoalModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal. Please try again.');
    }
  };

  const handleToggleGoal = async (goalId: string, currentStatus: boolean, type: 'weekly' | 'monthly' | 'yearly') => {
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
        } else if (type === 'monthly') {
          setMonthlyGoals(monthlyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        } else {
          setYearlyGoals(yearlyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        }
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling goal:', error);
    }
  };

  const handleDeleteGoal = (goalId: string, type: 'weekly' | 'monthly' | 'yearly') => {
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
              } else if (type === 'monthly') {
                setMonthlyGoals(monthlyGoals.filter(g => g.id !== goalId));
              } else {
                setYearlyGoals(yearlyGoals.filter(g => g.id !== goalId));
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

  // Reorder handlers
  const handleReorder = async (newData: RoutineTask[]) => {
    setTasks([...newData, ...tasks.filter(t => t.type !== 'non-negotiable')]);
    try {
      await api.patch('/api/routine/tasks/reorder', { ids: newData.map(t => t.id) });
    } catch (error) {
      console.error('[RoutineScreen] Reorder failed:', error);
      loadTasks();
    }
  };

  const handleReorderGoal = async (newData: RoutineGoal[], type: 'weekly' | 'monthly' | 'yearly') => {
    if (type === 'weekly') setWeeklyGoals(newData);
    else if (type === 'monthly') setMonthlyGoals(newData);
    else setYearlyGoals(newData);
    try {
      await api.patch('/api/routine/goals/reorder', { ids: newData.map(g => g.id) });
    } catch (error) {
      console.error('[RoutineScreen] Goal reorder failed:', error);
      loadWeeklyGoals();
      loadMonthlyGoals();
    }
  };

  // Edit mode handlers
  const handleEnterEdit = (card: 'non-negotiable' | 'weekly' | 'monthly' | 'yearly') => {
    if (card === 'non-negotiable') setEditNonNeg(nonNegotiables.slice());
    else if (card === 'weekly') setEditWeekly(weeklyGoals.slice());
    else if (card === 'monthly') setEditMonthly(monthlyGoals.slice());
    else setEditYearly(yearlyGoals.slice());
    setEditingCard(card);
  };

  const handleCancelEdit = () => {
    setEditingCard(null);
  };

  const handleSaveEdit = (card: 'non-negotiable' | 'weekly' | 'monthly' | 'yearly') => {
    if (card === 'non-negotiable') handleReorder(editNonNeg);
    else if (card === 'weekly') handleReorderGoal(editWeekly, 'weekly');
    else if (card === 'monthly') handleReorderGoal(editMonthly, 'monthly');
    else handleReorderGoal(editYearly, 'yearly');
    setEditingCard(null);
  };

  const moveTaskItem = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    const arr = editNonNeg.slice();
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    setEditNonNeg(arr);
  };

  const moveGoalItem = (card: 'weekly' | 'monthly' | 'yearly', index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (card === 'weekly') {
      const arr = editWeekly.slice();
      if (target < 0 || target >= arr.length) return;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      setEditWeekly(arr);
    } else if (card === 'monthly') {
      const arr = editMonthly.slice();
      if (target < 0 || target >= arr.length) return;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      setEditMonthly(arr);
    } else {
      const arr = editYearly.slice();
      if (target < 0 || target >= arr.length) return;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      setEditYearly(arr);
    }
  };

  const { day: yearDay, total: yearTotal } = getDayOfYear();

  // Render helpers
  const renderWeekNavigator = () => {
    const today = new Date();
    const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0 … Sun=6
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
          const isPastDay = index < todayIndex;
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
              {isPastDay && !isSelected && (
                <View pointerEvents="none" style={styles.pastDaySlashContainer}>
                  <View style={styles.pastDaySlash} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTaskItem = (
    item: RoutineTask,
    isEditing: boolean,
    index: number,
    listLength: number,
    onMoveUp: () => void,
    onMoveDown: () => void,
  ) => (
    <TouchableOpacity
      key={item.id}
      onPress={isEditing ? undefined : () => handleToggleTask(item.id, item.completed)}
      style={[styles.taskItem, { width: '100%' }]}
      activeOpacity={isEditing ? 1 : 0.7}
    >
      <View style={styles.checkbox}>
        {item.completed && <View style={styles.checkboxChecked} />}
      </View>
      <Text style={[styles.taskText, item.completed && styles.taskTextCompleted]}>
        {item.text}
      </Text>
      {isEditing ? (
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ opacity: index === 0 ? 0.25 : 1 }}
          >
            <Ionicons name="chevron-up" size={18} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === listLength - 1}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ opacity: index === listLength - 1 ? 0.25 : 1 }}
          >
            <Ionicons name="chevron-down" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => handleDeleteTask(item.id)}
          style={styles.deleteButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderGoalItem = (
    item: RoutineGoal,
    isEditing: boolean,
    index: number,
    listLength: number,
    onMoveUp: () => void,
    onMoveDown: () => void,
  ) => (
    <TouchableOpacity
      key={item.id}
      onPress={isEditing ? undefined : () => handleToggleGoal(item.id, item.completed, item.type)}
      style={[styles.taskItem, { width: '100%' }]}
      activeOpacity={isEditing ? 1 : 0.7}
    >
      <View style={styles.checkbox}>
        {item.completed && <View style={styles.checkboxChecked} />}
      </View>
      <Text style={[styles.taskText, item.completed && styles.taskTextCompleted]}>
        {item.text}
      </Text>
      {isEditing ? (
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ opacity: index === 0 ? 0.25 : 1 }}
          >
            <Ionicons name="chevron-up" size={18} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === listLength - 1}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ opacity: index === listLength - 1 ? 0.25 : 1 }}
          >
            <Ionicons name="chevron-down" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => handleDeleteGoal(item.id, item.type)}
          style={styles.deleteButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Hamburger header */}
      <View style={styles.screenHeader}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.hamburgerButton}
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      </View>

      {activeSection === 'routine' ? (
        <>
          {/* Daily Summary Banner */}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {editingCard === 'non-negotiable' ? (
                <>
                  <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.taskCardAddButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.taskCardAddButton} onPress={() => handleSaveEdit('non-negotiable')}>
                    <Text style={styles.taskCardAddButtonText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={() => handleEnterEdit('non-negotiable')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color="#5DCAA5" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.taskCardAddButton} onPress={() => setTaskModalVisible(true)}>
                    <Text style={styles.taskCardAddButtonText}>+ Add</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          {nonNegotiables.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : (editingCard === 'non-negotiable' ? editNonNeg : nonNegotiables).map((item, index, arr) =>
                renderTaskItem(item, editingCard === 'non-negotiable', index, arr.length,
                  () => moveTaskItem(index, 'up'),
                  () => moveTaskItem(index, 'down'),
                )
              )
          }
        </View>

        {/* Goals Section */}
        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>Goals</Text>
          </View>
          <TouchableOpacity style={styles.taskCardAddButton} onPress={() => { setGoalType('weekly'); setGoalModalVisible(true); }}>
            <Text style={styles.taskCardAddButtonText}>+ Add</Text>
          </TouchableOpacity>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {editingCard === 'weekly' ? (
                <>
                  <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.taskCardAddButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.taskCardAddButton} onPress={() => handleSaveEdit('weekly')}>
                    <Text style={styles.taskCardAddButtonText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => handleEnterEdit('weekly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="pencil-outline" size={14} color="#5DCAA5" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {weeklyGoals.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : (editingCard === 'weekly' ? editWeekly : weeklyGoals).map((item, index, arr) =>
                renderGoalItem(item, editingCard === 'weekly', index, arr.length,
                  () => moveGoalItem('weekly', index, 'up'),
                  () => moveGoalItem('weekly', index, 'down'),
                )
              )
          }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {editingCard === 'monthly' ? (
                <>
                  <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.taskCardAddButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.taskCardAddButton} onPress={() => handleSaveEdit('monthly')}>
                    <Text style={styles.taskCardAddButtonText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => handleEnterEdit('monthly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="pencil-outline" size={14} color="#5DCAA5" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {monthlyGoals.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : (editingCard === 'monthly' ? editMonthly : monthlyGoals).map((item, index, arr) =>
                renderGoalItem(item, editingCard === 'monthly', index, arr.length,
                  () => moveGoalItem('monthly', index, 'up'),
                  () => moveGoalItem('monthly', index, 'down'),
                )
              )
          }
        </View>

        {/* Yearly Goals Card */}
        <View style={[styles.goalCard, styles.goalCardYearly]}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>This year</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {editingCard === 'yearly' ? (
                <>
                  <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.taskCardAddButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.taskCardAddButton} onPress={() => handleSaveEdit('yearly')}>
                    <Text style={styles.taskCardAddButtonText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => handleEnterEdit('yearly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="pencil-outline" size={14} color="#5DCAA5" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.yearlyProgressText}>Day {yearDay} / {yearTotal}</Text>
          <View style={styles.yearlyProgressTrack}>
            <View style={[styles.yearlyProgressFill, { width: `${(yearDay / yearTotal) * 100}%` }]} />
          </View>
          {yearlyGoals.length === 0
            ? <Text style={styles.emptyText}>Nothing here yet</Text>
            : (editingCard === 'yearly' ? editYearly : yearlyGoals).map((item, index, arr) =>
                renderGoalItem(item, editingCard === 'yearly', index, arr.length,
                  () => moveGoalItem('yearly', index, 'up'),
                  () => moveGoalItem('yearly', index, 'down'),
                )
              )
          }
        </View>
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTaskModalVisible(false);
          setNewTaskText('');
          setCopyModeActive(false);
          setCopyNoTasksMessage('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => {
              setTaskModalVisible(false);
              setNewTaskText('');
              setCopyModeActive(false);
              setCopyNoTasksMessage('');
            }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>

            {copyModeActive ? (
              <>
                <Text style={styles.modalTitle}>Copy from...</Text>
                {isCopying ? (
                  <View style={styles.copyLoadingContainer}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={styles.copyLoadingText}>Copying tasks...</Text>
                  </View>
                ) : (
                  <View style={styles.copyDayGrid}>
                    {DAYS.filter(d => d !== selectedDay).map(day => (
                      <TouchableOpacity
                        key={day}
                        style={styles.copyDayButton}
                        onPress={() => handleCopyFromDay(day)}
                      >
                        <Text style={styles.copyDayButtonText}>
                          {day.charAt(0).toUpperCase() + day.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!isCopying && (
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setCopyModeActive(false)}
                    >
                      <Text style={styles.cancelButtonText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Add Task</Text>

                {copyNoTasksMessage !== '' && (
                  <Text style={styles.copyNoTasksText}>{copyNoTasksMessage}</Text>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Enter task..."
                  placeholderTextColor={colors.textTertiary}
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  autoFocus
                  multiline
                />

                <View style={[styles.modalButtons, { justifyContent: 'space-between', alignItems: 'center' }]}>
                  <TouchableOpacity
                    onPress={() => { setCopyNoTasksMessage(''); setCopyModeActive(true); }}
                  >
                    <Text style={styles.copyFromDayButtonText}>Copy</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setTaskModalVisible(false);
                        setNewTaskText('');
                        setCopyModeActive(false);
                        setCopyNoTasksMessage('');
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
              </>
            )}

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

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'yearly' && styles.typeButtonActive,
                ]}
                onPress={() => setGoalType('yearly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'yearly' && styles.typeButtonTextActive,
                ]}>
                  This year
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

            <Text style={styles.tuesdayTitle}>Daily Summary Ready</Text>

            {currentSummary && (
              <Text style={styles.tuesdaySubtitle}>
                Your daily summary from{'\n'}
                {formatDate(currentSummary.week_end_date)}
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

          {/* Daily Summary Modal */}
          <WeeklySummaryModal
            visible={summaryModalVisible}
            summary={currentSummary}
            onDismiss={() => setSummaryModalVisible(false)}
            onSave={handleSaveSummary}
          />
        </>
      ) : (
        <GymScreen />
      )}

      <DrawerMenu
        visible={drawerVisible}
        activeSection={activeSection}
        onSelect={(section) => {
          setActiveSection(section);
          setDrawerVisible(false);
        }}
        onClose={() => setDrawerVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },

  // Hamburger header
  screenHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hamburgerButton: {
    gap: 5,
    justifyContent: 'center',
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
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
  pastDaySlashContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pastDaySlash: {
    position: 'absolute',
    width: '200%',
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    top: '50%',
    left: '-50%',
    transform: [{ rotate: '-52deg' }],
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

  // Task cards (Required)
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
  goalCardYearly: {
    borderLeftColor: 'rgba(8, 60, 45, 0.7)',
  },
  yearlyProgressText: {
    fontSize: 11,
    color: '#1D9E75',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 2,
  },
  yearlyProgressTrack: {
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  yearlyProgressFill: {
    height: '100%',
    backgroundColor: '#1D9E75',
    borderRadius: 2,
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
  reorderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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

  // Copy from day
  copyFromDayButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '400',
  },
  copyDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  copyDayButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    minWidth: '42%',
    alignItems: 'center',
  },
  copyDayButtonText: {
    fontSize: 14,
    color: '#E8E8E8',
    fontWeight: '400',
  },
  copyLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  copyLoadingText: {
    fontSize: 14,
    color: '#888',
  },
  copyNoTasksText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 12,
    marginTop: -8,
  },
});

export default RoutineScreen;
