import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { RoutineGoal } from '../types/routine';
import { withAlpha } from '../utils/timeOfDay';
import Checkbox from './Checkbox';

// One goal card (This week / This month / This year). Same interaction model
// as the Today card: tap checks off (or selects in multi-select), hold opens
// the parent's menu, typing on the last line adds a goal, and Edit from the
// hold menu edits the goal in place.

type GoalType = 'weekly' | 'monthly' | 'yearly';

interface Props {
  type: GoalType;
  title: string;
  goals: RoutineGoal[];
  accent: string;
  // Left-edge strength: weekly strongest, yearly faintest.
  edgeAlpha: number;
  countdown?: { text: string; urgent: boolean };
  yearProgress?: { day: number; total: number };
  // Goal currently being edited in place (set by the hold menu's Edit).
  editingId: string | null;
  selectedIds: Set<string>;
  onPress: (goal: RoutineGoal) => void;
  onHold: (goal: RoutineGoal) => void;
  onCreate: (type: GoalType, text: string) => void;
  onEditDone: (goal: RoutineGoal, text: string) => void;
}

const PLACEHOLDERS: Record<GoalType, string> = {
  weekly: 'Add a goal for this week…',
  monthly: 'Add a goal for this month…',
  yearly: 'Add a goal for this year…',
};

const GoalCard: React.FC<Props> = ({
  type,
  title,
  goals,
  accent,
  edgeAlpha,
  countdown,
  yearProgress,
  editingId,
  selectedIds,
  onPress,
  onHold,
  onCreate,
  onEditDone,
}) => {
  const [draft, setDraft] = useState('');
  const [editText, setEditText] = useState('');
  const editCommitted = useRef(false);

  // Seed the inline editor when a goal enters edit mode.
  useEffect(() => {
    const goal = goals.find(g => g.id === editingId);
    if (goal) {
      setEditText(goal.text);
      editCommitted.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const commitDraft = () => {
    const text = draft.trim();
    if (text) onCreate(type, text);
    setDraft('');
  };

  // Return on an empty add line closes the keyboard, like the Today card.
  const submitDraft = () => {
    if (!draft.trim()) {
      Keyboard.dismiss();
      return;
    }
    commitDraft();
  };

  const commitEdit = (goal: RoutineGoal) => {
    // Return and the blur that follows both land here; save once.
    if (editCommitted.current) return;
    editCommitted.current = true;
    onEditDone(goal, editText);
  };

  return (
    <View style={[styles.card, { borderLeftColor: withAlpha(accent, edgeAlpha) }]}>
      {/* Soft glow in the section color, like the Today card */}
      <View pointerEvents="none" style={styles.glow}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={`goal-glow-${type}`} cx="0%" cy="0%" rx="80%" ry="100%">
              <Stop offset="0" stopColor={accent} stopOpacity={0.12} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#goal-glow-${type})`} />
        </Svg>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {countdown?.text ? (
          <Text style={[styles.countdown, { color: countdown.urgent ? '#FF6B6B' : accent }]}>
            {countdown.text}
          </Text>
        ) : null}
      </View>

      {yearProgress && (
        <View style={styles.yearProgress}>
          <Text style={[styles.yearProgressText, { color: accent }]}>
            Day {yearProgress.day} / {yearProgress.total}
          </Text>
          <View style={styles.yearTrack}>
            <View
              style={[
                styles.yearFill,
                { width: `${(yearProgress.day / yearProgress.total) * 100}%`, backgroundColor: accent },
              ]}
            />
          </View>
        </View>
      )}

      {goals.map(goal => {
        const editing = goal.id === editingId;
        const selected = selectedIds.has(goal.id);
        const showCount = goal.target_count > 1 && goal.current_count > 0;
        return (
          <Pressable
            key={goal.id}
            onPress={editing ? undefined : () => onPress(goal)}
            onLongPress={editing ? undefined : () => onHold(goal)}
            delayLongPress={350}
            style={({ pressed }) => [
              styles.row,
              selected && [styles.rowSelected, { backgroundColor: withAlpha(accent, 0.13) }],
              pressed && !editing && styles.rowPressed,
            ]}
          >
            <View style={styles.checkboxBox}>
              <Checkbox done={goal.completed} color={accent} />
            </View>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editText}
                onChangeText={setEditText}
                onSubmitEditing={() => commitEdit(goal)}
                onBlur={() => commitEdit(goal)}
                submitBehavior="blurAndSubmit"
                autoFocus
                multiline
                scrollEnabled={false}
                maxLength={500}
                selectionColor={accent}
                keyboardAppearance="dark"
              />
            ) : (
              <Text style={[styles.text, goal.completed && styles.textDone]}>{goal.text}</Text>
            )}
            {showCount && (
              <View style={[styles.countBadge, { borderColor: accent }]}>
                <Text style={[styles.countText, { color: accent }]}>{goal.current_count}</Text>
              </View>
            )}
            {selected && <Ionicons name="checkmark-circle" size={18} color={accent} />}
          </Pressable>
        );
      })}

      {/* Type here to add a goal */}
      <View style={[styles.row, styles.addRow]}>
        <View style={styles.checkboxBox}>
          <Ionicons name="add" size={16} color="#4E4E4E" />
        </View>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={text => {
            // A pasted line break acts like Return.
            if (text.includes('\n')) {
              text.split('\n').map(t => t.trim()).filter(Boolean).forEach(t => onCreate(type, t));
              setDraft('');
            } else {
              setDraft(text);
            }
          }}
          onSubmitEditing={submitDraft}
          onBlur={commitDraft}
          submitBehavior="submit"
          placeholder={PLACEHOLDERS[type]}
          placeholderTextColor="#4E4E4E"
          multiline
          scrollEnabled={false}
          maxLength={500}
          selectionColor={accent}
          keyboardAppearance="dark"
          autoCapitalize="sentences"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
    borderLeftWidth: 3,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  countdown: {
    fontSize: 11,
    fontWeight: '500',
  },
  yearProgress: {
    marginTop: 2,
    marginBottom: 8,
  },
  yearProgressText: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
  },
  yearTrack: {
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  yearFill: {
    height: '100%',
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  rowSelected: {
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderBottomColor: 'transparent',
  },
  rowPressed: {
    opacity: 0.6,
  },
  addRow: {
    borderBottomWidth: 0,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
  },
  textDone: {
    color: '#6A6A6A',
    textDecorationLine: 'line-through',
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    minHeight: 20,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default GoalCard;
