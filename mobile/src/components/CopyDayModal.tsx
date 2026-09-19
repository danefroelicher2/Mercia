import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek } from '../types/routine';
import { textOnColor, withAlpha } from '../utils/timeOfDay';

// "Copy [Monday ▾] to [Thursday ▾]" — replaces the second day's routine with
// an exact copy of the first (items, sections, times, counters, order).
// Save only lights up once both days are chosen, and asks one last time.

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const label = (day: DayOfWeek) => day.charAt(0).toUpperCase() + day.slice(1);
const todayKey = (): DayOfWeek => DAYS[(new Date().getDay() + 6) % 7];

interface Props {
  visible: boolean;
  accent: string;
  onClose: () => void;
  // Performs the copy; resolves when done, rejects (after alerting) on failure.
  onConfirm: (fromDay: DayOfWeek, toDay: DayOfWeek) => Promise<void>;
}

type Picker = 'from' | 'to' | null;

const CopyDayModal: React.FC<Props> = ({ visible, accent, onClose, onConfirm }) => {
  const [fromDay, setFromDay] = useState<DayOfWeek | null>(null);
  const [toDay, setToDay] = useState<DayOfWeek | null>(null);
  const [open, setOpen] = useState<Picker>(null);
  const [copying, setCopying] = useState(false);

  // Fresh start every time it opens.
  useEffect(() => {
    if (visible) {
      setFromDay(null);
      setToDay(null);
      setOpen(null);
      setCopying(false);
    }
  }, [visible]);

  const ready = !!fromDay && !!toDay && fromDay !== toDay;
  const today = todayKey();

  const choose = (picker: 'from' | 'to', day: DayOfWeek) => {
    if (picker === 'from') setFromDay(day);
    else setToDay(day);
    setOpen(null);
  };

  const save = () => {
    if (!ready || !fromDay || !toDay) return;
    Alert.alert(
      `Replace ${label(toDay)}?`,
      `Everything currently on ${label(toDay)} will be replaced with ${label(fromDay)}'s routine — ` +
        "every item, section and time.\n\nThis can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, replace',
          style: 'destructive',
          onPress: async () => {
            setCopying(true);
            try {
              await onConfirm(fromDay, toDay);
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

  const renderPicker = (picker: 'from' | 'to') => {
    const value = picker === 'from' ? fromDay : toDay;
    const other = picker === 'from' ? toDay : fromDay;
    const isOpen = open === picker;
    return (
      <View>
        <Pressable
          onPress={() => setOpen(isOpen ? null : picker)}
          style={[
            styles.pill,
            (isOpen || value) && { borderColor: withAlpha(accent, 0.5) },
          ]}
        >
          <Text style={[styles.pillText, !value && styles.pillPlaceholder]}>
            {value ? label(value) : 'Choose a day'}
          </Text>
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={value ? accent : '#666'} />
        </Pressable>

        {isOpen && (
          <View style={styles.list}>
            {DAYS.map(day => {
              const taken = day === other;
              const selected = day === value;
              return (
                <Pressable
                  key={day}
                  disabled={taken}
                  onPress={() => choose(picker, day)}
                  style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                >
                  <Text style={[styles.listText, taken && styles.listTextTaken, selected && { color: accent }]}>
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={copying ? undefined : onClose}>
        <Pressable style={styles.card} onPress={() => setOpen(null)}>
          <Text style={styles.title}>Copy a day</Text>
          <Text style={styles.subtitle}>Every item, section and time, onto another day.</Text>

          <Text style={styles.fieldLabel}>Copy</Text>
          {renderPicker('from')}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>to</Text>
          {renderPicker('to')}

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
