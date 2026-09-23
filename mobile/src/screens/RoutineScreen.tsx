import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import api from '../services/api';
import { RoutineTask, RoutineGoal, DayOfWeek } from '../types/routine';
import TodayTimeBlocks, { CreateTaskInput, TaskChanges, TodayTimeBlocksHandle } from '../components/TodayTimeBlocks';
import ActionMenu, { ActionMenuItem } from '../components/ActionMenu';
import RoutineSettingsSheet from '../components/RoutineSettingsSheet';
import GoalCard from '../components/GoalCard';
import DayRings from '../components/DayRings';
import EarlierCard from '../components/EarlierCard';
import { TimeOfDay } from '../types/routine';
import {
  SECTION_COLORS,
  TIME_OF_DAY_ORDER,
  getCurrentTimeOfDay,
  parseCountSuffix,
  taskTimeOfDay,
  textOnColor,
  withAlpha,
} from '../utils/timeOfDay';

type GoalType = 'weekly' | 'monthly' | 'yearly';
import QuoteCard from '../components/QuoteCard';
import { QUOTES } from '../data/quotes';
import GymScreen from './GymScreen';
import DrawerMenu from '../components/DrawerMenu';
import { Ionicons } from '@expo/vector-icons';
import { getNextMonday, formatTimeLeftLong, shouldShowUrgent } from '../utils/weeklyReset';
import { daysLeftLabel, monthInfo, weekInfo, yearInfo } from '../utils/periodProgress';

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

const DAY_NAMES: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const todayDayOfWeek = (): DayOfWeek => {
  const day = new Date().getDay();
  return DAYS[day === 0 ? 6 : day - 1];
};

// "Wednesday, Sep 23" for a day of the current week.
const headerDateLabel = (day: DayOfWeek): string => {
  const [y, m, d] = getCalendarDateForDay(day).split('-').map(Number);
  const month = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short' });
  return `${DAY_NAMES[day]}, ${month} ${d}`;
};

// Goal cards remember whether they were left open or folded, so the tab
// opens the way this person uses it. First run: Weekly and Monthly open,
// Yearly folded.
const GOAL_EXPANDED_KEY = 'routine_goal_expanded';
const DEFAULT_GOAL_EXPANDED: Record<GoalType, boolean> = { weekly: true, monthly: true, yearly: false };

// Items skipped from the "left from earlier" card, per calendar date.
const skippedKey = (date: string) => `routine_skipped_${date}`;

const RoutineScreen: React.FC = () => {
  const { user } = useAuth();
  const prefs = useRoutinePreferences();
  const { showWeekly, showMonthly, showYearly, showNotepad, boundaries } = prefs;

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




  // Bumped on every tab focus so the Today pager snaps back to the section
  // matching the current time.
  const [focusCount, setFocusCount] = useState(0);
  const [copyMenuVisible, setCopyMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Multi-select: id → kind. Survives day switches and section swipes so a
  // deletion can gather items from anywhere; cleared on delete, "Deselect",
  // or turning the mode off.
  const multiSelect = prefs.multiSelect;
  const [selected, setSelected] = useState<Map<string, 'task' | 'goal'>>(new Map());
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const [bulkMenuVisible, setBulkMenuVisible] = useState(false);
  useEffect(() => {
    if (!multiSelect) setSelected(new Map());
  }, [multiSelect]);
  // Client id → server id for tasks created this session, so a selection made
  // before a reload still points at the right row afterwards.
  const resolvedTaskIds = useRef<Map<string, string>>(new Map());
  // The whole tab takes its accent from the Today section being shown.
  const [todaySection, setTodaySection] = useState<TimeOfDay>(() => getCurrentTimeOfDay(new Date(), boundaries));
  const accent = SECTION_COLORS[todaySection];
  const themed = useMemo(() => makeThemedStyles(accent), [accent]);
  const tasksRef = useRef<RoutineTask[]>([]);
  tasksRef.current = tasks;
  // Tasks typed into the Today notepad get a client id immediately; this
  // maps it to the server id once the create lands (null if it failed).
  const pendingTaskIds = useRef<Map<string, Promise<string | null>>>(new Map());
  const orderSyncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const todayCardRef = useRef<TodayTimeBlocksHandle>(null);

  // Minute clock for the day bar, the "left from earlier" card and the
  // goal countdowns.
  const [now, setNow] = useState(() => new Date());

  // Day bar / "Later today" taps ask the Today card to switch sections.
  const [requestedSection, setRequestedSection] = useState<{ section: TimeOfDay; token: number } | null>(null);
  const showSection = (section: TimeOfDay) => setRequestedSection({ section, token: Date.now() });

  const [goalExpanded, setGoalExpanded] = useState<Record<GoalType, boolean>>(DEFAULT_GOAL_EXPANDED);
  useEffect(() => {
    AsyncStorage.getItem(GOAL_EXPANDED_KEY)
      .then(raw => {
        if (raw) setGoalExpanded(prev => ({ ...prev, ...JSON.parse(raw) }));
      })
      .catch(() => {});
  }, []);
  const toggleGoalExpanded = (type: GoalType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGoalExpanded(prev => {
      const next = { ...prev, [type]: !prev[type] };
      AsyncStorage.setItem(GOAL_EXPANDED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Today's skips, kept on the device for the rest of the day. The earlier
  // card waits for them to load so skipped items never flash back in.
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [skipsLoaded, setSkipsLoaded] = useState(false);
  const todayDate = getCalendarDateForDay(todayDayOfWeek());
  useEffect(() => {
    let cancelled = false;
    setSkipsLoaded(false);
    AsyncStorage.getItem(skippedKey(todayDate))
      .then(raw => {
        if (!cancelled) setSkippedIds(new Set(raw ? JSON.parse(raw) : []));
      })
      .catch(() => {
        if (!cancelled) setSkippedIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setSkipsLoaded(true);
      });
    // Earlier days' skips no longer matter.
    AsyncStorage.getAllKeys()
      .then(keys => {
        const stale = keys.filter(k => k.startsWith('routine_skipped_') && k !== skippedKey(todayDate));
        if (stale.length > 0) return AsyncStorage.multiRemove(stale);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todayDate]);

  // Countdown state
  // Weekly reset countdown ("2d 5h left"); also ticks the goal cards'
  // progress bars forward every minute.
  const [weeklyCountdown, setWeeklyCountdown] = useState({ text: '', urgent: false });

  // Quote state - only need disliked IDs for rotation filtering
  const [dislikedQuoteIds, setDislikedQuoteIds] = useState<number[]>([]);

  // Routine preferences (which goal sections to show)

  // Notepad
  const [notepadContent, setNotepadContent] = useState('');
  const notepadSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickingGoalIds = useRef<Set<string>>(new Set());
  // Per-task queue of check-off taps waiting on the server.
  const tickChains = useRef<Map<string, Promise<void>>>(new Map());
  const queuedTicks = useRef<Map<string, number>>(new Map());

  // Goals: hold menu, in-place editing, and client ids for goals typed in
  // before the server has answered (same pattern as Today tasks).
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalMenu, setGoalMenu] = useState<{ title: string; items: ActionMenuItem[] }>({ title: '', items: [] });
  const [goalMenuVisible, setGoalMenuVisible] = useState(false);
  const pendingGoalIds = useRef<Map<string, Promise<string | null>>>(new Map());

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
      setNow(now);
      const weeklyMs = getNextMonday().getTime() - now.getTime();
      setWeeklyCountdown({ text: formatTimeLeftLong(weeklyMs), urgent: shouldShowUrgent(weeklyMs) });
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

  // Reload notepad content each time this tab gains focus. (Visibility and
  // time-of-day settings come from RoutinePreferencesContext and are live.)
  useFocusEffect(useCallback(() => {
    api.get('/api/routine/notepad')
      .then(res => { if (res.data.success) setNotepadContent(res.data.data.content); })
      .catch(() => {});
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
        setSelected(prev => {
          let changed = false;
          const next = new Map<string, 'task' | 'goal'>();
          prev.forEach((kind, id) => {
            const real = resolvedTaskIds.current.get(id);
            if (real) changed = true;
            next.set(real ?? id, kind);
          });
          return changed ? next : prev;
        });
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
        resolvedTaskIds.current.set(clientId, saved.id);
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
      if (changes.scheduledTime !== undefined) next.scheduled_time = changes.scheduledTime;
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

  // Every tap shows immediately. Taps on the same item are sent to the server
  // one after another (never dropped, even while an earlier one is still
  // saving), and the server's answer is applied only once the last queued
  // tap is back — so a quick check-then-uncheck never flickers.
  const handleToggleTask = (taskId: string): Promise<void> => {
    // Same tick rule as the server: count down to done; tapping a done
    // task steps it back up one.
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newCount = t.current_count > 0
        ? t.current_count - 1
        : Math.min(t.current_count + 1, t.target_count);
      return { ...t, current_count: newCount, completed: newCount === 0 };
    }));

    const day = selectedDay;
    queuedTicks.current.set(taskId, (queuedTicks.current.get(taskId) ?? 0) + 1);
    const previous = tickChains.current.get(taskId) ?? Promise.resolve();
    const next = previous.then(() => sendTick(taskId, day));
    tickChains.current.set(taskId, next);
    return next;
  };

  const sendTick = async (taskId: string, day: DayOfWeek) => {
    let saved: RoutineTask | null = null;
    let failed = false;
    try {
      const serverId = await resolveTaskId(taskId);
      if (!serverId) return;

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const selectedDate = getCalendarDateForDay(day);
      const now = new Date();
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const body: { timezone: string; date?: string } = { timezone };

      if (selectedDate < todayDate) {
        body.date = selectedDate;
      }

      const response = await api.patch(`/api/routine/tasks/${serverId}`, body);
      if (response.data.success) saved = response.data.data;
    } catch (error) {
      console.error('[RoutineScreen] Error toggling task:', error);
      failed = true;
    } finally {
      const left = (queuedTicks.current.get(taskId) ?? 1) - 1;
      if (left > 0) {
        queuedTicks.current.set(taskId, left);
      } else {
        queuedTicks.current.delete(taskId);
        tickChains.current.delete(taskId);
        if (failed) {
          if (selectedDayRef.current === day) loadTasks();
        } else if (saved) {
          const updated = saved;
          setTasks(prev => prev.map(t => (t.id === taskId
            ? { ...t, completed: updated.completed, current_count: updated.current_count, target_count: updated.target_count }
            : t)));
        }
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelected(prev => {
      if (!prev.has(taskId)) return prev;
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
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
          scheduledTime: task.scheduled_time ?? undefined,
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

  // ============================================
  // MULTI-SELECT + CLEAR ALL
  // ============================================

  const toggleSelected = (id: string, kind: 'task' | 'goal') => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, kind);
      return next;
    });
  };

  // Hold on a selected item: the only action offered is deleting the whole
  // selection (per spec: multi-select is for deletion only).
  const openBulkMenu = () => {
    if (selected.size > 0) setBulkMenuVisible(true);
  };

  // Last chance before a multi-select deletion (it can span days).
  const confirmDeleteSelected = () => {
    const count = selected.size;
    if (count === 0) return;
    Alert.alert(
      count > 1 ? `Delete ${count} items?` : 'Delete this item?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDeleteSelected },
      ],
    );
  };

  const handleDeleteSelected = async () => {
    const entries = Array.from(selected.entries());
    const taskIds = entries.filter(([, kind]) => kind === 'task').map(([id]) => id);
    const goalIds = entries.filter(([, kind]) => kind === 'goal').map(([id]) => id);
    const doomed = new Set(entries.map(([id]) => id));

    setTasks(prev => prev.filter(t => !doomed.has(t.id)));
    setWeeklyGoals(prev => prev.filter(g => !doomed.has(g.id)));
    setMonthlyGoals(prev => prev.filter(g => !doomed.has(g.id)));
    setYearlyGoals(prev => prev.filter(g => !doomed.has(g.id)));
    setSelected(new Map());

    try {
      const serverTaskIds = (await Promise.all(taskIds.map(resolveTaskId))).filter(
        (id): id is string => !!id,
      );
      await Promise.all([
        serverTaskIds.length > 0 ? api.post('/api/routine/tasks/bulk-delete', { ids: serverTaskIds }) : null,
        goalIds.length > 0 ? api.post('/api/routine/goals/bulk-delete', { ids: goalIds }) : null,
      ]);
    } catch (error) {
      console.error('[RoutineScreen] Bulk delete failed:', error);
      Alert.alert("Couldn't delete", 'Some items may not have been deleted. Your list has been refreshed.');
      loadData();
    }
  };

  // Gear → Copy a day: replace each target day with an exact copy of
  // fromDay (one server call per day, in order) and show the result. The
  // sheet closes itself once the copy window is gone.
  const handleCopyDay = async (fromDay: DayOfWeek, toDays: DayOfWeek[]) => {
    const dayLabel = (d: DayOfWeek) => d.charAt(0).toUpperCase() + d.slice(1);
    const done: DayOfWeek[] = [];
    let currentDayCopy: RoutineTask[] | null = null;
    for (const toDay of toDays) {
      try {
        const response = await api.post('/api/routine/tasks/copy-day', { fromDay, toDay });
        done.push(toDay);
        if (toDay === selectedDayRef.current) currentDayCopy = response.data.data;
      } catch (error) {
        console.error(`[RoutineScreen] Copy ${fromDay} → ${toDay} failed:`, error);
        Alert.alert(
          "Couldn't finish copying",
          done.length > 0
            ? `${done.map(dayLabel).join(', ')} ${done.length === 1 ? 'was' : 'were'} replaced; ${dayLabel(toDay)} and any after it weren't. Try again for the rest.`
            : 'Nothing was changed. Check your connection and try again.',
        );
        if (done.length > 0) loadTasks();
        throw error; // keeps the copy window open
      }
    }

    // Items that were on the day being viewed are gone; drop any selected.
    if (currentDayCopy) {
      const replaced = new Set(tasksRef.current.map(t => t.id));
      setSelected(prev => {
        let changed = false;
        const next = new Map(prev);
        replaced.forEach(id => {
          if (next.delete(id)) changed = true;
        });
        return changed ? next : prev;
      });
      setTasks(currentDayCopy);
    } else {
      setSelectedDay(toDays[0]); // show the first copied day
    }
  };

  const handleClearAll = async () => {
    try {
      await api.post('/api/routine/clear');
    } catch (error) {
      console.error('[RoutineScreen] Clear all failed:', error);
      Alert.alert("Couldn't clear", 'Nothing was deleted. Check your connection and try again.');
      throw error; // keeps the settings sheet open
    }
    // A pending notepad save or reorder would otherwise write old data back.
    if (notepadSaveTimeout.current) clearTimeout(notepadSaveTimeout.current);
    if (orderSyncTimeout.current) clearTimeout(orderSyncTimeout.current);
    orderSyncTimeout.current = null;
    setTasks([]);
    setWeeklyGoals([]);
    setMonthlyGoals([]);
    setYearlyGoals([]);
    setNotepadContent('');
    setSelected(new Map());
  };

  // ============================================
  // GOAL HANDLERS
  // Goals work like Today items: type on a card's last line to add, tap to
  // check off (or select in multi-select), hold for Edit / Move / Delete.
  // ============================================

  const setGoalsOf = (type: GoalType) =>
    type === 'weekly' ? setWeeklyGoals : type === 'monthly' ? setMonthlyGoals : setYearlyGoals;
  const goalsOf = (type: GoalType) =>
    type === 'weekly' ? weeklyGoals : type === 'monthly' ? monthlyGoals : yearlyGoals;

  const resolveGoalId = async (id: string): Promise<string | null> => {
    const pending = pendingGoalIds.current.get(id);
    return pending ? pending : id;
  };

  const handleCreateGoal = (type: GoalType, raw: string) => {
    const parsed = parseCountSuffix(raw);
    if (!parsed.text) return;
    const targetCount = parsed.targetCount ?? 1;
    const clientId = `tmp-goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: RoutineGoal = {
      id: clientId,
      user_id: user?.id ?? '',
      text: parsed.text,
      type,
      week_number: null,
      month: null,
      year: new Date().getFullYear(),
      completed: false,
      completed_at: null,
      target_count: targetCount,
      current_count: targetCount,
      created_at: new Date().toISOString(),
    };
    setGoalsOf(type)(prev => [...prev, optimistic]);

    const request = (async (): Promise<string | null> => {
      try {
        const response = await api.post('/api/routine/goals', { text: parsed.text, type, targetCount });
        const saved: RoutineGoal = response.data.data;
        // Keep anything changed locally in the meantime; take the real id.
        setGoalsOf(type)(prev => prev.map(g => (g.id === clientId ? { ...saved, text: g.text } : g)));
        setEditingGoalId(prev => (prev === clientId ? saved.id : prev));
        setSelected(prev => {
          if (!prev.has(clientId)) return prev;
          const next = new Map(prev);
          next.delete(clientId);
          next.set(saved.id, 'goal');
          return next;
        });
        return saved.id;
      } catch (error) {
        console.error('[RoutineScreen] Error adding goal:', error);
        setGoalsOf(type)(prev => prev.filter(g => g.id !== clientId));
        Alert.alert("Couldn't save", `"${parsed.text}" wasn't saved. Check your connection and try again.`);
        return null;
      }
    })();
    pendingGoalIds.current.set(clientId, request);
  };

  const handleToggleGoal = async (goalId: string, type: GoalType) => {
    if (tickingGoalIds.current.has(goalId)) return;
    tickingGoalIds.current.add(goalId);

    // Same tick rule as the server: count down to done; tapping a done goal
    // steps it back up one.
    setGoalsOf(type)(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const newCount = g.current_count > 0 ? g.current_count - 1 : Math.min(g.current_count + 1, g.target_count);
      return { ...g, current_count: newCount, completed: newCount === 0 };
    }));

    try {
      const serverId = await resolveGoalId(goalId);
      if (!serverId) return;
      const response = await api.patch(`/api/routine/goals/${serverId}`, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (response.data.success) {
        const updated: RoutineGoal = response.data.data;
        setGoalsOf(type)(prev => prev.map(g => (g.id === goalId
          ? {
              ...g,
              completed: updated.completed,
              completed_at: updated.completed_at,
              current_count: updated.current_count,
              target_count: updated.target_count,
            }
          : g)));
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling goal:', error);
      loadGoalsOf(type);
    } finally {
      tickingGoalIds.current.delete(goalId);
    }
  };

  const loadGoalsOf = (type: GoalType) => {
    if (type === 'weekly') loadWeeklyGoals();
    else if (type === 'monthly') loadMonthlyGoals();
    else loadYearlyGoals();
  };

  const handleDeleteGoal = async (goal: RoutineGoal) => {
    setGoalsOf(goal.type)(prev => prev.filter(g => g.id !== goal.id));
    setSelected(prev => {
      if (!prev.has(goal.id)) return prev;
      const next = new Map(prev);
      next.delete(goal.id);
      return next;
    });
    const serverId = await resolveGoalId(goal.id);
    if (!serverId) return;
    try {
      await api.delete(`/api/routine/goals/${serverId}`);
    } catch (error) {
      console.error('[RoutineScreen] Error deleting goal:', error);
      Alert.alert('Error', 'Failed to delete goal.');
      loadGoalsOf(goal.type);
    }
  };

  // Commit an in-place edit. Clearing the text deletes the goal; "Run x3"
  // sets a 3-tap countdown, like Today items.
  const handleGoalEditDone = async (goal: RoutineGoal, raw: string) => {
    setEditingGoalId(null);
    if (!raw.trim()) {
      handleDeleteGoal(goal);
      return;
    }
    const parsed = parseCountSuffix(raw);
    const changes: { text?: string; targetCount?: number } = {};
    if (parsed.text !== goal.text) changes.text = parsed.text;
    if (parsed.targetCount !== null && parsed.targetCount !== goal.target_count) {
      changes.targetCount = parsed.targetCount;
    }
    if (changes.text === undefined && changes.targetCount === undefined) return;
    updateGoal(goal, changes);
  };

  // Apply a text and/or count change locally, then save it.
  const updateGoal = async (goal: RoutineGoal, changes: { text?: string; targetCount?: number }) => {
    setGoalsOf(goal.type)(prev => prev.map(g => {
      if (g.id !== goal.id) return g;
      const next = { ...g };
      if (changes.text !== undefined) next.text = changes.text;
      if (changes.targetCount !== undefined) {
        const tapsDone = g.target_count - g.current_count;
        next.target_count = changes.targetCount;
        next.current_count = Math.max(0, changes.targetCount - tapsDone);
        next.completed = next.current_count === 0;
      }
      return next;
    }));

    const serverId = await resolveGoalId(goal.id);
    if (!serverId) return;
    try {
      const response = await api.put(`/api/routine/goals/${serverId}`, changes);
      const saved: RoutineGoal = response.data.data;
      setGoalsOf(goal.type)(prev => prev.map(g => (g.id === goal.id
        ? { ...g, target_count: saved.target_count, current_count: saved.current_count, completed: saved.completed, completed_at: saved.completed_at }
        : g)));
    } catch (error) {
      console.error('[RoutineScreen] Error updating goal:', error);
      Alert.alert("Couldn't save", "That change didn't save. Pull down to refresh and try again.");
    }
  };

  // Same prompt as Today items' "Make it a counter".
  const promptGoalCount = (goal: RoutineGoal) => {
    Alert.prompt(
      'How many times?',
      'Each tap counts one down. Set 1 for a regular checkbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            const parsed = parseInt(value ?? '', 10);
            if (!Number.isFinite(parsed)) return;
            const count = Math.min(999, Math.max(1, parsed));
            if (count !== goal.target_count) updateGoal(goal, { targetCount: count });
          },
        },
      ],
      'plain-text',
      String(goal.target_count),
      'number-pad',
    );
  };

  const handleMoveGoal = async (goal: RoutineGoal, direction: -1 | 1) => {
    const list = goalsOf(goal.type).slice();
    const index = list.findIndex(g => g.id === goal.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setGoalsOf(goal.type)(list);
    try {
      const ids = (await Promise.all(list.map(g => resolveGoalId(g.id)))).filter((id): id is string => !!id);
      await api.patch('/api/routine/goals/reorder', { ids });
    } catch (error) {
      console.error('[RoutineScreen] Goal reorder failed:', error);
      loadGoalsOf(goal.type);
    }
  };

  const handleGoalPress = (goal: RoutineGoal) => {
    if (multiSelect) toggleSelected(goal.id, 'goal');
    else handleToggleGoal(goal.id, goal.type);
  };

  // Hold: in multi-select with several items selected (this one among them)
  // the only option is deleting the selection; otherwise Edit / Move /
  // counter / Delete (Today items' menu minus time).
  const handleGoalHold = (goal: RoutineGoal) => {
    if (multiSelect && selected.has(goal.id) && selected.size > 1) {
      openBulkMenu();
      return;
    }
    const list = goalsOf(goal.type);
    const index = list.findIndex(g => g.id === goal.id);
    const items: ActionMenuItem[] = [
      { label: 'Edit', icon: 'create-outline', onPress: () => setEditingGoalId(goal.id) },
    ];
    if (index > 0) items.push({ label: 'Move up', icon: 'arrow-up', onPress: () => handleMoveGoal(goal, -1) });
    if (index >= 0 && index < list.length - 1) {
      items.push({ label: 'Move down', icon: 'arrow-down', onPress: () => handleMoveGoal(goal, 1) });
    }
    items.push({
      label: goal.target_count > 1 ? `Change count (${goal.target_count})` : 'Make it a counter',
      icon: 'repeat',
      onPress: () => promptGoalCount(goal),
    });
    items.push({ label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => handleDeleteGoal(goal) });
    setGoalMenu({ title: goal.text, items });
    setGoalMenuVisible(true);
  };

  // Filter tasks by type
  const todayTasks = tasks.filter(t => t.type === 'today');

  // ============================================
  // LEFT FROM EARLIER
  // ============================================

  const isToday = selectedDay === todayDayOfWeek();
  const nowSection = getCurrentTimeOfDay(now, boundaries);
  const nowIndex = TIME_OF_DAY_ORDER.indexOf(nowSection);
  const earlierTasks = isToday
    ? todayTasks.filter(t =>
        // The list can still hold the previous day's tasks for a moment
        // after switching back to today.
        t.day_of_week === selectedDay &&
        TIME_OF_DAY_ORDER.indexOf(taskTimeOfDay(t)) < nowIndex &&
        !skippedIds.has(t.id))
    : [];

  // Edit finished on a row of the "left from earlier" card — same rules as
  // editing in the Today card: empty deletes, "Run x3" sets a counter.
  const handleEarlierEditDone = (id: string, raw: string) => {
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
    if (!raw.trim()) {
      handleDeleteTask(id);
      return;
    }
    const parsed = parseCountSuffix(raw);
    const changes: TaskChanges = {};
    if (parsed.text !== task.text) changes.text = parsed.text;
    if (parsed.targetCount !== null && parsed.targetCount !== task.target_count) {
      changes.targetCount = parsed.targetCount;
    }
    if (changes.text !== undefined || changes.targetCount !== undefined) handleUpdateTask(id, changes);
  };

  const handleSkipEarlier = (ids: string[]) => {
    const serverIds = ids.map(id => resolvedTaskIds.current.get(id) ?? id);
    setSkippedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      serverIds.forEach(id => next.add(id));
      AsyncStorage.setItem(skippedKey(todayDate), JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  // "Day x of y" for each goal card, on the local calendar (leap-year and
  // month-length aware — see utils/periodProgress).
  const week = weekInfo();
  const month = monthInfo();
  const year = yearInfo();

  const goalCardHandlers = {
    editingId: editingGoalId,
    selectedIds,
    onPress: handleGoalPress,
    onHold: handleGoalHold,
    onCreate: handleCreateGoal,
    onEditDone: handleGoalEditDone,
  };

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
        <View style={styles.headerTitleWrap} pointerEvents="none">
          {activeSection === 'routine' && (
            <Text style={styles.headerTitle}>{headerDateLabel(selectedDay)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        {activeSection === 'routine' && (
          <TouchableOpacity
            onPress={() => setSettingsVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Routine settings"
          >
            {/* Tinted while multi-select is on, as a reminder of the mode */}
            <Ionicons name="settings-outline" size={22} color={multiSelect ? accent : '#FFFFFF'} />
          </TouchableOpacity>
        )}
      </View>

      {activeSection === 'routine' ? (
        <>
          {/* Week Navigator */}
          {renderWeekNavigator()}

          <ScrollView
        contentContainerStyle={[styles.scrollContent, multiSelect && { paddingBottom: 96 }]}
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
        {/* One ring per part of the day; tap one to switch the Today card */}
        <DayRings
          tasks={todayTasks}
          isToday={isToday}
          now={now}
          boundaries={boundaries}
          shownSection={todaySection}
          onSelectSection={showSection}
        />

        {/* Still open from earlier today. Hidden while the Today card itself
            shows one of those earlier sections, so checking or unchecking
            there doesn't make a card pop in above the list. */}
        {isToday && skipsLoaded && TIME_OF_DAY_ORDER.indexOf(todaySection) >= nowIndex && (
          <EarlierCard
            tasks={earlierTasks}
            resetKey={`${selectedDay}:${nowSection}`}
            onTick={handleToggleTask}
            onSkip={handleSkipEarlier}
            onHold={(id, startEdit) => todayCardRef.current?.openItemMenu(id, startEdit)}
            onEditDone={handleEarlierEditDone}
          />
        )}

        {/* Today — Morning / Afternoon / Night notepad */}
        <TodayTimeBlocks
          ref={todayCardRef}
          tasks={todayTasks}
          isToday={isToday}
          resetToken={`${selectedDay}:${focusCount}`}
          onToggle={handleToggleTask}
          onCreate={handleCreateTask}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onReorder={handleReorderTasks}
          onCopyFromDay={openCopyFromDay}
          onSectionChange={setTodaySection}
          selectionMode={multiSelect}
          selectedIds={selectedIds}
          onToggleSelect={id => toggleSelected(id, 'task')}
          onRequestBulkDelete={openBulkMenu}
          showTabs={false}
          requestedSection={requestedSection}
        />
        <ActionMenu
          visible={copyMenuVisible}
          title="Copy tasks from…"
          items={copyMenuItems}
          accent={accent}
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

        {/* Goals */}
        {(showWeekly || showMonthly || showYearly) && (
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, themed.sectionAccent]} />
            <Text style={styles.sectionTitle}>Goals</Text>
          </View>
        )}
        {showWeekly && (
          <GoalCard
            type="weekly"
            expanded={goalExpanded.weekly}
            onToggleExpanded={() => toggleGoalExpanded('weekly')}
            title="Weekly"
            goals={weeklyGoals}
            accent={accent}
            edgeAlpha={0.6}
            period={{
              progress: week.progress,
              detail: weeklyCountdown.text,
              urgent: weeklyCountdown.urgent,
            }}
            {...goalCardHandlers}
          />
        )}
        {showMonthly && (
          <GoalCard
            type="monthly"
            expanded={goalExpanded.monthly}
            onToggleExpanded={() => toggleGoalExpanded('monthly')}
            title="Monthly"
            goals={monthlyGoals}
            accent={accent}
            edgeAlpha={0.38}
            period={{
              progress: month.progress,
              detail: `Day ${month.day} of ${month.total} · ${daysLeftLabel(month.daysLeft)}`,
              urgent: month.daysLeft === 0,
            }}
            {...goalCardHandlers}
          />
        )}
        {showYearly && (
          <GoalCard
            type="yearly"
            expanded={goalExpanded.yearly}
            onToggleExpanded={() => toggleGoalExpanded('yearly')}
            title="Yearly"
            goals={yearlyGoals}
            accent={accent}
            edgeAlpha={0.2}
            period={{
              progress: year.progress,
              detail: `Day ${year.day} of ${year.total} · ${daysLeftLabel(year.daysLeft)}`,
              urgent: year.daysLeft === 0,
            }}
            {...goalCardHandlers}
          />
        )}

        {/* Quote of the day (tap to rate) */}
        <QuoteCard quote={currentQuote} quiet />
      </ScrollView>

        </>
      ) : (
        <GymScreen />
      )}

      {/* Multi-select counter — shown the whole time the mode is on */}
      {activeSection === 'routine' && multiSelect && (
        <View pointerEvents="box-none" style={styles.selectionBarWrap}>
          <View style={[styles.selectionBar, { borderColor: withAlpha(accent, 0.45) }]}>
            <Ionicons name="checkmark-done-outline" size={17} color={accent} />
            <Text style={styles.selectionText}>
              {selected.size === 0
                ? 'Tap items to select'
                : `${selected.size} selected · hold one to delete`}
            </Text>
            {selected.size > 0 && (
              <TouchableOpacity onPress={() => setSelected(new Map())} hitSlop={8}>
                <Text style={[styles.selectionAction, { color: accent }]}>Deselect</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ActionMenu
        visible={bulkMenuVisible}
        title={`${selected.size} selected`}
        items={[
          {
            label: selected.size > 1 ? `Delete ${selected.size} items` : 'Delete',
            icon: 'trash-outline',
            destructive: true,
            onPress: confirmDeleteSelected,
          },
        ]}
        accent={accent}
        onClose={() => setBulkMenuVisible(false)}
      />

      <ActionMenu
        visible={goalMenuVisible}
        title={goalMenu.title}
        items={goalMenu.items}
        accent={accent}
        onClose={() => setGoalMenuVisible(false)}
      />

      <RoutineSettingsSheet
        visible={settingsVisible}
        accent={accent}
        onClose={() => setSettingsVisible(false)}
        onClearAll={handleClearAll}
        onCopyDay={handleCopyDay}
      />

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
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },

  // Multi-select
  selectionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  selectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  selectionAction: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Hamburger header
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E8E8E8',
  },
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

});

export default RoutineScreen;
