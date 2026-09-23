import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RoutineTask, TimeOfDay } from '../types/routine';
import {
  DayBoundaries,
  SECTION_COLORS,
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_ORDER,
  formatMinutes,
  sectionRange,
  taskTimeOfDay,
  withAlpha,
} from '../utils/timeOfDay';

// The day at a glance, above the Today card: which part of the day it is,
// how long is left of it, and how each part is going. Each part's label
// switches the Today card to it.

interface Props {
  tasks: RoutineTask[];
  isToday: boolean;
  // Weekday name for other days ("Friday").
  dayName: string;
  now: Date;
  boundaries: DayBoundaries;
  // Section the Today card is showing.
  shownSection: TimeOfDay;
  onSelectSection: (section: TimeOfDay) => void;
}

// Morning technically starts at midnight; the bar treats the six hours
// before the afternoon as "the morning" so the marker moves at a useful pace.
const MORNING_SPAN = 6 * 60;

function markerPosition(minutes: number, b: DayBoundaries): number {
  const index = minutes < b.afternoonStart ? 0 : minutes < b.nightStart ? 1 : 2;
  const section = TIME_OF_DAY_ORDER[index];
  let [start, end] = sectionRange(section, b);
  if (section === 'morning') start = Math.max(0, end - MORNING_SPAN);
  const within = Math.min(1, Math.max(0, (minutes - start) / (end - start)));
  return (index + within) / 3;
}

function formatLeft(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m left`;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

const NOW_TITLES: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Tonight',
};

const DayBar: React.FC<Props> = ({ tasks, isToday, dayName, now, boundaries, shownSection, onSelectSection }) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const nowSection: TimeOfDay =
    minutes < boundaries.afternoonStart ? 'morning' : minutes < boundaries.nightStart ? 'afternoon' : 'night';
  const nowColor = SECTION_COLORS[nowSection];

  const stats = TIME_OF_DAY_ORDER.map(section => {
    const items = tasks.filter(t => taskTimeOfDay(t) === section);
    const done = items.filter(t => t.completed).length;
    return { section, total: items.length, done };
  });
  const totalDone = stats.reduce((sum, s) => sum + s.done, 0);
  const total = stats.reduce((sum, s) => sum + s.total, 0);

  const [, nowEnd] = sectionRange(nowSection, boundaries);
  const caption = (section: TimeOfDay, done: number, count: number) => {
    const index = TIME_OF_DAY_ORDER.indexOf(section);
    const nowIndex = TIME_OF_DAY_ORDER.indexOf(nowSection);
    if (isToday && index > nowIndex) return `from ${formatMinutes(sectionRange(section, boundaries)[0]).replace(':00', '')}`;
    if (count === 0) return 'Nothing yet';
    return `${done} of ${count} done`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View>
          <Text style={[styles.eyebrow, { color: isToday ? nowColor : '#8A8A8A' }]}>
            {isToday ? 'RIGHT NOW' : 'PLANNED'}
          </Text>
          <Text style={styles.title}>{isToday ? NOW_TITLES[nowSection] : dayName}</Text>
        </View>
        <Text style={styles.headMeta}>
          {isToday ? formatLeft(nowEnd - minutes) : total === 0 ? 'No items' : `${totalDone} of ${total} done`}
        </Text>
      </View>

      <View style={styles.track}>
        {stats.map(({ section, total: count, done }) => {
          const color = SECTION_COLORS[section];
          return (
            <View key={section} style={[styles.segment, { backgroundColor: withAlpha(color, 0.16) }]}>
              <View
                style={[
                  styles.segmentFill,
                  { width: `${count === 0 ? 0 : (done / count) * 100}%`, backgroundColor: color },
                ]}
              />
            </View>
          );
        })}
        {isToday && (
          <View
            pointerEvents="none"
            style={[styles.marker, { left: `${markerPosition(minutes, boundaries) * 100}%` }]}
          />
        )}
      </View>

      <View style={styles.labels}>
        {stats.map(({ section, total: count, done }, index) => {
          const shown = section === shownSection;
          const color = SECTION_COLORS[section];
          const align = index === 0 ? 'flex-start' : index === 1 ? 'center' : 'flex-end';
          return (
            <Pressable
              key={section}
              onPress={() => onSelectSection(section)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Show ${TIME_OF_DAY_LABELS[section]}`}
              accessibilityState={{ selected: shown }}
              style={({ pressed }) => [
                styles.label,
                { alignItems: align },
                shown && { backgroundColor: withAlpha(color, 0.12) },
                pressed && styles.labelPressed,
              ]}
            >
              <Text style={[styles.labelName, { color: shown ? color : withAlpha(color, 0.75) }]}>
                {TIME_OF_DAY_LABELS[section]}
              </Text>
              <Text style={[styles.labelMeta, shown && styles.labelMetaShown]}>{caption(section, done, count)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161616',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232323',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F2F2F2',
  },
  headMeta: {
    fontSize: 13,
    color: '#9A9A9A',
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  track: {
    flexDirection: 'row',
    gap: 4,
    height: 8,
    marginVertical: 6,
  },
  segment: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: 4,
  },
  marker: {
    position: 'absolute',
    top: -7,
    width: 3,
    height: 22,
    marginLeft: -1.5,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
  labels: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginHorizontal: -8,
  },
  label: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  labelPressed: {
    opacity: 0.6,
  },
  labelName: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelMeta: {
    fontSize: 12,
    color: '#8A8A8A',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  labelMetaShown: {
    color: '#C8C8C8',
  },
});

export default DayBar;
