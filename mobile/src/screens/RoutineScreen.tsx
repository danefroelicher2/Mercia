import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { RoutineTask, RoutineGoal, DayOfWeek } from '../types/routine';
import TodayTimeBlocks, { CreateTaskInput, TaskChanges } from '../components/TodayTimeBlocks';
import ActionMenu, { ActionMenuItem } from '../components/ActionMenu';
import { TimeOfDay } from '../types/routine';
import { SECTION_COLORS, getCurrentTimeOfDay, textOnColor, withAlpha } from '../utils/timeOfDay';
import QuoteCard from '../components/QuoteCard';
import { QUOTES } from '../data/quotes';
import GymScreen from './GymScreen';
import DrawerMenu from '../components/DrawerMenu';
import { Ionicons } from '@expo/vector-icons';
import { getNextMonday, getNextFirstOfMonth, formatTimeRemaining, shouldShowUrgent } from '../utils/weeklyReset';

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
  const selectedDayRef = useRef(selectedDay);
  useEffect(() => { selectedDayRef.current = selectedDay; }, [selectedDay]);
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<RoutineGoal[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<RoutineGoal[]>([]);
  const [yearlyGoals, setYearlyGoals] = useState<RoutineGoal[]>([]);

  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const [newGoalText, setNewGoalText] = useState('');
  const [newGoalCount, setNewGoalCount] = useState('1');

  const [goalType, setGoalType] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');

  // Bumped on every tab focus so the Today pager snaps back to the section
  // matching the current time.
  const [focusCount, setFocusCount] = useState(0);
  const [copyMenuVisible, setCopyMenuVisible] = useState(false);
  // The whole tab takes its accent from the Today section being shown.
  const [todaySection, setTodaySection] = useState<TimeOfDay>(getCurrentTimeOfDay);
  const accent = SECTION_COLORS[todaySection];
  const themed = useMemo(() => makeThemedStyles(accent), [accent]);
  const tasksRef = useRef<RoutineTask[]>([]);
  tasksRef.current = tasks;
  // Tasks typed into the Today notepad get a client id immediately; this
  // maps it to the server id once the create lands (null if it failed).
  const pendingTaskIds = useRef<Map<string, Promise<string | null>>>(new Map());
  const orderSyncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  // Countdown state
  const [weeklyCountdown, setWeeklyCountdown] = useState<{ text: string; urgent: boolean }>({ text: '', urgent: false });
  const [monthlyCountdown, setMonthlyCountdown] = useState<{ text: string; urgent: boolean }>({ text: '', urgent: false });

  // Quote state - only need disliked IDs for rotation filtering
  const [dislikedQuoteIds, setDislikedQuoteIds] = useState<number[]>([]);

  // Routine preferences (which goal sections to show)
  const [showWeekly, setShowWeekly] = useState(true);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showYearly, setShowYearly] = useState(true);
  const [showNotepad, setShowNotepad] = useState(true);

  // Notepad
  const [notepadContent, setNotepadContent] = useState('');
  const notepadSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickingGoalIds = useRef<Set<string>>(new Set());
  const tickingTaskIds = useRef<Set<string>>(new Set());

  // Edit mode state — each card manages its own independently
  const [editingCard, setEditingCard] = useState<'weekly' | 'monthly' | 'yearly' | null>(null);
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

  // Recompute today's actual day-of-week every time this tab gains focus.
  // Tab screens don't necessarily remount between app sessions (backgrounding,
  // resuming, or just switching tabs and back can all leave this screen's
  // state intact), so a mount-only calculation can go stale — e.g. opening
  // the app on Wednesday after last using it the previous Monday would
  // otherwise keep showing Monday's tasks under the "Today" card.
  useFocusEffect(useCallback(() => {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayIndex = today === 0 ? 6 : today - 1; // Convert to Mon=0, Tue=1, ..., Sun=6
    setSelectedDay(DAYS[dayIndex]);
    setFocusCount(c => c + 1);
  }, []));

  // Load preferences and notepad content each time this tab gains focus
  useFocusEffect(useCallback(() => {
    const loadOnFocus = async () => {
      const [w, m, y, n] = await Promise.all([
        AsyncStorage.getItem('routine_prefs_show_weekly'),
        AsyncStorage.getItem('routine_prefs_show_monthly'),
        AsyncStorage.getItem('routine_prefs_show_yearly'),
        AsyncStorage.getItem('routine_prefs_show_notepad'),
      ]);
      if (w !== null) setShowWeekly(w === 'true');
      if (m !== null) setShowMonthly(m === 'true');
      if (y !== null) setShowYearly(y === 'true');
      if (n !== null) setShowNotepad(n === 'true');

      api.get('/api/routine/notepad')
        .then(res => { if (res.data.success) setNotepadContent(res.data.data.content); })
        .catch(() => {});
    };
    loadOnFocus();
  }, []));

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

  // Cancel any pending notepad save on unmount
  useEffect(() => {
    return () => {
      if (notepadSaveTimeout.current) clearTimeout(notepadSaveTimeout.current);
    };
  }, []);

  const handleNotepadChange = (text: string) => {
    setNotepadContent(text);
    if (notepadSaveTimeout.current) clearTimeout(notepadSaveTimeout.current);
    notepadSaveTimeout.current = setTimeout(() => {
      api.put('/api/routine/notepad', { content: text }).catch(() => {});
    }, 1000);
  };

  // Load data when day changes
  useEffect(() => {
    // A pending reorder belongs to the day being left — write it now.
    if (orderSyncTimeout.current) {
      clearTimeout(orderSyncTimeout.current);
      syncOrderNow();
    }
    if (user) {
      loadData();
    }
  }, [user, selectedDay]);

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
    // On mount, this can fire once for the hardcoded initial 'monday' (if `user`
    // is already available) and again moments later for the real current day
    // once the focus effect below corrects `selectedDay` — two in-flight
    // requests racing. Without this guard, whichever response lands last wins,
    // so a slower stale 'monday' response can overwrite the correct day's tasks
    // even though the day selector itself already shows the right day. Capture
    // the day this request is for and only apply it if it's still current when
    // the response arrives.
    const requestedDay = selectedDay;
    try {
      const response = await api.get(`/api/routine/tasks/${requestedDay}`);
      if (response.data.success && selectedDayRef.current === requestedDay) {
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

  // ============================================
  // TODAY NOTEPAD HANDLERS
  // Every change applies locally first so typing and checking feel instant
  // (Render cold starts can take a while), then syncs to the server.
  // ============================================

  const resolveTaskId = async (id: string): Promise<string | null> => {
    const pending = pendingTaskIds.current.get(id);
    return pending ? pending : id;
  };

  // Persist the current on-screen order. Debounced so a burst of typed
  // lines produces one reorder call; flushed early if the day changes.
  const syncOrderNow = async () => {
    orderSyncTimeout.current = null;
    // Snapshot synchronously — before any await — so a day switch can't
    // swap in the next day's tasks.
    const clientIds = tasksRef.current.map(t => t.id);
    const ids = await Promise.all(clientIds.map(resolveTaskId));
    try {
      await api.patch('/api/routine/tasks/reorder', { ids: ids.filter((id): id is string => !!id) });
    } catch (error) {
      console.error('[RoutineScreen] Reorder failed:', error);
    }
  };

  const scheduleOrderSync = () => {
    if (orderSyncTimeout.current) clearTimeout(orderSyncTimeout.current);
    orderSyncTimeout.current = setTimeout(syncOrderNow, 600);
  };

  const handleCreateTask = ({ text, targetCount, timeOfDay, afterId }: CreateTaskInput): string => {
    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const day = selectedDay;
    const optimistic: RoutineTask = {
      id: clientId,
      user_id: user?.id ?? '',
      text,
      type: 'today',
      day_of_week: day,
      completed: false,
      target_count: targetCount,
      current_count: targetCount,
      time_of_day: timeOfDay,
      created_at: new Date().toISOString(),
    };

    setTasks(prev => {
      const index = afterId ? prev.findIndex(t => t.id === afterId) : -1;
      if (index === -1) return [...prev, optimistic];
      const next = prev.slice();
      next.splice(index + 1, 0, optimistic);
      return next;
    });

    const request = (async (): Promise<string | null> => {
      try {
        const response = await api.post('/api/routine/tasks', {
          text,
          type: 'today',
          dayOfWeek: day,
          targetCount,
          timeOfDay,
        });
        const saved: RoutineTask = response.data.data;
        // The row keeps its client id for this session (so an input being
        // edited isn't remounted); API calls go through resolveTaskId.
        setTasks(prev => prev.map(t => (t.id === clientId ? { ...t, user_id: saved.user_id, created_at: saved.created_at } : t)));
        // The server appends to the end of the day; an insert anywhere else
        // needs the order written back.
        if (afterId) scheduleOrderSync();
        return saved.id;
      } catch (error) {
        console.error('[RoutineScreen] Error adding task:', error);
        setTasks(prev => prev.filter(t => t.id !== clientId));
        Alert.alert("Couldn't save", `"${text}" wasn't saved. Check your connection and try again.`);
        return null;
      }
    })();
    pendingTaskIds.current.set(clientId, request);
    return clientId;
  };

  const handleUpdateTask = async (id: string, changes: TaskChanges) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const next = { ...t };
      if (changes.text !== undefined) next.text = changes.text;
      if (changes.timeOfDay !== undefined) next.time_of_day = changes.timeOfDay;
      if (changes.targetCount !== undefined) {
        const tapsDone = t.target_count - t.current_count;
        next.target_count = changes.targetCount;
        next.current_count = Math.max(0, changes.targetCount - tapsDone);
        next.completed = next.current_count === 0;
      }
      return next;
    }));

    const serverId = await resolveTaskId(id);
    if (!serverId) return;
    try {
      const response = await api.put(`/api/routine/tasks/${serverId}`, changes);
      const saved: RoutineTask = response.data.data;
      // Only take the server's count math; text/section stay as typed locally.
      setTasks(prev => prev.map(t => (t.id === id
        ? { ...t, target_count: saved.target_count, current_count: saved.current_count, completed: saved.completed }
        : t)));
    } catch (error) {
      console.error('[RoutineScreen] Error updating task:', error);
      Alert.alert("Couldn't save", 'That change didn\'t save. Pull down to refresh and try again.');
    }
  };

  const handleReorderTasks = (orderedIds: string[]) => {
    setTasks(prev => {
      const byId = new Map(prev.map(t => [t.id, t]));
      const ordered = orderedIds.map(id => byId.get(id)).filter((t): t is RoutineTask => !!t);
      const missing = prev.filter(t => !orderedIds.includes(t.id));
      return [...ordered, ...missing];
    });
    scheduleOrderSync();
  };

  const handleToggleTask = async (taskId: string) => {
    if (tickingTaskIds.current.has(taskId)) return;
    tickingTaskIds.current.add(taskId);

    // Same tick rule as the server: count down to done; tapping a done
    // task steps it back up one.
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newCount = t.current_count > 0
        ? t.current_count - 1
        : Math.min(t.current_count + 1, t.target_count);
      return { ...t, current_count: newCount, completed: newCount === 0 };
    }));

    try {
      const serverId = await resolveTaskId(taskId);
      if (!serverId) return;

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const selectedDate = getCalendarDateForDay(selectedDay);
      const now = new Date();
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const body: { timezone: string; date?: string } = { timezone };

      if (selectedDate < todayDate) {
        body.date = selectedDate;
      }

      const response = await api.patch(`/api/routine/tasks/${serverId}`, body);

      if (response.data.success) {
        const updated: RoutineTask = response.data.data;
        setTasks(prev => prev.map(t => (t.id === taskId
          ? { ...t, completed: updated.completed, current_count: updated.current_count, target_count: updated.target_count }
          : t)));
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling task:', error);
      loadTasks();
    } finally {
      tickingTaskIds.current.delete(taskId);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    const serverId = await resolveTaskId(taskId);
    if (!serverId) return;
    try {
      await api.delete(`/api/routine/tasks/${serverId}`);
    } catch (error) {
      console.error('[RoutineScreen] Error deleting task:', error);
      Alert.alert('Error', 'Failed to delete task.');
      loadTasks();
    }
  };

  // Copy every task (with its Morning/Afternoon/Night section) from another
  // day onto the selected day. Offered when the selected day is empty.
  const handleCopyFromDay = async (sourceDay: DayOfWeek) => {
    const targetDay = selectedDay;
    const sourceLabel = sourceDay.charAt(0).toUpperCase() + sourceDay.slice(1);
    try {
      const response = await api.get(`/api/routine/tasks/${sourceDay}`);
      const sourceTasks: RoutineTask[] = (response.data.data ?? []).filter((t: RoutineTask) => t.type === 'today');
      if (sourceTasks.length === 0) {
        Alert.alert('Nothing to copy', `${sourceLabel} has no tasks yet.`);
        return;
      }
      for (const task of sourceTasks) {
        await api.post('/api/routine/tasks', {
          text: task.text,
          type: 'today',
          dayOfWeek: targetDay,
          // Preserve countdown targets and sections.
          targetCount: task.target_count ?? 1,
          timeOfDay: task.time_of_day ?? 'morning',
        });
      }
      if (selectedDayRef.current === targetDay) await loadTasks();
    } catch (error) {
      console.error('[RoutineScreen] Error copying tasks:', error);
      Alert.alert('Error', 'Failed to copy tasks. Please try again.');
      loadTasks();
    }
  };

  const openCopyFromDay = () => setCopyMenuVisible(true);

  const copyMenuItems: ActionMenuItem[] = DAYS.filter(d => d !== selectedDay).map(day => ({
    label: day.charAt(0).toUpperCase() + day.slice(1),
    onPress: () => handleCopyFromDay(day),
  }));

  // Goal handlers
  const handleAddGoal = async () => {
    if (!newGoalText.trim()) return;

    const parsedCount = parseInt(newGoalCount, 10);
    const targetCount = Number.isFinite(parsedCount) ? Math.min(999, Math.max(1, parsedCount)) : 1;

    try {
      const response = await api.post('/api/routine/goals', {
        text: newGoalText.trim(),
        type: goalType,
        targetCount,
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
        setNewGoalCount('1');
        setGoalModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal. Please try again.');
    }
  };

  const handleToggleGoal = async (goalId: string, type: 'weekly' | 'monthly' | 'yearly') => {
    if (tickingGoalIds.current.has(goalId)) return;
    tickingGoalIds.current.add(goalId);
    try {
      const response = await api.patch(`/api/routine/goals/${goalId}`, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (response.data.success) {
        const updated: RoutineGoal = response.data.data;
        if (type === 'weekly') {
          setWeeklyGoals(prev => prev.map(g => (g.id === goalId ? updated : g)));
        } else if (type === 'monthly') {
          setMonthlyGoals(prev => prev.map(g => (g.id === goalId ? updated : g)));
        } else {
          setYearlyGoals(prev => prev.map(g => (g.id === goalId ? updated : g)));
        }
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling goal:', error);
    } finally {
      tickingGoalIds.current.delete(goalId);
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
  const todayTasks = tasks.filter(t => t.type === 'today');

  // Reorder handlers
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
  const handleEnterEdit = (card: 'weekly' | 'monthly' | 'yearly') => {
    if (card === 'weekly') setEditWeekly(weeklyGoals.slice());
    else if (card === 'monthly') setEditMonthly(monthlyGoals.slice());
    else setEditYearly(yearlyGoals.slice());
    setEditingCard(card);
  };

  const handleCancelEdit = () => {
    setEditingCard(null);
  };

  const handleSaveEdit = (card: 'weekly' | 'monthly' | 'yearly') => {
    if (card === 'weekly') handleReorderGoal(editWeekly, 'weekly');
    else if (card === 'monthly') handleReorderGoal(editMonthly, 'monthly');
    else handleReorderGoal(editYearly, 'yearly');
    setEditingCard(null);
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
              style={[styles.weekDay, isSelected && [styles.weekDaySelected, themed.weekDaySelected]]}
            >
              <Text style={[styles.weekDayLabel, isSelected && themed.weekDayLabelSelected]}>
                {DAY_LABELS[index].toUpperCase()}
              </Text>
              <Text style={[styles.weekDayDate, isSelected && [styles.weekDayDateSelected, themed.weekDayDateSelected]]}>
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
      onPress={isEditing ? undefined : () => handleToggleGoal(item.id, item.type)}
      style={[styles.taskItem, { width: '100%' }]}
      activeOpacity={isEditing ? 1 : 0.7}
    >
      <View style={[styles.checkbox, themed.checkbox]}>
        {item.completed && <View style={[styles.checkboxChecked, themed.checkboxChecked]} />}
      </View>
      <Text style={[styles.taskText, item.completed && styles.taskTextCompleted]}>
        {item.text}
      </Text>
      {item.target_count > 1 && item.current_count > 0 && (
        <View style={[styles.goalCountBadge, themed.goalCountBadge]}>
          <Text style={[styles.goalCountBadgeText, themed.goalCountBadgeText]}>{item.current_count}</Text>
        </View>
      )}
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
          {/* Quote Card */}
          <QuoteCard quote={currentQuote} />

          {/* Week Navigator */}
          {renderWeekNavigator()}

          <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent}
          />
        }
      >
        {/* Today — Morning / Afternoon / Night notepad */}
        <TodayTimeBlocks
          tasks={todayTasks}
          isToday={selectedDay === DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}
          resetToken={`${selectedDay}:${focusCount}`}
          onToggle={handleToggleTask}
          onCreate={handleCreateTask}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onReorder={handleReorderTasks}
          onCopyFromDay={openCopyFromDay}
          onSectionChange={setTodaySection}
        />
        <ActionMenu
          visible={copyMenuVisible}
          title="Copy tasks from…"
          items={copyMenuItems}
          onClose={() => setCopyMenuVisible(false)}
        />

        {/* Notepad */}
        {showNotepad && (
          <View style={styles.notepadCard}>
            <Text style={styles.notepadLabel}>Notepad</Text>
            <TextInput
              style={styles.notepadInput}
              value={notepadContent}
              onChangeText={handleNotepadChange}
              placeholder="Write anything..."
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              maxLength={10000}
            />
          </View>
        )}

        {/* Goals Section */}
        <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.sectionAccent, themed.sectionAccent]} />
            <Text style={styles.sectionTitle}>Goals</Text>
          </View>
          <TouchableOpacity style={[styles.taskCardAddButton, themed.taskCardAddButton]} onPress={() => { setGoalType('weekly'); setGoalModalVisible(true); }}>
            <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Weekly Goals Card */}
        {showWeekly && (
          <View style={[styles.goalCard, themed.goalCardWeekly]}>
            <View style={styles.goalCardHeader}>
              <View style={styles.goalCardTitleRow}>
                <Text style={styles.goalCardTitle}>This week</Text>
                {weeklyCountdown.text ? (
                  <Text style={[styles.goalCardCountdown, themed.goalCardCountdown, weeklyCountdown.urgent && styles.countdownUrgent]}>
                    {weeklyCountdown.text}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {editingCard === 'weekly' ? (
                  <>
                    <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.taskCardAddButton, themed.taskCardAddButton]} onPress={() => handleSaveEdit('weekly')}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Save</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => handleEnterEdit('weekly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color={accent} />
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
        )}

        {/* Monthly Goals Card */}
        {showMonthly && (
          <View style={[styles.goalCard, themed.goalCardMonthly]}>
            <View style={styles.goalCardHeader}>
              <View style={styles.goalCardTitleRow}>
                <Text style={styles.goalCardTitle}>This month</Text>
                {monthlyCountdown.text ? (
                  <Text style={[styles.goalCardCountdown, themed.goalCardCountdown, monthlyCountdown.urgent && styles.countdownUrgent]}>
                    {monthlyCountdown.text}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {editingCard === 'monthly' ? (
                  <>
                    <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.taskCardAddButton, themed.taskCardAddButton]} onPress={() => handleSaveEdit('monthly')}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Save</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => handleEnterEdit('monthly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color={accent} />
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
        )}

        {/* Yearly Goals Card */}
        {showYearly && (
          <View style={[styles.goalCard, themed.goalCardYearly]}>
            <View style={styles.goalCardHeader}>
              <Text style={styles.goalCardTitle}>This year</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {editingCard === 'yearly' ? (
                  <>
                    <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.taskCardAddButton, themed.taskCardAddButton]} onPress={() => handleSaveEdit('yearly')}>
                      <Text style={[styles.taskCardAddButtonText, themed.taskCardAddButtonText]}>Save</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => handleEnterEdit('yearly')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color={accent} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={[styles.yearlyProgressText, themed.yearlyProgressText]}>Day {yearDay} / {yearTotal}</Text>
            <View style={styles.yearlyProgressTrack}>
              <View style={[styles.yearlyProgressFill, themed.yearlyProgressFill, { width: `${(yearDay / yearTotal) * 100}%` }]} />
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
        )}
      </ScrollView>

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
            onPress={() => { setGoalModalVisible(false); setNewGoalText(''); setNewGoalCount('1'); }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Goal</Text>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'weekly' && [styles.typeButtonActive, themed.typeButtonActive],
                ]}
                onPress={() => setGoalType('weekly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'weekly' && [styles.typeButtonTextActive, themed.typeButtonTextActive],
                ]}>
                  This week
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'monthly' && [styles.typeButtonActive, themed.typeButtonActive],
                ]}
                onPress={() => setGoalType('monthly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'monthly' && [styles.typeButtonTextActive, themed.typeButtonTextActive],
                ]}>
                  This month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'yearly' && [styles.typeButtonActive, themed.typeButtonActive],
                ]}
                onPress={() => setGoalType('yearly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'yearly' && [styles.typeButtonTextActive, themed.typeButtonTextActive],
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

            <View style={styles.goalCountRow}>
              <Text style={styles.goalCountLabel}>How many times?</Text>
              <TextInput
                style={styles.goalCountInput}
                keyboardType="number-pad"
                value={newGoalCount}
                onChangeText={(text) => setNewGoalCount(text.replace(/[^0-9]/g, ''))}
                onBlur={() => {
                  const parsed = parseInt(newGoalCount, 10);
                  const clamped = Number.isFinite(parsed) ? Math.min(999, Math.max(1, parsed)) : 1;
                  setNewGoalCount(String(clamped));
                }}
                maxLength={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setGoalModalVisible(false);
                  setNewGoalText('');
                  setNewGoalCount('1');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, themed.saveButton]}
                onPress={handleAddGoal}
              >
                <Text style={[styles.saveButtonText, themed.saveButtonText]}>Add</Text>
              </TouchableOpacity>
            </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
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

// Accent-colored pieces of the tab, rebuilt when the Today section changes.
const makeThemedStyles = (accent: string) => {
  const onAccent = textOnColor(accent);
  return StyleSheet.create({
    weekDaySelected: { backgroundColor: accent, shadowColor: accent },
    weekDayLabelSelected: { color: onAccent, opacity: 0.7 },
    weekDayDateSelected: { color: onAccent },
    sectionAccent: { backgroundColor: accent },
    taskCardAddButton: { backgroundColor: withAlpha(accent, 0.1), borderColor: withAlpha(accent, 0.3) },
    taskCardAddButtonText: { color: accent },
    goalCardWeekly: { borderLeftColor: withAlpha(accent, 0.6) },
    goalCardMonthly: { borderLeftColor: withAlpha(accent, 0.38) },
    goalCardYearly: { borderLeftColor: withAlpha(accent, 0.2) },
    goalCardCountdown: { color: accent },
    yearlyProgressText: { color: accent },
    yearlyProgressFill: { backgroundColor: accent },
    checkbox: { borderColor: accent },
    checkboxChecked: { backgroundColor: accent },
    goalCountBadge: { borderColor: accent },
    goalCountBadgeText: { color: accent },
    typeButtonActive: { backgroundColor: withAlpha(accent, 0.2), borderColor: withAlpha(accent, 0.4) },
    typeButtonTextActive: { color: accent },
    saveButton: { backgroundColor: accent },
    saveButtonText: { color: onAccent },
  });
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

  // Notepad
  notepadCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
  },
  notepadLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#666',
    marginBottom: 10,
  },
  notepadInput: {
    fontSize: 14,
    color: '#E8E8E8',
    minHeight: 100,
    paddingVertical: 4,
    lineHeight: 22,
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
  goalCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  goalCountBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5DCAA5',
  },
  goalCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  goalCountLabel: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  goalCountInput: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#E8E8E8',
    backgroundColor: '#1F1F1F',
    minWidth: 60,
    textAlign: 'center',
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
    paddingHorizontal: 4,
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  typeButtonActive: {
    backgroundColor: 'rgba(29, 158, 117, 0.2)',
    borderColor: 'rgba(29, 158, 117, 0.4)',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
    textAlign: 'center',
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
});

export default RoutineScreen;
