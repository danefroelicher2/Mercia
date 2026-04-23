import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import QuoteCard from '../components/QuoteCard';
import { QUOTES } from '../data/quotes';
import { DayOfWeek } from '../types/routine';
import api from '../services/api';

interface GymWorkoutLog {
  id: string;
  user_id: string;
  day_of_week: string;
  workout_group: string;
  notes: string;
  logged_date: string;
  week_number: number;
  year: number;
  created_at: string;
  updated_at: string;
}

interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
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

const GymScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const handleViewGymMemory = () => {
    // Two synchronous navigate calls so React batches them into a single render,
    // producing [Profile, GymMemory] in one frame with no intermediate flash.
    navigation.navigate('Profile');
    navigation.navigate('Profile', { screen: 'GymMemory' });
  };
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [workoutGroup, setWorkoutGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [hasKeystroke, setHasKeystroke] = useState(false);
  const [priorSession, setPriorSession] = useState<GymMemoryEntry | null>(null);
  const [priorSessionEmpty, setPriorSessionEmpty] = useState(false);
  const [weekLog, setWeekLog] = useState<GymWorkoutLog[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = new Date().getDay();
    const dayIndex = today === 0 ? 6 : today - 1;
    setSelectedDay(DAYS[dayIndex]);
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
      if (entry) {
        setWorkoutGroup(entry.workout_group);
        setNotes(entry.notes);
        setHasKeystroke(false);
        if (entry.workout_group) {
          loadPriorSession(entry.workout_group);
        } else {
          setPriorSession(null);
          setPriorSessionEmpty(false);
        }
      } else {
        setWorkoutGroup('');
        setNotes('');
        setHasKeystroke(false);
        setPriorSession(null);
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
      if (entries.length > 0) {
        setPriorSession(entries[0]);
        setPriorSessionEmpty(false);
      } else {
        setPriorSession(null);
        setPriorSessionEmpty(true);
      }
    } catch {
      setPriorSession(null);
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

  const handleGroupChange = (text: string) => {
    setWorkoutGroup(text);
    setShowSuggestions(text.length >= 1);
    triggerSave(text, notes);
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
              style={[styles.weekDay, isSelected && styles.weekDaySelected]}
            >
              <Text style={[styles.weekDayLabel, isSelected && styles.weekDayLabelSelected]}>
                {DAY_LABELS[index].toUpperCase()}
              </Text>
              <Text style={[styles.weekDayDate, isSelected && styles.weekDayDateSelected]}>
                {weekDates[index]}
              </Text>
              {hasWorkout && !isSelected && <View style={styles.dot} />}
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
          <TextInput
            style={styles.groupInput}
            value={workoutGroup}
            onChangeText={handleGroupChange}
            placeholder="Workout name..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            textAlign="center"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsRow}>
              {filteredSuggestions.map(s => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestionPill}
                  onPress={() => handleSuggestionTap(s)}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.cardDivider} />
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={handleNotesChange}
            placeholder="Write your workout..."
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Prior Session Card */}
        {workoutGroup.trim().length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Prior Session</Text>
            {priorSessionEmpty ? (
              <Text style={styles.emptyState}>No previous {workoutGroup} sessions yet.</Text>
            ) : priorSession ? (
              <>
                <Text style={styles.priorDate}>{formatDate(priorSession.session_date)}</Text>
                <Text style={styles.priorNotes}>{priorSession.notes}</Text>
              </>
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
  groupInput: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    paddingVertical: 8,
    textAlign: 'center',
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
  priorDate: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    marginBottom: 6,
  },
  priorNotes: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
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
