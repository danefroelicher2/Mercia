import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, LayoutAnimation, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoutineTask, TimeOfDay } from '../types/routine';
import { SECTION_COLORS, TIME_OF_DAY_ORDER, formatTimeLabel, taskTimeOfDay, timeToMinutes, withAlpha } from '../utils/timeOfDay';
import Checkbox from './Checkbox';

// "2 left from this morning": what's still open from earlier parts of today.
// Tap an item to check it off, or Skip whatever is still open. Once
// nothing is left the card flashes a green check and folds away, and the
// Today card below slides up into its place.

interface Props {
  // Every not-skipped task from the sections before the current one.
  tasks: RoutineTask[];
  // Changes when the card should start fresh (day switch, new section).
  resetKey: string;
  onTick: (id: string) => void;
  onSkip: (ids: string[]) => void;
  // Hold: open the Today card's item menu (time, move, counter, delete).
  // startEdit turns that row into a text field here, for the menu's Edit.
  onHold: (id: string, startEdit: () => void) => void;
  // Finished editing a row in place (empty text deletes it).
  onEditDone: (id: string, text: string) => void;
  // Multi-select (gear): tap selects instead of checking off, like the
  // Today card; holding a selected row with others selected offers the
  // bulk delete.
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onRequestBulkDelete?: () => void;
}

const DONE_GREEN = '#4ADE80';
const CELEBRATE_MS = 3000;
// Time to undo a tap on the last item before the card celebrates.
const UNDO_GRACE_MS = 600;
// How long a checked row stays (check visible, undo possible) before it
// slides out of the card.
const LEAVE_DELAY_MS = 550;
// Longer lists show this many rows until "Show all" is tapped.
const PREVIEW_ROWS = 4;

const SOURCE_LABEL: Record<TimeOfDay, string> = {
  morning: 'this morning',
  afternoon: 'this afternoon',
  night: 'tonight',
};

const EarlierCard: React.FC<Props> = ({
  tasks,
  resetKey,
  onTick,
  onSkip,
  onHold,
  onEditDone,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onRequestBulkDelete,
}) => {
  const taskIds = tasks.map(t => t.id);
  const pendingIds = tasks.filter(t => !t.completed).map(t => t.id);

  // Rows on the card. A checked row lingers a moment (so the check is seen
  // and a second tap can undo it), then slides out and the rows below move
  // up. The last open row stays for the done state instead.
  const [shownIds, setShownIds] = useState<string[]>(pendingIds);
  const [celebrating, setCelebrating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const check = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSource = useRef<TimeOfDay | null>(null);
  const leaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const snapshot = useRef<{ rows: RoutineTask[]; more: number; title: string }>({ rows: [], more: 0, title: '' });
  // Rows cleared with Skip. Only a skip or a check-off counts toward the
  // green check — a row that disappears for any other reason (reload,
  // delete, day switch) just leaves quietly.
  const skipped = useRef<Set<string>>(new Set());
  // What cleared the card: a row tap gets a moment to be undone; Skip
  // celebrates straight away.
  const lastAction = useRef<'tap' | 'skip'>('tap');

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    leaveTimers.current.forEach(clearTimeout);
    leaveTimers.current.clear();
    skipped.current = new Set();
    setCelebrating(false);
    setShowAll(false);
    setShownIds(pendingIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    leaveTimers.current.forEach(clearTimeout);
  }, []);

  // Checked rows leave after a beat; unchecking in time cancels it.
  useEffect(() => {
    const timers = leaveTimers.current;
    for (const id of shownIds) {
      const done = !!tasks.find(t => t.id === id)?.completed;
      if (done && !timers.has(id)) {
        timers.set(id, setTimeout(() => {
          timers.delete(id);
          setShownIds(prev => {
            const stillDone = !!tasksRef.current.find(t => t.id === id)?.completed;
            const othersOpen = prev.some(other =>
              other !== id && tasksRef.current.some(t => t.id === other && !t.completed) && !skipped.current.has(other));
            // The last row stays put and becomes the done state.
            if (!stillDone || !othersOpen || !prev.includes(id)) return prev;
            LayoutAnimation.configureNext({
              duration: 300,
              update: { type: LayoutAnimation.Types.easeInEaseOut },
              delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            });
            return prev.filter(other => other !== id);
          });
        }, LEAVE_DELAY_MS));
      } else if (!done && timers.has(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, shownIds]);

  // Keep the rows in step with the list: add anything open that isn't shown
  // (a new item, or one unchecked in the Today card) and drop rows whose
  // task is gone without being skipped.
  useEffect(() => {
    if (celebrating) return;
    setShownIds(prev => {
      const kept = prev.filter(id => taskIds.includes(id) || skipped.current.has(id));
      const missing = pendingIds.filter(id => !kept.includes(id));
      if (kept.length === prev.length && missing.length === 0) return prev;
      if (missing.length > 0 || kept.length !== prev.length) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      return [...kept, ...missing];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds.join(','), pendingIds.join(','), celebrating]);

  // Same order as the Today card: by section, timed items by the clock
  // first, then the rest in their own order.
  const rows = tasks
    .filter(t => shownIds.includes(t.id))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const sa = TIME_OF_DAY_ORDER.indexOf(taskTimeOfDay(a.t));
      const sb = TIME_OF_DAY_ORDER.indexOf(taskTimeOfDay(b.t));
      if (sa !== sb) return sa - sb;
      const ta = a.t.scheduled_time ? timeToMinutes(a.t.scheduled_time) : Infinity;
      const tb = b.t.scheduled_time ? timeToMinutes(b.t.scheduled_time) : Infinity;
      return ta !== tb ? ta - tb : a.i - b.i;
    })
    .map(({ t }) => t);

  // In-place editing (the hold menu's Edit).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editCommitted = useRef(false);
  const startEdit = (task: RoutineTask) => {
    editCommitted.current = false;
    setEditText(task.text);
    setEditingId(task.id);
  };
  const commitEdit = (id: string) => {
    // Return and the blur that follows both land here; save once.
    if (editCommitted.current) return;
    editCommitted.current = true;
    setEditingId(null);
    onEditDone(id, editText);
  };
  const open = rows.filter(t => !t.completed);
  const cleared =
    shownIds.length > 0 &&
    shownIds.every(id => skipped.current.has(id) || !!tasks.find(t => t.id === id)?.completed);

  const handleSkip = () => {
    const ids = open.map(t => t.id);
    ids.forEach(id => skipped.current.add(id));
    lastAction.current = 'skip';
    onSkip(ids);
  };

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
      skipped.current = new Set();
      check.setValue(0);
      setCelebrating(false);
      setShownIds([]);
    }, CELEBRATE_MS);
  };

  // Everything on the card is checked off or skipped → celebrate once. A
  // check-off waits a moment first, so a quick second tap on the last item
  // can still take it back; Skip celebrates straight away.
  useEffect(() => {
    if (celebrating || !cleared) return;
    if (lastAction.current !== 'tap') {
      celebrate();
      return;
    }
    const grace = setTimeout(celebrate, UNDO_GRACE_MS);
    return () => clearTimeout(grace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared]);

  // After a skip the rows are already gone from the list; show the done
  // state at once (over the last snapshot) so the card never blinks out.
  const showDone = celebrating || (cleared && rows.length === 0);
  if (!showDone && rows.length === 0) return null;

  // Remembered so the done state still names the section after skipped
  // rows have left the list.
  const sources = Array.from(new Set(rows.map(taskTimeOfDay)));
  if (rows.length > 0) lastSource.current = sources.length === 1 ? sources[0] : null;
  const source = lastSource.current;
  const tint = SECTION_COLORS[source ?? 'morning'];
  const title = open.length === 0
    ? source ? `${source === 'afternoon' ? 'Afternoon' : source === 'night' ? 'Night' : 'Morning'} done` : 'All done'
    : source
      ? `${open.length} left from ${SOURCE_LABEL[source]}`
      : `${open.length} left from earlier today`;

  // What the card looked like just before it was cleared. The done state is
  // drawn over this, at the same size, so nothing below moves under a
  // finger until the card folds away.
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW_ROWS);
  if (!showDone) snapshot.current = { rows: visibleRows, more: rows.length - visibleRows.length, title };
  const shown = showDone ? snapshot.current : { rows: visibleRows, more: rows.length - visibleRows.length, title };
  const sectionName = source === 'afternoon' ? 'Afternoon' : source === 'night' ? 'Night' : 'Morning';
  const scale = check.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={[styles.card, { backgroundColor: withAlpha(tint, 0.07), borderColor: withAlpha(tint, 0.22) }]}>
      <View pointerEvents={showDone ? 'none' : 'auto'}>
        <View style={styles.headRow}>
          <Text style={[styles.title, { color: withAlpha(tint, 0.95) }]}>{shown.title}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={handleSkip}
              hitSlop={6}
              style={({ pressed }) => [styles.button, styles.skipButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>
        </View>

        {shown.rows.map(task => {
          const color = SECTION_COLORS[taskTimeOfDay(task)];
          const live = tasks.find(t => t.id === task.id) ?? task;
          const showCount = live.target_count > 1 && live.current_count > 0;
          const editing = editingId === task.id;
          const selected = !!selectedIds?.has(task.id);
          return (
            <Pressable
              key={task.id}
              onPress={editing ? undefined : () => {
                if (selectionMode) {
                  onToggleSelect?.(task.id);
                  return;
                }
                lastAction.current = 'tap';
                onTick(task.id);
              }}
              onLongPress={editing ? undefined : () => {
                Keyboard.dismiss();
                if (selectionMode && selected && (selectedIds?.size ?? 0) > 1) onRequestBulkDelete?.();
                else onHold(task.id, () => startEdit(live));
              }}
              delayLongPress={350}
              style={({ pressed }) => [
                styles.row,
                selected && [styles.rowSelected, { backgroundColor: withAlpha(color, 0.13) }],
                pressed && !editing && styles.pressed,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: live.completed }}
              accessibilityHint="Hold for more options"
            >
              <Checkbox done={live.completed} color={color} />
              {editing ? (
                <TextInput
                  style={styles.rowInput}
                  value={editText}
                  onChangeText={setEditText}
                  onSubmitEditing={() => commitEdit(task.id)}
                  onBlur={() => commitEdit(task.id)}
                  submitBehavior="blurAndSubmit"
                  autoFocus
                  multiline
                  scrollEnabled={false}
                  maxLength={500}
                  selectionColor={color}
                  keyboardAppearance="dark"
                />
              ) : (
                <Text style={[styles.rowText, live.completed && styles.rowTextDone]} numberOfLines={2}>
                  {live.text}
                </Text>
              )}
              {!editing && live.scheduled_time && (
                <Text style={styles.timeText}>{formatTimeLabel(live.scheduled_time)}</Text>
              )}
              {selected && <Ionicons name="checkmark-circle" size={18} color={color} />}
              {showCount && !editing && (
                <View style={[styles.countBadge, { borderColor: color }]}>
                  <Text style={[styles.countText, { color }]}>{live.current_count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {(shown.more > 0 || (showAll && rows.length > PREVIEW_ROWS)) && (
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowAll(!showAll);
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.moreText, { color: tint }]}>
              {showAll ? 'Show less' : `Show ${shown.more} more`}
            </Text>
            <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={tint} />
          </Pressable>
        )}
      </View>

      {showDone && (
        <Animated.View style={[styles.doneOverlay, { opacity: check }]}>
          <Animated.View style={[styles.doneBadge, { transform: [{ scale }] }]}>
            <Ionicons name="checkmark" size={26} color="#0D0D0D" />
          </Animated.View>
          <Text style={styles.doneText}>{source ? `${sectionName} cleared` : 'All caught up'}</Text>
        </Animated.View>
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
    minHeight: 44,
    paddingVertical: 8,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
  },
  rowSelected: {
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  rowInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    minHeight: 20,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
    fontVariant: ['tabular-nums'],
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
  doneOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
    backgroundColor: '#0F1A13',
    borderWidth: 1,
    borderColor: withAlpha(DONE_GREEN, 0.35),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
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
