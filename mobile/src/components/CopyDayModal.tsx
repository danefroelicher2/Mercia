import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek } from '../types/routine';
import { textOnColor, withAlpha } from '../utils/timeOfDay';

// "Copy [Monday ▾] to [Thursday ▾] [Friday ▾] …" — replaces each target day's
// routine with an exact copy of the first (items, sections, times, counters,
// order). Choosing a target reveals another optional one, up to all six other
// days. Save lights up once a source and at least one target are chosen, and
// asks one last time.

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const label = (day: DayOfWeek) => day.charAt(0).toUpperCase() + day.slice(1);
const todayKey = (): DayOfWeek => DAYS[(new Date().getDay() + 6) % 7];
const MAX_TARGETS = DAYS.length - 1;

// "Saturday", "Saturday and Sunday", "Saturday, Sunday and Tuesday"
const listDays = (days: DayOfWeek[]): string => {
  const names = days.map(label);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

interface Props {
  visible: boolean;
  accent: string;
  onClose: () => void;
  // Performs the copy; resolves when done, rejects (after alerting) on failure.
  onConfirm: (fromDay: DayOfWeek, toDays: DayOfWeek[]) => Promise<void>;
}

// 'from', or the index of a target slot
type Picker = 'from' | number | null;

const CopyDayModal: React.FC<Props> = ({ visible, accent, onClose, onConfirm }) => {
  const [fromDay, setFromDay] = useState<DayOfWeek | null>(null);
  // Chosen target days, in the order picked; one more (empty) slot is shown
  // after them until all six other days are used.
  const [toDays, setToDays] = useState<DayOfWeek[]>([]);
  const [open, setOpen] = useState<Picker>(null);
  const [copying, setCopying] = useState(false);

  // Fresh start every time it opens.
  useEffect(() => {
    if (visible) {
      setFromDay(null);
      setToDays([]);
      setOpen(null);
      setCopying(false);
    }
  }, [visible]);

  const ready = !!fromDay && toDays.length > 0;
  const today = todayKey();

  const choose = (picker: 'from' | number, day: DayOfWeek) => {
    if (picker === 'from') {
      setFromDay(day);
      // A day can't be copied onto itself.
      setToDays(prev => prev.filter(d => d !== day));
    } else {
      setToDays(prev => {
        const next = prev.slice();
        next[picker] = day;
        return next;
      });
    }
    setOpen(null);
  };

  const removeTarget = (index: number) => {
    setToDays(prev => prev.filter((_, i) => i !== index));
    setOpen(null);
  };

  const save = () => {
    if (!ready || !fromDay) return;
    const targets = listDays(toDays);
    Alert.alert(
      `Replace ${targets}?`,
      `Everything currently on ${targets} will be replaced with ${label(fromDay)}'s routine — ` +
        "every item, section and time.\n\nThis can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, replace',
          style: 'destructive',
          onPress: async () => {
            setCopying(true);
            try {
              await onConfirm(fromDay, toDays);
              onClose();
            } catch {
              // onConfirm already told the user; keep the window open to retry.
            } finally {
              setCopying(false);
            }
          },
        },
      ],
    );
  };

  const renderPicker = (picker: 'from' | number) => {
    const value = picker === 'from' ? fromDay : toDays[picker] ?? null;
    // Days taken elsewhere: the source for targets; the source and the other
    // targets for each target; the targets for the source (picking one of
    // those as the source just removes it from the targets).
    const taken = (day: DayOfWeek) =>
      picker !== 'from' && (day === fromDay || toDays.some((d, i) => d === day && i !== picker));
    const isOpen = open === picker;
    const optional = typeof picker === 'number' && picker > 0;
    return (
      <View style={typeof picker === 'number' && picker > 0 ? { marginTop: 8 } : undefined}>
        <Pressable
          onPress={() => setOpen(isOpen ? null : picker)}
          style={[
            styles.pill,
            (isOpen || value) && { borderColor: withAlpha(accent, 0.5) },
          ]}
        >
          <Text style={[styles.pillText, !value && styles.pillPlaceholder]}>
            {value ? label(value) : optional ? 'Add another day (optional)' : 'Choose a day'}
          </Text>
          {optional && value ? (
            <Pressable onPress={() => removeTarget(picker as number)} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#666" />
            </Pressable>
          ) : (
            <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={value ? accent : '#666'} />
          )}
        </Pressable>

        {isOpen && (
          <View style={styles.list}>
            {DAYS.map(day => {
              const isTaken = taken(day);
              const selected = day === value;
              return (
                <Pressable
                  key={day}
                  disabled={isTaken}
                  onPress={() => choose(picker, day)}
                  style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                >
                  <Text style={[styles.listText, isTaken && styles.listTextTaken, selected && { color: accent }]}>
                    {label(day)}
                    {day === today ? <Text style={styles.todayTag}>  Today</Text> : null}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={accent} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Filled target slots plus one empty slot, until all six other days are used.
  const targetSlots = Math.min(toDays.length + 1, MAX_TARGETS);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={copying ? undefined : onClose}>
        <Pressable style={styles.card} onPress={() => setOpen(null)}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Copy a day</Text>
          <Text style={styles.subtitle}>Every item, section and time, onto other days.</Text>

          <Text style={styles.fieldLabel}>Copy</Text>
          {renderPicker('from')}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>to</Text>
          {Array.from({ length: targetSlots }).map((_, i) => (
            <React.Fragment key={i}>{renderPicker(i)}</React.Fragment>
          ))}

          <View style={styles.buttons}>
            <Pressable onPress={onClose} disabled={copying} hitSlop={8} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!ready || copying}
              style={[styles.saveButton, ready ? { backgroundColor: accent } : styles.saveButtonDisabled]}
            >
              {copying ? (
                <ActivityIndicator color={textOnColor(accent)} />
              ) : (
                <Text style={[styles.saveText, ready ? { color: textOnColor(accent) } : styles.saveTextDisabled]}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#F2F2F2',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#777',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E2E2E',
    backgroundColor: '#111',
  },
  pillText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
  },
  pillPlaceholder: {
    color: '#666',
  },
  list: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#141414',
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#232323',
  },
  listRowPressed: {
    backgroundColor: '#1F1F1F',
  },
  listText: {
    fontSize: 15,
    color: '#E8E8E8',
  },
  listTextTaken: {
    color: '#444',
  },
  todayTag: {
    fontSize: 11,
    color: '#777',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingRight: 12,
  },
  cancelText: {
    fontSize: 15,
    color: '#999',
  },
  saveButton: {
    minWidth: 96,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  saveButtonDisabled: {
    backgroundColor: '#2A2A2A',
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveTextDisabled: {
    color: '#555',
  },
});

export default CopyDayModal;
