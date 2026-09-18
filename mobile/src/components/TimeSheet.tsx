import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TimeOfDay } from '../types/routine';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import {
  SECTION_COLORS,
  formatTime,
  parseTimeInput,
  quickTimes,
  textOnColor,
  togglePeriod,
  withAlpha,
} from '../utils/timeOfDay';

// Set, change, or remove an item's time. Typing "8" reads as 8:00 AM on a
// Morning item and 8:00 PM on a Night item; the AM/PM toggle flips it.

interface Props {
  visible: boolean;
  title: string;
  section: TimeOfDay;
  value: string | null;
  onSave: (value: string | null) => void;
  onClose: () => void;
}

const TimeSheet: React.FC<Props> = ({ visible, title, section, value, onSave, onClose }) => {
  const [input, setInput] = useState('');
  const [flipped, setFlipped] = useState(false);
  const { boundaries } = useRoutinePreferences();
  const accent = SECTION_COLORS[section];
  const onAccent = textOnColor(accent);

  // Reset to the item's current time each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    if (value) {
      const text = formatTime(value).time;
      setInput(text);
      setFlipped(parseTimeInput(text, section, boundaries) !== value);
    } else {
      setInput('');
      setFlipped(false);
    }
  }, [visible, value, section, boundaries]);

  const parsed = parseTimeInput(input, section, boundaries);
  const result = parsed && flipped ? togglePeriod(parsed) : parsed;
  const preview = result ? formatTime(result) : null;

  const handleChange = (text: string) => {
    setInput(text);
    setFlipped(false);
  };

  const pickQuick = (time: string) => {
    setInput(formatTime(time).time);
    setFlipped(false);
  };

  const save = () => {
    if (!result) return;
    onSave(result);
    onClose();
  };

  const remove = () => {
    onSave(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>

            <View style={styles.body}>
              <View style={[styles.inputBox, { borderColor: withAlpha(accent, 0.45) }]}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={handleChange}
                  placeholder="8:00"
                  placeholderTextColor="#3E3E3E"
                  keyboardType="numbers-and-punctuation"
                  keyboardAppearance="dark"
                  selectionColor={accent}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  autoFocus
                  maxLength={8}
                />
              </View>

              {/* Live reading of what was typed, with an AM/PM flip */}
              <View style={styles.previewRow}>
                <Text style={[styles.previewTime, { color: preview ? accent : '#444' }]}>
                  {preview ? preview.time : '--:--'}
                </Text>
                <View style={styles.periodToggle}>
                  {(['AM', 'PM'] as const).map(period => {
                    const on = preview?.period === period;
                    return (
                      <Pressable
                        key={period}
                        disabled={!preview || on}
                        onPress={() => setFlipped(f => !f)}
                        style={[styles.periodOption, on && { backgroundColor: accent }]}
                      >
                        <Text style={[styles.periodText, on && { color: onAccent }]}>{period}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.quickRow}>
                {quickTimes(section, boundaries).map(time => {
                  const { time: label, period } = formatTime(time);
                  const on = result === time;
                  return (
                    <Pressable
                      key={time}
                      onPress={() => pickQuick(time)}
                      style={[
                        styles.quick,
                        on && { backgroundColor: withAlpha(accent, 0.18), borderColor: withAlpha(accent, 0.5) },
                      ]}
                    >
                      <Text style={[styles.quickText, on && { color: accent }]}>{label}</Text>
                      <Text style={styles.quickPeriod}>{period}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.buttons}>
                {value ? (
                  <Pressable onPress={remove} hitSlop={8}>
                    <Text style={styles.removeText}>Remove time</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable
                  onPress={save}
                  disabled={!result}
                  style={[styles.saveButton, { backgroundColor: accent }, !result && styles.saveDisabled]}
                >
                  <Text style={[styles.saveText, { color: onAccent }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  body: {
    padding: 20,
    paddingTop: 14,
  },
  inputBox: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    fontSize: 32,
    fontWeight: '600',
    color: '#F2F2F2',
    textAlign: 'center',
    paddingVertical: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
  },
  previewTime: {
    fontSize: 20,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 2,
  },
  periodOption: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  quick: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#141414',
  },
  quickText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D8D8D8',
  },
  quickPeriod: {
    fontSize: 9,
    fontWeight: '600',
    color: '#666',
    marginTop: 1,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  removeText: {
    fontSize: 14,
    color: '#FF6B6B',
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 22,
  },
  saveDisabled: {
    opacity: 0.35,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default TimeSheet;
