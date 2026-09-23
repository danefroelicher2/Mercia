import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  LayoutAnimation,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import ActionMenu, { ActionMenuItem } from './ActionMenu';
import { RoutineTask, TimeOfDay } from '../types/routine';
import {
  SECTION_COLORS,
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_ORDER,
  formatMinutes,
  formatTime,
  formatTimeLabel,
  getCurrentTimeOfDay,
  parseCountSuffix,
  sectionRange,
  taskTimeOfDay,
  timeToMinutes,
  withAlpha,
} from '../utils/timeOfDay';
import TimeSheet from './TimeSheet';
import Checkbox from './Checkbox';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';


// Notepad-style Today card: three swipeable pages (Morning / Afternoon / Night).
// Typing a line and pressing return — or tapping away — turns it into a
// checkable task. Tasks stay weekly-recurring per day, exactly as before;
// only the way they're entered and grouped changed.

export interface CreateTaskInput {
  text: string;
  targetCount: number;
  timeOfDay: TimeOfDay;
  // Insert directly after this task; null appends to the end of the section.
  afterId: string | null;
}

export interface TaskChanges {
  text?: string;
  timeOfDay?: TimeOfDay;
  targetCount?: number;
  // "HH:MM"; null moves the item back to Anytime
  scheduledTime?: string | null;
}

interface Props {
  tasks: RoutineTask[];
  isToday: boolean;
  // Changes whenever the pager should jump back to its default page
  // (tab focus, day switch).
  resetToken: string;
  onToggle: (id: string) => void;
  // Returns the new task's client id synchronously so the next line can
  // be anchored after it before the server responds.
  onCreate: (input: CreateTaskInput) => string;
  onUpdate: (id: string, changes: TaskChanges) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onCopyFromDay?: () => void;
  // Reports the section being shown so the rest of the screen can match it.
  onSectionChange?: (section: TimeOfDay) => void;
  // Multi-select (deletion only): tap toggles selection instead of checking
  // off; holding a selected item while more than one is selected asks the
  // parent to offer "Delete N items".
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onRequestBulkDelete?: () => void;
  // Off: a header names the section instead of the Morning/Afternoon/Night
  // tabs (the day bar above does the switching).
  showTabs?: boolean;
  // Switch to this section; a new token repeats the request.
  requestedSection?: { section: TimeOfDay; token: number } | null;
}

// Lets another card (the "left from this morning" card) open the same hold
// menu for one of these tasks. onEdit replaces the in-card Edit so the item
// can be edited where it was held.
export interface TodayTimeBlocksHandle {
  openItemMenu: (taskId: string, onEdit?: () => void) => void;
}

type ActiveLine =
  | { kind: 'item'; id: string }
  | { kind: 'draft'; section: TimeOfDay; afterId: string }
  | { kind: 'trail'; section: TimeOfDay };

const SECTION_ICONS: Record<TimeOfDay, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  afternoon: 'partly-sunny-outline',
  night: 'moon-outline',
};

const PLACEHOLDERS: Record<TimeOfDay, string> = {
  morning: 'Add to your morning…',
  afternoon: 'Add to your afternoon…',
  night: 'Add to your night…',
};


const THEME: Record<TimeOfDay, { accent: string; tint: string; border: string }> = (() => {
  const theme = {} as Record<TimeOfDay, { accent: string; tint: string; border: string }>;
  for (const section of TIME_OF_DAY_ORDER) {
    const accent = SECTION_COLORS[section];
    theme[section] = { accent, tint: withAlpha(accent, 0.14), border: withAlpha(accent, 0.4) };
  }
  return theme;
})();


const PAGE_BLEED = 8;

function lineKey(line: ActiveLine | null): string {
  if (!line) return '';
  if (line.kind === 'item') return `item:${line.id}`;
  if (line.kind === 'draft') return `draft:${line.section}`;
  return `trail:${line.section}`;
}

const TodayTimeBlocks = forwardRef<TodayTimeBlocksHandle, Props>(({
  tasks,
  isToday,
  resetToken,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onCopyFromDay,
  onSectionChange,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onRequestBulkDelete,
  showTabs = true,
  requestedSection = null,
}, ref) => {
  const [width, setWidth] = useState(0);
  const [tabsWidth, setTabsWidth] = useState(0);
  // pageIndex follows the swipe live (tab highlight); heightIndex only
  // updates once a page settles, so the card doesn't resize mid-swipe.
  const { boundaries } = useRoutinePreferences();
  const [pageIndex, setPageIndex] = useState(() =>
    isToday ? TIME_OF_DAY_ORDER.indexOf(getCurrentTimeOfDay(new Date(), boundaries)) : 0,
  );
  const [heightIndex, setHeightIndex] = useState(pageIndex);
  const [heights, setHeights] = useState<number[]>([0, 0, 0]);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<any>(null);

  // Content is kept after closing so the menu doesn't empty mid-fade.
  const [menu, setMenu] = useState<{ title: string; items: ActionMenuItem[]; accent?: string }>({ title: '', items: [] });
  const [menuVisible, setMenuVisible] = useState(false);

  const [active, setActiveState] = useState<ActiveLine | null>(null);
  const [activeText, setActiveTextState] = useState('');
  // Refs mirror state so handlers fired in the same tick (blur of the old
  // input, focus of the new one) see the latest values.
  const activeRef = useRef<ActiveLine | null>(null);
  const activeTextRef = useRef('');
  const trailRefs = useRef<Partial<Record<TimeOfDay, TextInput | null>>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  // Line whose input should take focus once it has mounted. autoFocus alone
  // loses the race when the previously focused input unmounts in the same
  // render (return on an item → new line below it).
  const pendingFocusKey = useRef<string | null>(null);

  const setActive = (line: ActiveLine | null, text = '') => {
    activeRef.current = line;
    activeTextRef.current = text;
    pendingFocusKey.current = line && line.kind !== 'trail' ? lineKey(line) : null;
    setActiveState(line);
    setActiveTextState(text);
  };

  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    pendingFocusKey.current = null;
    requestAnimationFrame(() => {
      // Skip if the user has since moved to a different line.
      if (lineKey(activeRef.current) !== key) return;
      const input = inputRefs.current[key];
      if (input && !input.isFocused()) input.focus();
    });
  });

  const setActiveText = (text: string) => {
    activeTextRef.current = text;
    setActiveTextState(text);
  };

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const bySection = useMemo(() => {
    const groups: Record<TimeOfDay, RoutineTask[]> = { morning: [], afternoon: [], night: [] };
    for (const task of tasks) groups[taskTimeOfDay(task)].push(task);
    return groups;
  }, [tasks]);

  // Within a section: timed items run down the timeline in clock order,
  // everything else stays in its own order under Anytime.
  const layout = useMemo(() => {
    const result = {} as Record<TimeOfDay, { timed: RoutineTask[]; anytime: RoutineTask[]; visual: RoutineTask[] }>;
    for (const section of TIME_OF_DAY_ORDER) {
      const items = bySection[section];
      const timed = items
        .filter(t => t.scheduled_time)
        .sort((a, b) => timeToMinutes(a.scheduled_time!) - timeToMinutes(b.scheduled_time!));
      const anytime = items.filter(t => !t.scheduled_time);
      result[section] = { timed, anytime, visual: [...timed, ...anytime] };
    }
    return result;
  }, [bySection]);

  const [timeTask, setTimeTask] = useState<RoutineTask | null>(null);

  const nowSection = getCurrentTimeOfDay(new Date(), boundaries);
  const defaultIndex = isToday ? TIME_OF_DAY_ORDER.indexOf(nowSection) : 0;
  // Starting offset is fixed per width: iOS re-applies contentOffset whenever
  // the prop changes, which would slide the pager on its own at noon / 6 PM.
  // Later jumps go through jumpToPage.
  const initialOffset = useMemo(
    () => ({ x: defaultIndex * width, y: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width],
  );

  useEffect(() => {
    onSectionChange?.(TIME_OF_DAY_ORDER[pageIndex]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex]);

  // Drop an active item whose task vanished (reload, delete).
  useEffect(() => {
    const line = activeRef.current;
    if (line?.kind === 'item' && !tasks.some(t => t.id === line.id)) setActive(null);
    if (line?.kind === 'draft' && !tasks.some(t => t.id === line.afterId)) setActive(null);
  }, [tasks]);

  // ============================================
  // PAGER
  // ============================================

  // While a tab tap is scrolling the pager, the section is already decided:
  // ignore the in-between offsets so the page color changes exactly once
  // (otherwise Morning → Night flashes Morning/Afternoon on the way).
  const scrollLockTarget = useRef<number | null>(null);
  const scrollLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseScrollLock = () => {
    scrollLockTarget.current = null;
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = null;
  };
  useEffect(() => releaseScrollLock, []);

  const jumpToPage = useCallback((index: number, animated: boolean) => {
    if (width === 0) return;
    if (animated) {
      scrollLockTarget.current = index;
      if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
      // Safety net in case the final scroll event never lands exactly.
      scrollLockTimer.current = setTimeout(releaseScrollLock, 700);
    }
    pagerRef.current?.scrollTo({ x: index * width, y: 0, animated });
    if (!animated) scrollX.setValue(index * width);
    setPageIndex(index);
    setHeightIndex(index);
  }, [width, scrollX]);

  // Jump to the default page on focus / day change (and once width is known),
  // and when the user moves the section boundaries in settings.
  useEffect(() => {
    jumpToPage(defaultIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken, width, boundaries.afternoonStart, boundaries.nightStart]);

  const handleTabPress = (index: number) => {
    commitActive();
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    jumpToPage(index, true);
  };

  useEffect(() => {
    if (!requestedSection) return;
    const index = TIME_OF_DAY_ORDER.indexOf(requestedSection.section);
    if (index !== pageIndex) handleTabPress(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSection?.token]);

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (width === 0) return;
    const x = e.nativeEvent.contentOffset.x;
    if (scrollLockTarget.current !== null) {
      if (Math.abs(x - scrollLockTarget.current * width) < 1) releaseScrollLock();
      return;
    }
    const index = Math.max(0, Math.min(2, Math.round(x / width)));
    if (index !== pageIndex) setPageIndex(index);
  };

  const handleMomentumEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (width === 0) return;
    releaseScrollLock();
    const index = Math.max(0, Math.min(2, Math.round(e.nativeEvent.contentOffset.x / width)));
    setPageIndex(index);
    if (index !== heightIndex) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHeightIndex(index);
    }
  };

  const handlePageLayout = (index: number, height: number) => {
    setHeights(prev => {
      if (Math.abs(prev[index] - height) < 0.5) return prev;
      const next = prev.slice();
      next[index] = height;
      return next;
    });
  };

  // ============================================
  // LINE EDITING
  // ============================================

  // Finalize whatever line is being edited. Idempotent: clears the active
  // line first, so a trailing blur from the same input is a no-op.
  const commitActive = () => {
    const line = activeRef.current;
    const text = activeTextRef.current;
    if (!line) return;
    setActive(null);

    if (line.kind === 'item') {
      commitItemEdit(line.id, text);
    } else if (text.trim()) {
      createLine(text, line.section, line.kind === 'draft' ? line.afterId : null);
    }
  };

  const commitItemEdit = (id: string, text: string) => {
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
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

  const createLine = (text: string, section: TimeOfDay, afterId: string | null): string | null => {
    const parsed = parseCountSuffix(text);
    if (!parsed.text) return null;
    return onCreate({
      text: parsed.text,
      targetCount: parsed.targetCount ?? 1,
      timeOfDay: section,
      afterId,
    });
  };

  const isActive = (line: ActiveLine) => lineKey(activeRef.current) === lineKey(line);

  const startEditingItem = (task: RoutineTask) => {
    if (isActive({ kind: 'item', id: task.id })) return;
    commitActive();
    setActive({ kind: 'item', id: task.id }, task.text);
  };

  const focusTrail = (section: TimeOfDay) => {
    if (!isActive({ kind: 'trail', section })) {
      commitActive();
      setActive({ kind: 'trail', section }, '');
    }
    trailRefs.current[section]?.focus();
  };

  const handleTrailFocus = (section: TimeOfDay) => {
    const line: ActiveLine = { kind: 'trail', section };
    if (isActive(line)) return;
    commitActive();
    setActive(line, '');
  };

  const handleBlur = (line: ActiveLine) => {
    if (isActive(line)) commitActive();
  };

  // Pasted multi-line text: first line stays in the input being edited,
  // each further line becomes its own task below it.
  const handleChangeText = (line: ActiveLine, text: string) => {
    if (!text.includes('\n')) {
      setActiveText(text);
      return;
    }
    const [first, ...rest] = text.split('\n');
    const extras = rest.map(l => l.trim()).filter(Boolean);

    if (line.kind === 'item') {
      commitItemEdit(line.id, first);
      let anchor = line.id;
      for (const extra of extras) anchor = createLine(extra, sectionOf(line.id), anchor) ?? anchor;
      setActive(null);
      Keyboard.dismiss();
      return;
    }

    let anchor: string | null = line.kind === 'draft' ? line.afterId : null;
    for (const piece of [first, ...extras]) {
      if (!piece.trim()) continue;
      anchor = createLine(piece, line.section, anchor) ?? anchor;
    }
    if (line.kind === 'draft' && anchor) {
      setActive({ kind: 'draft', section: line.section, afterId: anchor }, '');
    } else {
      setActive(line, '');
    }
  };

  const sectionOf = (id: string): TimeOfDay => {
    const task = tasksRef.current.find(t => t.id === id);
    return task ? taskTimeOfDay(task) : 'morning';
  };

  // Return key: commit this line and open a fresh one right below it.
  const handleSubmit = (line: ActiveLine) => {
    const text = activeTextRef.current;

    if (line.kind === 'trail') {
      if (!text.trim()) {
        Keyboard.dismiss();
        return;
      }
      createLine(text, line.section, null);
      setActive(line, '');
      return;
    }

    if (line.kind === 'draft') {
      if (!text.trim()) {
        setActive(null);
        Keyboard.dismiss();
        return;
      }
      const newId = createLine(text, line.section, line.afterId);
      setActive({ kind: 'draft', section: line.section, afterId: newId ?? line.afterId }, '');
      return;
    }

    // Existing item
    const section = sectionOf(line.id);
    const deleting = !text.trim();
    setActive(null);
    commitItemEdit(line.id, text);
    if (deleting) {
      Keyboard.dismiss();
      return;
    }
    // New lines are untimed, so a line opened from a timed item (or the last
    // Anytime item) goes to the bottom of Anytime.
    const { anytime } = layout[section];
    const isTimed = !!tasksRef.current.find(t => t.id === line.id)?.scheduled_time;
    if (isTimed || anytime[anytime.length - 1]?.id === line.id) {
      focusTrail(section);
    } else {
      setActive({ kind: 'draft', section, afterId: line.id }, '');
    }
  };

  // Backspace on an empty line removes it and jumps to the line above.
  const handleKeyPress = (line: ActiveLine, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key !== 'Backspace' || activeTextRef.current !== '') return;

    if (line.kind === 'draft') {
      const above = tasksRef.current.find(t => t.id === line.afterId);
      if (above) setActive({ kind: 'item', id: above.id }, above.text);
      else setActive(null);
      return;
    }

    if (line.kind === 'trail') return;

    const section = sectionOf(line.id);
    const items = layout[section].visual;
    const index = items.findIndex(t => t.id === line.id);
    const above = index > 0 ? items[index - 1] : null;
    setActive(null);
    onDelete(line.id);
    if (above) setActive({ kind: 'item', id: above.id }, above.text);
    else focusTrail(section);
  };

  // ============================================
  // LONG-PRESS MENU
  // ============================================

  // Only Anytime items reorder by hand; timed ones follow the clock.
  const moveWithinSection = (task: RoutineTask, direction: -1 | 1) => {
    const items = layout[taskTimeOfDay(task)].anytime;
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

  const openMenu = (task: RoutineTask, onEdit?: () => void) => {
    commitActive();
    Keyboard.dismiss();

    const anytime = layout[taskTimeOfDay(task)].anytime;
    const index = anytime.findIndex(t => t.id === task.id);

    const menuItems: ActionMenuItem[] = [
      { label: 'Edit', icon: 'create-outline', onPress: onEdit ?? (() => startEditingItem(task)) },
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

    setMenu({ title: task.text, items: menuItems, accent: THEME[taskTimeOfDay(task)].accent });
    setMenuVisible(true);
  };

  useImperativeHandle(ref, () => ({
    openItemMenu: (taskId, onEdit) => {
      const task = tasksRef.current.find(t => t.id === taskId);
      if (task) openMenu(task, onEdit);
    },
  }));

  // ============================================
  // RENDER
  // ============================================

  const isSelected = (id: string) => !!selectedIds?.has(id);

  const sectionTitle = (section: TimeOfDay) => {
    if (!isToday) return TIME_OF_DAY_LABELS[section];
    if (section === 'night') return 'Tonight';
    return section === nowSection ? `This ${section}` : TIME_OF_DAY_LABELS[section];
  };

  const sectionHours = (section: TimeOfDay) => {
    const short = (m: number) => formatMinutes(m % (24 * 60)).replace(':00', '');
    const [start, end] = sectionRange(section, boundaries);
    // Morning has no real start (it runs from midnight); show when it ends.
    if (section === 'morning') return `until ${short(end)}`;
    if (section === 'night') return `from ${short(start)}`;
    return `${short(start)} – ${short(end)}`;
  };

  const handleRowPress = (task: RoutineTask) => {
    if (selectionMode) onToggleSelect?.(task.id);
    else onToggle(task.id);
  };

  const handleRowHold = (task: RoutineTask) => {
    if (selectionMode && isSelected(task.id) && (selectedIds?.size ?? 0) > 1) {
      commitActive();
      Keyboard.dismiss();
      onRequestBulkDelete?.();
    } else {
      openMenu(task);
    }
  };

  const selectedStyle = (task: RoutineTask) =>
    isSelected(task.id) && [styles.rowSelected, { backgroundColor: withAlpha(THEME[taskTimeOfDay(task)].accent, 0.13) }];

  const selectedMark = (task: RoutineTask) =>
    isSelected(task.id) ? (
      <Ionicons name="checkmark-circle" size={18} color={THEME[taskTimeOfDay(task)].accent} style={styles.selectedMark} />
    ) : null;

  const renderCheckbox = (task: RoutineTask) => (
    <View style={styles.checkboxTouch}>
      <Checkbox done={task.completed} color={THEME[taskTimeOfDay(task)].accent} />
    </View>
  );

  const renderInput = (
    line: ActiveLine,
    extra?: Partial<React.ComponentProps<typeof TextInput>>,
    inputRef?: (r: TextInput | null) => void,
  ) => (
    <TextInput
      ref={r => {
        inputRefs.current[lineKey(line)] = r;
        inputRef?.(r);
      }}
      style={styles.lineInput}
      value={lineKey(active) === lineKey(line) ? activeText : ''}
      onChangeText={text => handleChangeText(line, text)}
      onSubmitEditing={() => handleSubmit(line)}
      onKeyPress={e => handleKeyPress(line, e)}
      onBlur={() => handleBlur(line)}
      submitBehavior="submit"
      multiline
      scrollEnabled={false}
      maxLength={500}
      placeholderTextColor="#4E4E4E"
      selectionColor={THEME[TIME_OF_DAY_ORDER[pageIndex]].accent}
      keyboardAppearance="dark"
      autoCapitalize="sentences"
      {...extra}
    />
  );

  const renderTaskRow = (task: RoutineTask) => {
    const editing = active?.kind === 'item' && active.id === task.id;
    const showCount = task.target_count > 1 && task.current_count > 0;
    return (
      <Pressable
        key={task.id}
        // Tap checks off (or counts down), same as before; editing lives
        // in the hold menu so a stray tap never opens the keyboard.
        onPress={editing ? undefined : () => handleRowPress(task)}
        onLongPress={editing ? undefined : () => handleRowHold(task)}
        delayLongPress={350}
        style={({ pressed }) => [styles.row, selectedStyle(task), pressed && !editing && styles.rowPressed]}
      >
        {renderCheckbox(task)}
        {editing ? (
          renderInput({ kind: 'item', id: task.id }, { autoFocus: true })
        ) : (
          <Text style={[styles.lineText, task.completed && styles.lineTextDone]}>{task.text}</Text>
        )}
        {showCount && (
          <View style={[styles.countBadge, { borderColor: THEME[taskTimeOfDay(task)].accent }]}>
            <Text style={[styles.countBadgeText, { color: THEME[taskTimeOfDay(task)].accent }]}>
              {task.current_count}
            </Text>
          </View>
        )}
        {selectedMark(task)}
      </Pressable>
    );
  };

  // A timed item on the timeline: time on the left, checkbox on the rail.
  const renderTimelineRow = (task: RoutineTask, isFirst: boolean, isLast: boolean) => {
    const editing = active?.kind === 'item' && active.id === task.id;
    const showCount = task.target_count > 1 && task.current_count > 0;
    const { time, period } = formatTime(task.scheduled_time!);
    return (
      <Pressable
        key={task.id}
        onPress={editing ? undefined : () => handleRowPress(task)}
        onLongPress={editing ? undefined : () => handleRowHold(task)}
        delayLongPress={350}
        style={({ pressed }) => [styles.timelineRow, selectedStyle(task), pressed && !editing && styles.rowPressed]}
      >
        <View style={styles.timeCol}>
          <Text style={[styles.timeText, task.completed && styles.timeTextDone]}>{time}</Text>
          <Text style={styles.periodText}>{period}</Text>
        </View>
        <View style={styles.rail}>
          {!isFirst && <View style={[styles.railLine, styles.railLineTop]} />}
          {!isLast && <View style={[styles.railLine, styles.railLineBottom]} />}
          <View style={styles.railNode}>
            <Checkbox done={task.completed} color={THEME[taskTimeOfDay(task)].accent} />
          </View>
        </View>
        {editing ? (
          renderInput({ kind: 'item', id: task.id }, { autoFocus: true })
        ) : (
          <Text style={[styles.lineText, task.completed && styles.lineTextDone]}>{task.text}</Text>
        )}
        {showCount && (
          <View style={[styles.countBadge, { borderColor: THEME[taskTimeOfDay(task)].accent }]}>
            <Text style={[styles.countBadgeText, { color: THEME[taskTimeOfDay(task)].accent }]}>
              {task.current_count}
            </Text>
          </View>
        )}
        {selectedMark(task)}
      </Pressable>
    );
  };

  const renderDraftRow = (section: TimeOfDay, afterId: string) => (
    <View key="draft" style={styles.row}>
      <View style={styles.checkboxTouch}>
        <View style={[styles.checkbox, styles.checkboxGhost]} />
      </View>
      {renderInput({ kind: 'draft', section, afterId }, { autoFocus: true })}
    </View>
  );

  const renderSection = (section: TimeOfDay, index: number) => {
    const items = bySection[section];
    const { timed, anytime } = layout[section];
    const rows: React.ReactNode[] = [];
    timed.forEach((task, i) => rows.push(renderTimelineRow(task, i === 0, i === timed.length - 1)));
    if (timed.length > 0) {
      rows.push(
        <View key="anytime-header" style={styles.anytimeHeader}>
          <Text style={styles.anytimeLabel}>ANYTIME</Text>
          <View style={styles.anytimeRule} />
        </View>,
      );
    }
    for (const task of anytime) {
      rows.push(renderTaskRow(task));
      if (active?.kind === 'draft' && active.section === section && active.afterId === task.id) {
        rows.push(renderDraftRow(section, task.id));
      }
    }

    return (
      <View
        key={section}
        style={[styles.page, { width }]}
        onLayout={e => handlePageLayout(index, e.nativeEvent.layout.height)}
      >
        {/* With the tabs off, each page carries its own header so the title
            slides with the page instead of swapping above it. */}
        {!showTabs && (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderTitle}>
              <Ionicons name={SECTION_ICONS[section]} size={18} color={THEME[section].accent} />
              <Text style={styles.sectionHeaderText}>{sectionTitle(section)}</Text>
            </View>
            <Text style={styles.sectionHeaderMeta}>{sectionHours(section)}</Text>
          </View>
        )}
        {rows}

        {/* Trailing line — always there to type into */}
        <Pressable style={[styles.row, styles.trailRow]} onPress={() => focusTrail(section)}>
          <View style={styles.checkboxTouch}>
            <Ionicons name="add" size={16} color="#4E4E4E" />
          </View>
          {renderInput(
            { kind: 'trail', section },
            {
              placeholder: PLACEHOLDERS[section],
              onFocus: () => handleTrailFocus(section),
            },
            r => { trailRefs.current[section] = r; },
          )}
        </Pressable>

        {items.length > 0 ? (
          <Text style={styles.hint}>Hold an item to set a time, edit, or delete</Text>
        ) : tasks.length === 0 && onCopyFromDay ? (
          <TouchableOpacity onPress={onCopyFromDay} style={styles.copyLink} hitSlop={8}>
            <Ionicons name="copy-outline" size={12} color={THEME[section].accent} />
            <Text style={[styles.copyLinkText, { color: THEME[section].accent }]}>Copy from another day</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  // Tabs row: 1px border + 3px padding each side.
  const indicatorWidth = tabsWidth > 0 ? (tabsWidth - 8) / 3 : 0;
  const indicatorTranslate = width > 0 && indicatorWidth > 0
    ? scrollX.interpolate({
        inputRange: [0, width * 2],
        outputRange: [0, indicatorWidth * 2],
        extrapolate: 'clamp',
      })
    : 0;

  // 1 while a section's page is centered, fading to 0 one page away —
  // drives the glow and indicator crossfades as you swipe.
  const pageFocus = (index: number) =>
    width > 0
      ? scrollX.interpolate({
          inputRange: [(index - 1) * width, index * width, (index + 1) * width],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        })
      : index === pageIndex ? 1 : 0;

  return (
    <View style={styles.card}>
      {/* Ambient glow in the section's color */}
      <View pointerEvents="none" style={styles.glowLayer}>
        {TIME_OF_DAY_ORDER.map((section, index) => (
          <Animated.View key={section} style={[StyleSheet.absoluteFill, { opacity: pageFocus(index) }]}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id={`glow-${section}`} cx="50%" cy="0%" rx="70%" ry="100%">
                  <Stop offset="0" stopColor={THEME[section].accent} stopOpacity={0.2} />
                  <Stop offset="1" stopColor={THEME[section].accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#glow-${section})`} />
            </Svg>
          </Animated.View>
        ))}
      </View>

      {showTabs ? (
      /* Segmented header */
      <View style={styles.tabs} onLayout={e => setTabsWidth(e.nativeEvent.layout.width)}>
        {indicatorWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              { width: indicatorWidth, transform: [{ translateX: indicatorTranslate }] },
            ]}
          >
            {TIME_OF_DAY_ORDER.map((section, index) => (
              <Animated.View
                key={section}
                style={[
                  styles.tabIndicatorFill,
                  {
                    backgroundColor: THEME[section].tint,
                    borderColor: THEME[section].border,
                    opacity: pageFocus(index),
                  },
                ]}
              />
            ))}
          </Animated.View>
        )}
        {TIME_OF_DAY_ORDER.map((section, index) => {
          const selected = index === pageIndex;
          const isNow = isToday && section === nowSection;
          const items = bySection[section];
          const done = items.filter(t => t.completed).length;
          const allDone = items.length > 0 && done === items.length;
          const accent = THEME[section].accent;
          return (
            <TouchableOpacity
              key={section}
              style={styles.tab}
              onPress={() => handleTabPress(index)}
              activeOpacity={0.7}
            >
              <View style={styles.tabContent}>
                <Ionicons
                  name={allDone ? 'checkmark-circle' : SECTION_ICONS[section]}
                  size={14}
                  color={selected || allDone ? accent : '#666'}
                />
                <Text style={[styles.tabLabel, selected && { color: '#F2F2F2' }]}>
                  {TIME_OF_DAY_LABELS[section]}
                </Text>
                {isNow && <View style={[styles.nowDot, { backgroundColor: accent }]} />}
              </View>
              {/* Section progress */}
              {items.length > 0 && (
                <View style={styles.tabProgressTrack}>
                  <View
                    style={[
                      styles.tabProgressFill,
                      { width: `${(done / items.length) * 100}%`, backgroundColor: accent },
                    ]}
                  />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      ) : null}

      {/* Pages bleed 8pt into the card padding (and pad their content back
          in) so a selected row's tint isn't clipped at the pager edge. */}
      <View style={styles.pagerBleed} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true, listener: handleScroll },
          )}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollBeginDrag={() => {
            // A finger on the pager takes over from any tab-tap scroll.
            releaseScrollLock();
            commitActive();
            Keyboard.dismiss();
          }}
          contentOffset={initialOffset}
          // Switching parts of the day is by tapping a ring (the pager still
          // slides when it's told to); side-swipes belong to the drawer.
          scrollEnabled={false}
          bounces={false}
          contentContainerStyle={styles.pagerContent}
          style={heights[heightIndex] > 0 ? { height: heights[heightIndex] } : undefined}
        >
          {TIME_OF_DAY_ORDER.map(renderSection)}
        </Animated.ScrollView>
      )}
      </View>

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
        section={timeTask ? taskTimeOfDay(timeTask) : 'morning'}
        value={timeTask?.scheduled_time ?? null}
        onSave={value => {
          if (timeTask && value !== (timeTask.scheduled_time ?? null)) {
            onUpdate(timeTask.id, { scheduledTime: value });
          }
        }}
        onClose={() => setTimeTask(null)}
      />
    </View>
  );
});

TodayTimeBlocks.displayName = 'TodayTimeBlocks';

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

  // Section header (when the tabs are off)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
    paddingBottom: 8,
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F2F2F2',
  },
  sectionHeaderMeta: {
    fontSize: 13,
    color: '#8A8A8A',
  },

  // Segmented header
  tabs: {
    flexDirection: 'row',
    marginBottom: 6,
    backgroundColor: '#101010',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  glowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
  },
  tabIndicatorFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 1,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabProgressTrack: {
    position: 'absolute',
    bottom: 4,
    left: '30%',
    right: '30%',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  tabProgressFill: {
    height: '100%',
    borderRadius: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 11,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#777',
  },
  tabLabelSelected: {
    color: '#E8E8E8',
  },
  nowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3A3A3A',
    marginLeft: 1,
  },


  // Pager
  pagerContent: {
    alignItems: 'flex-start',
  },
  page: {
    paddingBottom: 2,
    paddingHorizontal: PAGE_BLEED,
  },
  pagerBleed: {
    marginHorizontal: -PAGE_BLEED,
  },

  // Lines
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    gap: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  trailRow: {
    borderBottomWidth: 0,
  },
  checkboxTouch: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxGhost: {
    borderColor: '#3A3A3A',
    borderStyle: 'dashed',
    borderWidth: 1.5,
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
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0A0A0',
  },

  // Multi-select
  rowSelected: {
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderBottomColor: 'transparent',
  },
  selectedMark: {
    marginLeft: 2,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
  },
  timeCol: {
    width: 38,
    alignItems: 'flex-end',
    marginRight: 8,
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
  rail: {
    width: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginRight: 10,
  },
  railLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#2A2A2A',
  },
  // Rows have 9pt vertical padding; the node is centered on the first line.
  railLineTop: {
    top: -9,
    height: 19,
  },
  railLineBottom: {
    top: 10,
    bottom: -9,
  },
  railNode: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderRadius: 10,
  },
  anytimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
  },
  anytimeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#555',
  },
  anytimeRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A2A',
  },

  hint: {
    fontSize: 11,
    color: '#474747',
    textAlign: 'center',
    paddingTop: 6,
    paddingBottom: 4,
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
