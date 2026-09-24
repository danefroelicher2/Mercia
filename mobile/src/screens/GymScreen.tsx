import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  AppState,
  AppStateStatus,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import QuoteCard from '../components/QuoteCard';
import { QUOTES } from '../data/quotes';
import { DayOfWeek } from '../types/routine';
import api from '../services/api';
import { useTimeOfDayAccent } from '../hooks/useTimeOfDayAccent';
import { textOnColor, withAlpha } from '../utils/timeOfDay';

interface GymWorkoutLog {
  id: string;
  user_id: string;
  day_of_week: string;
  workout_group: string;
  notes: string;
  logged_date: string;
  week_number: number;
  year: number;
  is_rest: boolean;
  created_at: string;
  updated_at: string;
}

interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
  pinned: boolean;
  created_at: string;
}

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

const DAY_OFFSETS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

// Mirrors the backend's getISOWeekDayDate so we can identify the session_date the
// current day's entry is stored under, and exclude it from the "Prior Sessions" list.
function getISOWeekDayDate(dayOfWeek: string, weekNumber: number, year: number): string {
  const jan4 = new Date(year, 0, 4);
  const jan4DayOfWeek = (jan4.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4DayOfWeek + (weekNumber - 1) * 7);
  const offset = DAY_OFFSETS[dayOfWeek.toLowerCase()] ?? 0;
  const result = new Date(monday);
  result.setDate(monday.getDate() + offset);
  return result.toISOString().split('T')[0];
}

function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

const getTodayDay = (): DayOfWeek => {
  const d = new Date().getDay();
  return DAYS[d === 0 ? 6 : d - 1];
};

const GymScreen: React.FC = () => {
  // Accent follows the part of the day, like the Routine tab.
  const { accent } = useTimeOfDayAccent();
  const themed = useMemo(() => makeThemedStyles(accent), [accent]);
  const navigation = useNavigation<any>();

  const handleViewGymMemory = () => {
    // Two synchronous navigate calls so React batches them into a single render,
    // producing [Profile, GymMemory] in one frame with no intermediate flash.
    navigation.navigate('Profile');
    navigation.navigate('Profile', { screen: 'GymMemory' });
  };
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getTodayDay);
  const [workoutGroup, setWorkoutGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [hasKeystroke, setHasKeystroke] = useState(false);
  const [priorSessions, setPriorSessions] = useState<GymMemoryEntry[]>([]);
  const [priorSessionEmpty, setPriorSessionEmpty] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);
  const [weekLog, setWeekLog] = useState<GymWorkoutLog[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') setSelectedDay(getTodayDay());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    loadDayEntry(selectedDay);
    loadWeekLog();
    loadSuggestions();
  }, [selectedDay]);

  const loadDayEntry = async (day: DayOfWeek) => {
    try {
      const res = await api.get(`/api/gym/log/${day}`);
      const entry: GymWorkoutLog | null = res.data.data;
      if (entry && entry.is_rest) {
        // Rest marker — show the rest state, not "Rest" as a workout name.
        setIsRestDay(true);
        setWorkoutGroup('');
        setNotes('');
        setHasKeystroke(false);
        setPriorSessions([]);
        setPriorSessionEmpty(false);
      } else if (entry) {
        setIsRestDay(false);
        setWorkoutGroup(entry.workout_group);
        setNotes(entry.notes);
        setHasKeystroke(false);
        if (entry.workout_group) {
          loadPriorSession(entry.workout_group);
        } else {
          setPriorSessions([]);
          setPriorSessionEmpty(false);
        }
      } else {
        setIsRestDay(false);
        setWorkoutGroup('');
        setNotes('');
        setHasKeystroke(false);
        setPriorSessions([]);
        setPriorSessionEmpty(false);
      }
    } catch {
      // ignore
    }
  };

  const loadWeekLog = async () => {
    try {
      const res = await api.get('/api/gym/week');
      setWeekLog(res.data.data || []);
    } catch {
      // ignore
    }
  };

  const loadSuggestions = async () => {
    try {
      const res = await api.get('/api/gym/memory');
      const groups: Array<{ workout_group: string }> = res.data.data || [];
      setSuggestions(groups.map(g => g.workout_group));
    } catch {
      // ignore
    }
  };

  const loadPriorSession = async (group: string) => {
    const normalized = group.trim();
    if (!normalized) return;
    try {
      const res = await api.get(`/api/gym/memory/${encodeURIComponent(normalized)}`);
      const entries: GymMemoryEntry[] = res.data.data || [];
      // Exclude the session for the currently-selected day — the user is editing it
      // right now and doesn't need to see it duplicated under "Prior Sessions".
      const now = new Date();
      const currentSessionDate = getISOWeekDayDate(selectedDay, getISOWeek(now), now.getFullYear());
      const priors = entries.filter(e => e.session_date !== currentSessionDate);
      if (priors.length > 0) {
        setPriorSessions(priors.slice(0, 5));
        setPriorSessionEmpty(false);
      } else {
        setPriorSessions([]);
        setPriorSessionEmpty(true);
      }
    } catch {
      setPriorSessions([]);
      setPriorSessionEmpty(false);
    }
  };

  const triggerSave = (group: string, notesValue: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      if (!group.trim()) return;
      try {
        await api.post('/api/gym/log', {
          dayOfWeek: selectedDay,
          workoutGroup: group.trim(),
          notes: notesValue.trim(),
        });
        loadPriorSession(group.trim());
        loadWeekLog();
      } catch {
        // ignore
      }
    }, 1000);
  };

  const handleToggleRest = async (day: DayOfWeek = selectedDay) => {
    const next = !isRestDay;
    setIsRestDay(next);
    if (next) {
      // Rest replaces any in-progress typing for the day.
      setWorkoutGroup('');
      setNotes('');
      setPriorSessions([]);
      setPriorSessionEmpty(false);
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    }
    try {
      await api.post('/api/gym/log/rest', { dayOfWeek: day, rest: next });
      loadWeekLog();
    } catch {
      setIsRestDay(!next); // revert on failure
    }
  };

  const handleGroupChange = (text: string) => {
    // Typing a workout name un-rests the day.
    if (isRestDay) {
      setIsRestDay(false);
      api.post('/api/gym/log/rest', { dayOfWeek: selectedDay, rest: false }).catch(() => {});
    }
    setWorkoutGroup(text);
    setShowSuggestions(text.length >= 1);
    triggerSave(text, notes);
  };

  // "Copy last session" — prefill today's notes with the most recent prior
  // session's notes (by date, ignoring pin order) for edit-in-place.
  const lastSession = priorSessions.length > 0
    ? priorSessions.reduce((latest, s) => (s.session_date > latest.session_date ? s : latest))
    : null;

  const handleCopyLastSession = () => {
    if (!lastSession) return;
    setNotes(lastSession.notes);
    triggerSave(workoutGroup, lastSession.notes);
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    if (!hasKeystroke) setHasKeystroke(true);
    triggerSave(workoutGroup, text);
  };

  const handleSuggestionTap = (group: string) => {
    setWorkoutGroup(group);
    setShowSuggestions(false);
    triggerSave(group, notes);
    loadPriorSession(group);
  };

  const handleTogglePin = async (session: GymMemoryEntry) => {
    // Best-effort client guard; the server enforces the 3-pin cap authoritatively.
    if (!session.pinned && priorSessions.filter(s => s.pinned).length >= 3) {
      Alert.alert('Pin limit reached', 'You can pin up to 3 workouts per group.');
      return;
    }
    try {
      await api.post(`/api/gym/memory/entry/${session.id}/pin`, { pinned: !session.pinned });
      loadPriorSession(workoutGroup);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to update pin. Please try again.');
    }
  };

  const filteredSuggestions = suggestions.filter(s =>
    s.toLowerCase().includes(workoutGroup.toLowerCase())
  );

  const currentQuote = useMemo(() => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    return QUOTES[dayOfYear % QUOTES.length];
  }, []);

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
          const logEntry = weekLog.find(e => e.day_of_week === day);
          const hasWorkout = !!(logEntry && logEntry.workout_group);
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
              {hasWorkout && !isSelected && <View style={[styles.dot, themed.fill]} />}
              {/* Past days stay crossed out, selected or not */}
              {isPastDay && (
                <View pointerEvents="none" style={styles.pastDaySlashContainer}>
                  <View style={[styles.pastDaySlash, isSelected && themed.pastDaySlashSelected]} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <QuoteCard quote={currentQuote} />
      {renderWeekNavigator()}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Unified Workout Entry Card */}
        <View style={styles.card}>
          <View style={styles.groupRow}>
            <TextInput
              style={styles.groupInput}
              value={workoutGroup}
              onChangeText={handleGroupChange}
              placeholder={isRestDay ? 'Rest day' : 'Workout name...'}
              placeholderTextColor={isRestDay ? accent : colors.textTertiary}
              returnKeyType="done"
              textAlign="center"
            />
            <TouchableOpacity
              style={[styles.restButton, isRestDay && themed.restButtonActive]}
              onPress={() => handleToggleRest()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.restButtonText, isRestDay && themed.text]}>
                Rest
              </Text>
            </TouchableOpacity>
          </View>
          {showSuggestions && filteredSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsRow}>
              {filteredSuggestions.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestionPill, themed.suggestionPill]}
                  onPress={() => handleSuggestionTap(s)}
                >
                  <Text style={[styles.suggestionText, themed.text]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.cardDivider} />
          {isRestDay ? (
            <Text style={styles.restMessage}>
              Rest day logged — recovery counts. Mercia knows this isn't a skip.
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={handleNotesChange}
                placeholder="Write your workout..."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
              {notes.trim().length === 0 && lastSession && (
                <TouchableOpacity onPress={handleCopyLastSession} style={styles.copyLastButton}>
                  <Text style={[styles.copyLastText, themed.text]}>
                    Copy last session ({formatDate(lastSession.session_date)}) ↓
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Prior Session Card */}
        {workoutGroup.trim().length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Prior Sessions</Text>
            {priorSessionEmpty ? (
              <Text style={styles.emptyState}>No previous {workoutGroup} sessions yet.</Text>
            ) : priorSessions.length > 0 ? (
              priorSessions.map((session, index) => (
                <View key={session.id}>
                  {index > 0 && <View style={styles.sessionDivider} />}
                  <View style={styles.priorHeader}>
                    <Text style={[styles.priorDate, themed.text]}>{formatDate(session.session_date)}</Text>
                    <TouchableOpacity
                      onPress={() => handleTogglePin(session)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.starIcon, session.pinned && styles.starIconActive]}>
                        {session.pinned ? '★' : '☆'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.priorNotes}>{session.notes}</Text>
                </View>
              ))
            ) : null}
            <TouchableOpacity
              style={styles.memoryLink}
              onPress={handleViewGymMemory}
            >
              <Text style={styles.memoryLinkText}>Go to Gym Memory →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// Accent-colored pieces, rebuilt when the part of the day changes.
const makeThemedStyles = (accent: string) => {
  const onAccent = textOnColor(accent);
  return StyleSheet.create({
    weekDaySelected: { backgroundColor: accent, shadowColor: accent },
    weekDayLabelSelected: { color: onAccent, opacity: 0.7 },
    weekDayDateSelected: { color: onAccent },
    pastDaySlashSelected: { backgroundColor: withAlpha(onAccent === '#FFFFFF' ? '#FFFFFF' : '#0D0D0D', 0.35) },
    fill: { backgroundColor: accent },
    text: { color: accent },
    restButtonActive: { borderColor: withAlpha(accent, 0.5), backgroundColor: withAlpha(accent, 0.15) },
    suggestionPill: { backgroundColor: withAlpha(accent, 0.1), borderColor: withAlpha(accent, 0.25) },
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
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
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1D9E75',
    marginTop: 3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    paddingVertical: 8,
    textAlign: 'center',
    // Offset the Rest button's width so the centered text stays visually
    // centered in the card.
    marginLeft: 44,
  },
  restButton: {
    width: 44,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
  },
  restButtonActive: {
    borderColor: 'rgba(29, 158, 117, 0.5)',
    backgroundColor: 'rgba(29, 158, 117, 0.15)',
  },
  restButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  restButtonTextActive: {
    color: '#5DCAA5',
  },
  restMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingVertical: 12,
    textAlign: 'center',
  },
  copyLastButton: {
    marginTop: 4,
  },
  copyLastText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#232323',
    marginTop: 12,
    marginBottom: 12,
  },
  suggestionsRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  suggestionPill: {
    backgroundColor: 'rgba(29,158,117,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(29,158,117,0.25)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  suggestionText: {
    color: '#5DCAA5',
    fontSize: 12,
  },
  notesInput: {
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 140,
    paddingVertical: 4,
    lineHeight: 22,
  },
  emptyState: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  priorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  priorDate: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  starIcon: {
    fontSize: 16,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  starIconActive: {
    color: '#F5C518',
  },
  priorNotes: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  sessionDivider: {
    height: 1,
    backgroundColor: '#232323',
    marginVertical: 4,
  },
  memoryLink: {
    marginTop: 4,
  },
  memoryLinkText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
});

export default GymScreen;
