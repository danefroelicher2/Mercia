import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import RoutineSettingsContent from './RoutineSettingsContent';
import CopyDayModal from './CopyDayModal';
import { DayOfWeek } from '../types/routine';

// The Routine tab's gear: time-of-day and visibility settings, plus
// multi-select and Clear all. (The only home for Routine settings.)

interface Props {
  visible: boolean;
  accent: string;
  onClose: () => void;
  // Deletes every task, goal and the notepad. Resolves when done; rejects
  // (after alerting) if nothing was cleared.
  onClearAll: () => Promise<void>;
  // Replaces each of toDays with a copy of fromDay. Resolves when done;
  // rejects (after alerting) on failure.
  onCopyDay: (fromDay: DayOfWeek, toDays: DayOfWeek[]) => Promise<void>;
}

const RoutineSettingsSheet: React.FC<Props> = ({ visible, accent, onClose, onClearAll, onCopyDay }) => {
  const prefs = useRoutinePreferences();
  const [clearing, setClearing] = useState(false);
  const [copyVisible, setCopyVisible] = useState(false);

  const confirmClearAll = () => {
    Alert.alert(
      'Clear your whole Routine?',
      'This deletes every task on every day, all weekly, monthly and yearly goals, and your notepad. ' +
        "Gym and your stats history aren't affected.\n\nThis can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, clear everything',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await onClearAll();
              onClose();
            } catch {
              // onClearAll already told the user; stay open so they can retry.
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.headerTitle}>Routine settings</Text>
          <Pressable onPress={onClose} hitSlop={10} style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <Text style={[styles.done, { color: accent }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Selecting & copying — first */}
          <Text style={styles.sectionTitle}>SELECTING</Text>
          <View style={styles.group}>
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.rowLabelWrap}>
                <Ionicons name="checkmark-done-outline" size={18} color={accent} />
                <Text style={styles.rowLabel}>Multi-select</Text>
              </View>
              <Switch
                value={prefs.multiSelect}
                onValueChange={v => prefs.setToggle('multiSelect', v)}
                trackColor={{ false: '#333333', true: accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Pressable
              onPress={() => setCopyVisible(true)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="copy-outline" size={18} color={accent} />
                <Text style={styles.rowLabel}>Copy a day</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#555" />
            </Pressable>
          </View>
          <Text style={styles.footnote}>
            Multi-select: tapping an item selects it instead of checking it off — across Morning,
            Afternoon, Night, any day, and your goals. Hold a selected item to delete them all at once.
            {'\n'}Copy a day: replace one day's routine with another's, times included.
          </Text>

          <RoutineSettingsContent accent={accent} />

          {/* Clear all — always last */}
          <Pressable
            onPress={confirmClearAll}
            disabled={clearing}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
          >
            {clearing ? (
              <ActivityIndicator color="#FF6B6B" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                <Text style={styles.clearText}>Clear all</Text>
              </>
            )}
          </Pressable>
          <Text style={[styles.footnote, { textAlign: 'center' }]}>
            Deletes everything on the Routine tab. Gym isn't affected.
          </Text>
        </ScrollView>
      </View>

      <CopyDayModal
        visible={copyVisible}
        accent={accent}
        onClose={() => setCopyVisible(false)}
        onConfirm={onCopyDay}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#232323',
  },
  headerSide: {
    width: 60,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  done: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#777',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
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
    minHeight: 54,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  rowPressed: {
    backgroundColor: '#1D1D1D',
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
  footnote: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  clearButtonPressed: {
    backgroundColor: 'rgba(255, 107, 107, 0.16)',
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
});

export default RoutineSettingsSheet;
