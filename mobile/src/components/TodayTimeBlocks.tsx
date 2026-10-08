import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import ActionMenu, { ActionMenuItem } from './ActionMenu';
import { RoutineTask, TaskSection, TimeOfDay } from '../types/routine';
import {
  SECTION_COLORS,
  TASK_SECTION_COLORS,
  TASK_SECTION_LABELS,
  TASK_SECTION_ORDER,
  formatMinutes,
  formatTime,
  formatTimeLabel,
  getCurrentTimeOfDay,
  parseCountSuffix,
  sectionForMinutes,
  sectionRange,
  taskTimeOfDay,
  timeToMinutes,
  withAlpha,
} from '../utils/timeOfDay';
import TimeSheet from './TimeSheet';
import AddTaskSheet, { SECTION_ICONS } from './AddTaskSheet';
import Checkbox from './Checkbox';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';


// Today card: the whole day in one list, Morning → Afternoon → Night, each
// part in its own color, then Anytime. "Add to your day" opens a sheet to type
// the item and pick where it goes; holding an item edits it or gives it a time
// (which files it under that part of the day). Tasks stay weekly-recurring
// per day.

export interface CreateTaskInput {
  text: string;
  targetCount: number;
  timeOfDay: TaskSection;
  // Insert directly after this task; null appends to the end of the day.
  afterId: string | null;
}

export interface TaskChanges {
  text?: string;
  timeOfDay?: TaskSection;
  targetCount?: number;
  // "HH:MM"; null moves the item back to Anytime
  scheduledTime?: string | null;
}

interface Props {
  tasks: RoutineTask[];
  isToday: boolean;
  // Minute clock from the screen: the card's glow follows the part of the day.
  now: Date;
  onToggle: (id: string) => void;
  // Returns the new task's client id synchronously so the next line can
  // be anchored after it before the server responds.
  onCreate: (input: CreateTaskInput) => string;
  onUpdate: (id: string, changes: TaskChanges) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onCopyFromDay?: () => void;
  // Multi-select (deletion only): tap toggles selection instead of checking
  // off; holding a selected item while more than one is selected asks the
  // parent to offer "Delete N items".
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onRequestBulkDelete?: () => void;
}

const TodayTimeBlocks: React.FC<Props> = ({
  tasks,
  isToday,
  now,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onCopyFromDay,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onRequestBulkDelete,
}) => {
  const { boundaries } = useRoutinePreferences();
  const nowSection = getCurrentTimeOfDay(now, boundaries);

  // Content is kept after closing so the menu doesn't empty mid-fade.
  const [menu, setMenu] = useState<{ title: string; items: ActionMenuItem[]; accent?: string }>({ title: '', items: [] });
  const [menuVisible, setMenuVisible] = useState(false);
  const [timeTask, setTimeTask] = useState<RoutineTask | null>(null);

  const [adding, setAdding] = useState(false);

  // The item being edited in place (hold → Edit). Refs mirror state so the
  // blur that follows return sees the edit already finished.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editingRef = useRef<string | null>(null);
  const editTextRef = useRef('');

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Within a section: timed items in clock order, then everything else in
  // its own order. `visual` is the whole day top to bottom.
  const layout = useMemo(() => {
    const sections = {} as Record<TaskSection, { timed: RoutineTask[]; anytime: RoutineTask[] }>;
    for (const section of TASK_SECTION_ORDER) {
      const items = tasks.filter(t => taskTimeOfDay(t) === section);
      sections[section] = {
        timed: items
          .filter(t => t.scheduled_time)
          .sort((a, b) => timeToMinutes(a.scheduled_time!) - timeToMinutes(b.scheduled_time!)),
        anytime: items.filter(t => !t.scheduled_time),
      };
    }
    const visual = TASK_SECTION_ORDER.flatMap(s => [...sections[s].timed, ...sections[s].anytime]);
    return { sections, visual };
  }, [tasks]);

  // Drop the edit if its task vanished (reload, delete).
  useEffect(() => {
    if (editingRef.current && !tasks.some(t => t.id === editingRef.current)) {
      editingRef.current = null;
      setEditingId(null);
    }
  }, [tasks]);

  // ============================================
  // EDITING & ADDING
  // ============================================

  const startEdit = (task: RoutineTask) => {
    editingRef.current = task.id;
    editTextRef.current = task.text;
    setEditingId(task.id);
    setEditText(task.text);
  };

  const changeEditText = (text: string) => {
    // One line per item: pasted line breaks become spaces.
    const flat = text.replace(/\n+/g, ' ');
    editTextRef.current = flat;
    setEditText(flat);
  };

  // Same rules as typing a new item: empty deletes, "Run x3" sets a counter.
  // Idempotent, so the blur after return is a no-op.
  const finishEdit = () => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
    const text = editTextRef.current;
    if (!text.trim()) {
      onDelete(id);
      return;
    }
    const parsed = parseCountSuffix(text);
    const changes: TaskChanges = {};
    if (parsed.text !== task.text) changes.text = parsed.text;
    if (parsed.targetCount !== null && parsed.targetCount !== task.target_count) {
      changes.targetCount = parsed.targetCount;
    }
    if (changes.text !== undefined || changes.targetCount !== undefined) onUpdate(id, changes);
  };

  const addTask = (text: string, section: TaskSection) => {
    const parsed = parseCountSuffix(text);
    if (!parsed.text) return;
    onCreate({ text: parsed.text, targetCount: parsed.targetCount ?? 1, timeOfDay: section, afterId: null });
  };

  // ============================================
  // LONG-PRESS MENU
  // ============================================

  // Only untimed items reorder by hand; timed ones follow the clock.
  const moveWithinSection = (task: RoutineTask, direction: -1 | 1) => {
    const items = layout.sections[taskTimeOfDay(task)].anytime;
    const index = items.findIndex(t => t.id === task.id);
    const neighbor = items[index + direction];
    if (!neighbor) return;
    const ids = tasksRef.current.map(t => t.id);
    const a = ids.indexOf(task.id);
    const b = ids.indexOf(neighbor.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    onReorder(ids);
  };

  const promptCount = (task: RoutineTask) => {
    const save = (value?: string) => {
      const parsed = parseInt(value ?? '', 10);
      if (!Number.isFinite(parsed)) return;
      const count = Math.min(999, Math.max(1, parsed));
      if (count !== task.target_count) onUpdate(task.id, { targetCount: count });
    };
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'How many times?',
        'Each tap counts one down. Set 1 for a regular checkbox.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: save },
        ],
        'plain-text',
        String(task.target_count),
        'number-pad',
      );
    } else {
      Alert.alert('Set a count', 'Type the item again ending in "x3" to make it a 3-tap counter.');
    }
  };

  const openMenu = (task: RoutineTask) => {
    finishEdit();
    Keyboard.dismiss();

    const anytime = layout.sections[taskTimeOfDay(task)].anytime;
    const index = anytime.findIndex(t => t.id === task.id);

    const menuItems: ActionMenuItem[] = [
      { label: 'Edit', icon: 'create-outline', onPress: () => startEdit(task) },
      {
        label: task.scheduled_time ? 'Change time' : 'Add time',
        icon: 'time-outline',
        detail: task.scheduled_time ? formatTimeLabel(task.scheduled_time) : undefined,
        onPress: () => setTimeTask(task),
      },
    ];
    if (index > 0) {
      menuItems.push({ label: 'Move up', icon: 'arrow-up', onPress: () => moveWithinSection(task, -1) });
    }
    if (index >= 0 && index < anytime.length - 1) {
      menuItems.push({ label: 'Move down', icon: 'arrow-down', onPress: () => moveWithinSection(task, 1) });
    }
    menuItems.push({
      label: task.target_count > 1 ? `Change count (${task.target_count})` : 'Make it a counter',
      icon: 'repeat',
      onPress: () => promptCount(task),
    });
    menuItems.push({ label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => onDelete(task.id) });

    setMenu({ title: task.text, items: menuItems, accent: TASK_SECTION_COLORS[taskTimeOfDay(task)] });
    setMenuVisible(true);
  };

  // Giving an item a time files it under the part of the day that time falls
  // in (an Anytime item, or "7 PM" on a morning one), so the list stays in
  // clock order.
  const saveTime = (task: RoutineTask, value: string | null) => {
    if (value === (task.scheduled_time ?? null)) return;
    const changes: TaskChanges = { scheduledTime: value };
    if (value) {
      const section = sectionForMinutes(timeToMinutes(value), boundaries);
      if (section !== taskTimeOfDay(task)) changes.timeOfDay = section;
    }
    onUpdate(task.id, changes);
  };

  // ============================================
  // RENDER
  // ============================================

  const isSelected = (id: string) => !!selectedIds?.has(id);

  const handleRowPress = (task: RoutineTask) => {
    if (selectionMode) onToggleSelect?.(task.id);
    else onToggle(task.id);
  };

  const handleRowHold = (task: RoutineTask) => {
    if (selectionMode && isSelected(task.id) && (selectedIds?.size ?? 0) > 1) {
      finishEdit();
      Keyboard.dismiss();
      onRequestBulkDelete?.();
    } else {
      openMenu(task);
    }
  };

  // Time on the left (blank for untimed items, so every checkbox lines up),
  // then the checkbox in the part of the day's color.
  const renderRow = (task: RoutineTask) => {
    const accent = TASK_SECTION_COLORS[taskTimeOfDay(task)];
    const editing = editingId === task.id;
    const showCount = task.target_count > 1 && task.current_count > 0;
    const time = task.scheduled_time ? formatTime(task.scheduled_time) : null;
    return (
      <Pressable
        key={task.id}
        // Tap checks off (or counts down); editing lives in the hold menu so
        // a stray tap never opens the keyboard.
        onPress={editing ? undefined : () => handleRowPress(task)}
        onLongPress={editing ? undefined : () => handleRowHold(task)}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.row,
          isSelected(task.id) && [styles.rowSelected, { backgroundColor: withAlpha(accent, 0.13) }],
          pressed && !editing && styles.rowPressed,
        ]}
      >
        <View style={styles.timeCol}>
          {time && (
            <>
              <Text style={[styles.timeText, task.completed && styles.timeTextDone]}>{time.time}</Text>
              <Text style={styles.periodText}>{time.period}</Text>
            </>
          )}
        </View>
        <View style={styles.checkboxTouch}>
          <Checkbox done={task.completed} color={accent} />
        </View>
        {editing ? (
          <TextInput
            style={styles.lineInput}
            value={editText}
            onChangeText={changeEditText}
            onBlur={finishEdit}
            submitBehavior="blurAndSubmit"
            multiline
            scrollEnabled={false}
            maxLength={500}
            selectionColor={accent}
            keyboardAppearance="dark"
            autoCapitalize="sentences"
            autoFocus
          />
        ) : (
          <Text style={[styles.lineText, task.completed && styles.lineTextDone]}>{task.text}</Text>
        )}
        {showCount && (
          <View style={[styles.countBadge, { borderColor: accent }]}>
            <Text style={[styles.countBadgeText, { color: accent }]}>{task.current_count}</Text>
          </View>
        )}
        {isSelected(task.id) && (
          <Ionicons name="checkmark-circle" size={18} color={accent} style={styles.selectedMark} />
        )}
      </Pressable>
    );
  };

  const firstSection = TASK_SECTION_ORDER.find(sec => tasks.some(t => taskTimeOfDay(t) === sec));

  const renderSection = (section: TaskSection) => {
    const { timed, anytime } = layout.sections[section];
    if (timed.length + anytime.length === 0) return null;
    const accent = TASK_SECTION_COLORS[section];
    const allDone = [...timed, ...anytime].every(t => t.completed);


    return (
      <View key={section}>
        <View style={[styles.divider, section === firstSection && styles.dividerFirst]}>
          <Ionicons name={allDone ? 'checkmark-circle' : SECTION_ICONS[section]} size={14} color={accent} />
          <Text style={[styles.dividerLabel, { color: accent }]}>{TASK_SECTION_LABELS[section]}</Text>
          <View style={[styles.dividerRule, { backgroundColor: withAlpha(accent, 0.3) }]} />
          {/* Morning runs from midnight, so only the later parts show a start. */}
          {(section === 'afternoon' || section === 'night') && (
            <Text style={styles.dividerMeta}>
              {formatMinutes(sectionRange(section, boundaries)[0]).replace(':00', '')}
            </Text>
          )}
        </View>
        {timed.map(renderRow)}
        {anytime.map(renderRow)}
      </View>
    );
  };

  const nowAccent = SECTION_COLORS[nowSection];

  return (
    <View style={styles.card}>
      {/* Ambient glow in the color of the current part of the day */}
      <View pointerEvents="none" style={styles.glowLayer}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="0%" rx="70%" ry="100%">
              <Stop offset="0" stopColor={nowAccent} stopOpacity={0.16} />
              <Stop offset="1" stopColor={nowAccent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      </View>

      {TASK_SECTION_ORDER.map(renderSection)}

      <Pressable
        onPress={() => {
          finishEdit();
          setAdding(true);
        }}
        style={({ pressed }) => [styles.addButton, tasks.length > 0 && styles.addButtonSpaced, pressed && styles.rowPressed]}
      >
        <Ionicons name="add" size={16} color="#9A9A9A" />
        <Text style={styles.addButtonText}>Add to your day</Text>
      </Pressable>

      {tasks.length === 0 && onCopyFromDay && (
        <TouchableOpacity onPress={onCopyFromDay} style={styles.copyLink} hitSlop={8}>
          <Ionicons name="copy-outline" size={12} color={nowAccent} />
          <Text style={[styles.copyLinkText, { color: nowAccent }]}>Copy from another day</Text>
        </TouchableOpacity>
      )}

      <AddTaskSheet
        visible={adding}
        defaultSection={nowSection}
        onAdd={addTask}
        onClose={() => setAdding(false)}
      />

      <ActionMenu
        visible={menuVisible}
        title={menu.title}
        items={menu.items}
        accent={menu.accent}
        onClose={() => setMenuVisible(false)}
      />

      <TimeSheet
        visible={timeTask !== null}
        title={timeTask?.text ?? ''}
        // Anytime items read a bare "8" by the current part of the day.
        section={timeTask && taskTimeOfDay(timeTask) !== 'anytime' ? (taskTimeOfDay(timeTask) as TimeOfDay) : nowSection}
        value={timeTask?.scheduled_time ?? null}
        onSave={value => { if (timeTask) saveTime(timeTask, value); }}
        onClose={() => setTimeTask(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderRadius: 12,
    padding: 16,
    paddingBottom: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232323',
  },
  glowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },

  // Part-of-day divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 2,
  },
  dividerFirst: {
    marginTop: 0,
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  dividerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginLeft: 2,
  },
  dividerMeta: {
    fontSize: 12,
    color: '#777',
  },

  // Lines
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowSelected: {
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  selectedMark: {
    marginLeft: 2,
  },
  timeCol: {
    width: 38,
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: '#D8D8D8',
  },
  timeTextDone: {
    color: '#5A5A5A',
  },
  periodText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
  },
  checkboxTouch: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#E8E8E8',
  },
  lineTextDone: {
    color: '#6A6A6A',
    textDecorationLine: 'line-through',
  },
  lineInput: {
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
  countBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#333',
  },
  addButtonSpaced: {
    marginTop: 12,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9A9A9A',
  },
  copyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  copyLinkText: {
    fontSize: 12,
    color: '#A0A0A0',
    fontWeight: '500',
  },
});

export default TodayTimeBlocks;
