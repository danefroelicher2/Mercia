import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoutineTask, TimeOfDay } from '../types/routine';
import { SECTION_COLORS, taskTimeOfDay, withAlpha } from '../utils/timeOfDay';
import Checkbox from './Checkbox';

// "2 left from this morning": what's still open from earlier parts of today.
// Tap an item to check it off, or clear the lot with Skip / All done. Once
// nothing is left the card flashes a green check and folds away, and the
// Today card below slides up into its place.

interface Props {
  // Every not-skipped task from the sections before the current one.
  tasks: RoutineTask[];
  // Changes when the card should start fresh (day switch, new section).
  resetKey: string;
  onTick: (id: string) => void;
  onSkip: (ids: string[]) => void;
  onCompleteAll: (ids: string[]) => void;
}

const DONE_GREEN = '#4ADE80';
const CELEBRATE_MS = 1400;
// Longer lists show this many rows until "Show all" is tapped.
const PREVIEW_ROWS = 4;

const SOURCE_LABEL: Record<TimeOfDay, string> = {
  morning: 'this morning',
  afternoon: 'this afternoon',
  night: 'tonight',
};

const EarlierCard: React.FC<Props> = ({ tasks, resetKey, onTick, onSkip, onCompleteAll }) => {
  const pendingIds = tasks.filter(t => !t.completed).map(t => t.id);

  // Rows stay on the card once shown, so a checked item stays visible
  // (crossed off) until the whole card is cleared.
  const [shownIds, setShownIds] = useState<string[]>(pendingIds);
  const [celebrating, setCelebrating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const check = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSource = useRef<TimeOfDay | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setCelebrating(false);
    setShowAll(false);
    setShownIds(pendingIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Something reopened (unchecked in the Today card) → show it again.
  useEffect(() => {
    if (celebrating) return;
    const missing = pendingIds.filter(id => !shownIds.includes(id));
    if (missing.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShownIds(prev => [...prev, ...missing]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds.join(',')]);

  const rows = shownIds
    .map(id => tasks.find(t => t.id === id))
    .filter((t): t is RoutineTask => !!t);
  const open = rows.filter(t => !t.completed);

  const celebrate = () => {
    setCelebrating(true);
    check.setValue(0);
    Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      LayoutAnimation.configureNext({
        duration: 320,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
      setCelebrating(false);
      setShownIds([]);
    }, CELEBRATE_MS);
  };

  // Everything on the card is done (or skipped away) → celebrate once.
  useEffect(() => {
    if (!celebrating && shownIds.length > 0 && open.length === 0) celebrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.length, shownIds.length]);

  // Rendered as done the moment the last item goes, before the effect
  // above starts the animation, so the card never blinks out early.
  const showDone = celebrating || (shownIds.length > 0 && open.length === 0);
  if (!showDone && rows.length === 0) return null;

  // Remembered so the done state still names the section after skipped
  // rows have left the list.
  const sources = Array.from(new Set(rows.map(taskTimeOfDay)));
  if (rows.length > 0) lastSource.current = sources.length === 1 ? sources[0] : null;
  const source = lastSource.current;
  const tint = SECTION_COLORS[source ?? 'morning'];
  const title = source
    ? `${open.length} left from ${SOURCE_LABEL[source]}`
    : `${open.length} left from earlier today`;

  if (showDone) {
    const scale = check.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
    return (
      <View style={[styles.card, styles.doneCard]}>
        <Animated.View style={[styles.doneBadge, { opacity: check, transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={26} color="#0D0D0D" />
        </Animated.View>
        <Animated.Text style={[styles.doneText, { opacity: check }]}>
          {source ? `${source === 'morning' ? 'Morning' : source === 'afternoon' ? 'Afternoon' : 'Night'} cleared` : 'All caught up'}
        </Animated.Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: withAlpha(tint, 0.07), borderColor: withAlpha(tint, 0.22) }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: withAlpha(tint, 0.95) }]}>{title}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => onSkip(open.map(t => t.id))}
            hitSlop={6}
            style={({ pressed }) => [styles.button, styles.skipButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Pressable
            onPress={() => onCompleteAll(open.map(t => t.id))}
            hitSlop={6}
            style={({ pressed }) => [styles.button, { backgroundColor: DONE_GREEN }, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-done" size={14} color="#0D0D0D" />
            <Text style={styles.doneAllText}>All done</Text>
          </Pressable>
        </View>
      </View>

      {(showAll ? rows : rows.slice(0, PREVIEW_ROWS)).map(task => {
        const color = SECTION_COLORS[taskTimeOfDay(task)];
        const showCount = task.target_count > 1 && task.current_count > 0;
        return (
          <Pressable
            key={task.id}
            onPress={() => onTick(task.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: task.completed }}
          >
            <Checkbox done={task.completed} color={color} />
            <Text style={[styles.rowText, task.completed && styles.rowTextDone]} numberOfLines={2}>
              {task.text}
            </Text>
            {showCount && (
              <View style={[styles.countBadge, { borderColor: color }]}>
                <Text style={[styles.countText, { color }]}>{task.current_count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}

      {!showAll && rows.length > PREVIEW_ROWS && (
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowAll(true);
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={[styles.moreText, { color: tint }]}>Show {rows.length - PREVIEW_ROWS} more</Text>
          <Ionicons name="chevron-down" size={14} color={tint} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  skipButton: {
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B8B8B8',
  },
  doneAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  pressed: {
    opacity: 0.6,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  moreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
  },
  rowTextDone: {
    color: '#6A6A6A',
    textDecorationLine: 'line-through',
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
  doneCard: {
    backgroundColor: withAlpha(DONE_GREEN, 0.08),
    borderColor: withAlpha(DONE_GREEN, 0.35),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  doneBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DONE_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E8FBEF',
  },
});

export default EarlierCard;
