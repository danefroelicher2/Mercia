import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import {
  BOUNDARY_STEP,
  DEFAULT_BOUNDARIES,
  SECTION_COLORS,
  boundaryLimits,
  formatMinutes,
} from '../utils/timeOfDay';

// The Routine settings body — time-of-day boundaries and which cards show.
// Rendered inside the Routine tab's gear sheet.

interface Props {
  // Switch / link color; the gear sheet passes the current section's color.
  accent?: string;
}

// − / + button that repeats while held.
const StepButton: React.FC<{
  icon: 'remove' | 'add';
  disabled: boolean;
  color: string;
  onStep: () => void;
}> = ({ icon, disabled, color, onStep }) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const repeat = (delay: number) => {
    timer.current = setTimeout(() => {
      // Hitting the limit disables the button mid-press; stop repeating.
      if (disabledRef.current) return stop();
      stepRef.current();
      repeat(110);
    }, delay);
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        stepRef.current();
        repeat(420);
      }}
      onPressOut={stop}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: disabled ? '#2A2A2A' : `${color}66` },
        pressed && { backgroundColor: `${color}22` },
      ]}
    >
      <Ionicons name={icon} size={16} color={disabled ? '#3A3A3A' : color} />
    </Pressable>
  );
};

const RoutineSettingsContent: React.FC<Props> = ({ accent = '#1D9E75' }) => {
  const prefs = useRoutinePreferences();
  const { boundaries } = prefs;
  const limits = boundaryLimits(boundaries);
  const isDefault =
    boundaries.afternoonStart === DEFAULT_BOUNDARIES.afternoonStart &&
    boundaries.nightStart === DEFAULT_BOUNDARIES.nightStart;

  // Proportions for the 24-hour bar.
  const day = 24 * 60;
  const morningPct = (boundaries.afternoonStart / day) * 100;
  const afternoonPct = ((boundaries.nightStart - boundaries.afternoonStart) / day) * 100;
  const nightPct = 100 - morningPct - afternoonPct;

  const boundaryRow = (
    key: 'afternoonStart' | 'nightStart',
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    last?: boolean,
  ) => {
    const value = boundaries[key];
    const { min, max } = limits[key];
    return (
      <View style={[styles.row, last && styles.rowLast]}>
        <View style={styles.rowLabelWrap}>
          <Ionicons name={icon} size={16} color={color} />
          <Text style={styles.rowLabel}>{label}</Text>
        </View>
        <View style={styles.stepper}>
          <StepButton
            icon="remove"
            color={color}
            disabled={value <= min}
            onStep={() => prefs.setBoundaries({ [key]: Math.max(min, value - BOUNDARY_STEP) })}
          />
          <Text style={styles.stepValue}>{formatMinutes(value)}</Text>
          <StepButton
            icon="add"
            color={color}
            disabled={value >= max}
            onStep={() => prefs.setBoundaries({ [key]: Math.min(max, value + BOUNDARY_STEP) })}
          />
        </View>
      </View>
    );
  };

  const toggleRow = (
    key: 'showWeekly' | 'showMonthly' | 'showYearly' | 'showNotepad',
    label: string,
    last?: boolean,
  ) => (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={prefs[key]}
        onValueChange={v => prefs.setToggle(key, v)}
        trackColor={{ false: '#333333', true: accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <View>
      {/* Time of day */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>TIME OF DAY</Text>
        {!isDefault && (
          <Pressable onPress={prefs.resetBoundaries} hitSlop={8}>
            <Text style={[styles.resetText, { color: accent }]}>Reset to default</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.group}>
        <View style={styles.dayBarWrap}>
          <View style={styles.dayBar}>
            <View style={{ width: `${morningPct}%`, backgroundColor: SECTION_COLORS.morning }} />
            <View style={{ width: `${afternoonPct}%`, backgroundColor: SECTION_COLORS.afternoon }} />
            <View style={{ width: `${nightPct}%`, backgroundColor: SECTION_COLORS.night }} />
          </View>
          <View style={styles.dayBarLabels}>
            <Text style={[styles.dayBarLabel, { width: `${morningPct}%`, color: SECTION_COLORS.morning }]} numberOfLines={1}>
              Morning
            </Text>
            <Text style={[styles.dayBarLabel, { width: `${afternoonPct}%`, color: SECTION_COLORS.afternoon }]} numberOfLines={1}>
              Afternoon
            </Text>
            <Text style={[styles.dayBarLabel, { width: `${nightPct}%`, color: SECTION_COLORS.night }]} numberOfLines={1}>
              Night
            </Text>
          </View>
        </View>
        {boundaryRow('afternoonStart', 'Afternoon starts', 'partly-sunny-outline', SECTION_COLORS.afternoon)}
        {boundaryRow('nightStart', 'Night starts', 'moon-outline', SECTION_COLORS.night, true)}
      </View>
      <Text style={styles.footnote}>
        Morning runs from midnight until afternoon starts. Routine opens to the current part of the day,
        and a typed time like "8" becomes AM or PM based on these.
      </Text>

      {/* Visibility */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SHOW ON ROUTINE TAB</Text>
      </View>
      <View style={styles.group}>
        {toggleRow('showWeekly', 'Weekly Goals')}
        {toggleRow('showMonthly', 'Monthly Goals')}
        {toggleRow('showYearly', 'Yearly Goals')}
        {toggleRow('showNotepad', 'Notepad', true)}
      </View>
      <Text style={styles.footnote}>Today's tasks are always shown.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#777',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  group: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
    minHeight: 54,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    width: 76,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#F2F2F2',
    fontVariant: ['tabular-nums'],
  },
  dayBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  dayBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
  },
  dayBarLabels: {
    flexDirection: 'row',
    marginTop: 7,
  },
  dayBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  footnote: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
});

export default RoutineSettingsContent;
