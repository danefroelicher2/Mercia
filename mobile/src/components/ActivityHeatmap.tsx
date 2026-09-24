import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

// A month of activity: one square per day, brighter the more you did. Tap a
// day to see its count; swipe or use the arrows to change month.

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
}

interface Props {
  year: number;
  month: number; // 1–12
  days: HeatmapDay[] | null; // null while the first load is in flight
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GAP = 6;
// Five steps: none, then 1, 2–3, 4–5, 6+ actions.
const LEVELS = ['#1C1C1C', 'rgba(93,202,165,0.22)', 'rgba(93,202,165,0.45)', 'rgba(93,202,165,0.72)', '#5DCAA5'];
const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);
const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const ActivityHeatmap: React.FC<Props> = ({ year, month, days, canGoPrevious, canGoNext, onPrevious, onNext }) => {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  // Changing month clears the selection and eases the new month in.
  useEffect(() => {
    setSelected(null);
    fade.setValue(0.35);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [year, month, fade]);

  // Sideways swipe changes month. It activates a little before the side
  // drawer's swipe, so swiping on the calendar never opens the drawer.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-8, 8])
        .failOffsetY([-10, 10])
        .onEnd(e => {
          if (e.translationX > 40 && canGoPrevious) onPrevious();
          else if (e.translationX < -40 && canGoNext) onNext();
        }),
    [canGoPrevious, canGoNext, onPrevious, onNext],
  );

  const counts = useMemo(() => new Map((days ?? []).map(d => [d.date, d.count])), [days]);
  const today = localToday();

  // Week rows (Sunday first), padded with blanks so every row has 7 slots.
  const weeks = useMemo(() => {
    const first = new Date(year, month - 1, 1).getDay();
    const total = new Date(year, month, 0).getDate();
    const slots: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
    while (slots.length % 7) slots.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) rows.push(slots.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const cell = width > 0 ? Math.floor((width - GAP * 6) / 7) : 0;
  const activeDays = (days ?? []).filter(d => d.count > 0).length;
  const actions = (days ?? []).reduce((s, d) => s + d.count, 0);

  let footer: string;
  if (selected) {
    const d = new Date(`${selected}T12:00:00`);
    const n = counts.get(selected) ?? 0;
    footer = `${WEEKDAY_NAMES[d.getDay()]}, ${MONTHS[month - 1].slice(0, 3)} ${d.getDate()} · ${n ? plural(n, 'action') : 'no actions'}`;
  } else {
    footer = days ? `${plural(activeDays, 'active day')} · ${plural(actions, 'action')}` : ' ';
  }

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.month}>{MONTHS[month - 1]}</Text>
            <Text style={styles.year}>{year}</Text>
          </View>
          <View style={styles.arrows}>
            <Arrow icon="chevron-back" disabled={!canGoPrevious} onPress={onPrevious} label="Previous month" />
            <Arrow icon="chevron-forward" disabled={!canGoNext} onPress={onNext} label="Next month" />
          </View>
        </View>

        <View style={[styles.row, { gap: GAP }]}>
          {WEEKDAY_LETTERS.map((l, i) => (
            <Text key={i} style={[styles.weekday, { width: cell || undefined, flex: cell ? undefined : 1 }]}>
              {l}
            </Text>
          ))}
        </View>

        <Animated.View style={{ gap: GAP, opacity: fade }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
          {cell > 0 &&
            weeks.map((week, wi) => (
              <View key={wi} style={[styles.row, { gap: GAP }]}>
                {week.map((day, di) => {
                  if (day === null) return <View key={di} style={{ width: cell, height: cell }} />;
                  const date = `${year}-${pad(month)}-${pad(day)}`;
                  const future = date > today;
                  const n = counts.get(date) ?? 0;
                  const lv = level(n);
                  const isToday = date === today;
                  const isSelected = date === selected;
                  return (
                    <Pressable
                      key={di}
                      disabled={future}
                      onPress={() => setSelected(isSelected ? null : date)}
                      accessibilityLabel={`${MONTHS[month - 1]} ${day}, ${n ? plural(n, 'action') : 'no actions'}`}
                      style={[
                        styles.cell,
                        {
                          width: cell,
                          height: cell,
                          backgroundColor: future ? 'transparent' : LEVELS[lv],
                        },
                        future && styles.future,
                        isToday && styles.today,
                        isSelected && styles.selected,
                      ]}
                    >
                      <Text style={[styles.dayNum, lv >= 3 && styles.dayNumOnBright, future && styles.dayNumFuture]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
        </Animated.View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, selected && styles.footerTextSelected]} numberOfLines={1}>
            {footer}
          </Text>
          <View style={styles.legend}>
            <Text style={styles.legendText}>Less</Text>
            {LEVELS.map((c, i) => (
              <View key={i} style={[styles.legendSwatch, { backgroundColor: c }]} />
            ))}
            <Text style={styles.legendText}>More</Text>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};

const Arrow = ({
  icon,
  disabled,
  onPress,
  label,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  disabled: boolean;
  onPress: () => void;
  label: string;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.arrow, disabled && { opacity: 0.25 }, pressed && { opacity: 0.6 }]}
  >
    <Ionicons name={icon} size={16} color="#E8E8E8" />
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  month: {
    fontFamily: 'Palatino',
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 28,
    color: '#F2F2F2',
  },
  year: { fontSize: 13, color: '#777', fontVariant: ['tabular-nums'] },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  weekday: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#5E5E5E',
    letterSpacing: 0.5,
  },
  cell: { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  future: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#262626' },
  today: { borderWidth: 1.5, borderColor: '#E8E8E8' },
  selected: { borderWidth: 2, borderColor: '#FFFFFF' },
  dayNum: { fontSize: 12, color: '#CFCFCF', fontVariant: ['tabular-nums'] },
  dayNumOnBright: { color: '#0D0D0D', fontWeight: '600' },
  dayNumFuture: { color: '#3E3E3E' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 12,
  },
  footerText: { flex: 1, fontSize: 12, color: '#8A8A8A' },
  footerTextSelected: { color: '#E8E8E8' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontSize: 10, color: '#666', marginHorizontal: 3 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
});

export default ActivityHeatmap;
