import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TaskSection, TimeOfDay } from '../types/routine';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import {
  TASK_SECTION_COLORS,
  TASK_SECTION_LABELS,
  TASK_SECTION_ORDER,
  formatMinutes,
  sectionRange,
  textOnColor,
  withAlpha,
} from '../utils/timeOfDay';

// Bottom sheet for adding to the day: type the item, pick where it goes.
// Stays open after each add (keeping the pick) so several can go in a row;
// tap outside to close. Times are set afterwards by holding the item.

interface Props {
  visible: boolean;
  // Picked when the sheet opens: the part of the day it is now.
  defaultSection: TimeOfDay;
  onAdd: (text: string, section: TaskSection) => void;
  onClose: () => void;
}

export const SECTION_ICONS: Record<TaskSection, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  afternoon: 'partly-sunny-outline',
  night: 'moon-outline',
  anytime: 'infinite-outline',
};

const AddTaskSheet: React.FC<Props> = ({ visible, defaultSection, onAdd, onClose }) => {
  const { boundaries } = useRoutinePreferences();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [section, setSection] = useState<TaskSection>(defaultSection);
  const accent = TASK_SECTION_COLORS[section];
  const canAdd = text.trim().length > 0;

  useEffect(() => {
    if (!visible) return;
    setText('');
    setSection(defaultSection);
  }, [visible, defaultSection]);

  // The keyboard covers the home indicator, so the bottom inset only applies
  // while it's down; otherwise it leaves a dead band above the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const hours = (s: TaskSection) => {
    if (s === 'anytime') return 'No set time';
    const short = (m: number) => formatMinutes(m % (24 * 60)).replace(':00', '');
    const [start, end] = sectionRange(s, boundaries);
    if (s === 'morning') return `until ${short(end)}`;
    if (s === 'night') return `after ${short(start)}`;
    return `${short(start)} – ${short(end)}`;
  };

  const add = () => {
    if (!canAdd) return;
    onAdd(text, section);
    setText('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: keyboardUp ? 16 : Math.max(16, insets.bottom) }]}
            onPress={() => {}}
          >
            <View style={styles.grab} />
            <View style={styles.header}>
              <Text style={styles.title}>Add to your day</Text>
              <Pressable
                onPress={add}
                disabled={!canAdd}
                style={[styles.addButton, { backgroundColor: accent }, !canAdd && styles.addDisabled]}
              >
                <Text style={[styles.addText, { color: textOnColor(accent) }]}>Add</Text>
              </Pressable>
            </View>

            <TextInput
              style={[styles.input, { borderColor: withAlpha(accent, 0.45) }]}
              value={text}
              onChangeText={setText}
              placeholder="What do you want to do?"
              placeholderTextColor="#4E4E4E"
              selectionColor={accent}
              keyboardAppearance="dark"
              autoCapitalize="sentences"
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={add}
              autoFocus
              maxLength={500}
            />

            <View style={styles.tiles}>
              {TASK_SECTION_ORDER.map(s => {
                const color = TASK_SECTION_COLORS[s];
                const on = s === section;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSection(s)}
                    style={[
                      styles.tile,
                      on && { backgroundColor: withAlpha(color, 0.12), borderColor: color },
                    ]}
                  >
                    <View style={styles.tileTitle}>
                      <Ionicons name={SECTION_ICONS[s]} size={15} color={color} />
                      <Text style={[styles.tileLabel, { color }]}>{TASK_SECTION_LABELS[s]}</Text>
                    </View>
                    <Text style={styles.tileHours}>{hours(s)}</Text>
                  </Pressable>
                );
              })}
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grab: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F2F2F2',
  },
  addButton: {
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  addDisabled: {
    opacity: 0.35,
  },
  addText: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#F2F2F2',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tile: {
    // Two per row: half the width less half the gap.
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tileTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  tileHours: {
    fontSize: 12,
    color: '#777',
    marginTop: 3,
  },
});

export default AddTaskSheet;
