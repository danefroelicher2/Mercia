import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import api from '../services/api';

interface GymMemoryEntry {
  id: string;
  user_id: string;
  workout_group: string;
  notes: string;
  session_date: string;
  created_at: string;
}

interface GymMemoryGroup {
  workout_group: string;
  entries: GymMemoryEntry[];
}

interface GymPREntry {
  id: string;
  user_id: string;
  muscle_group: string;
  exercise_name: string;
  weight: number;
  reps: number;
  created_at: string;
}

interface GymPRGroup {
  muscle_group: string;
  entries: GymPREntry[];
}

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'] as const;
const MUSCLE_ORDER = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'];

type Tab = 'history' | 'prs';

const GymMemoryScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [groups, setGroups] = useState<GymMemoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [prGroups, setPRGroups] = useState<GymPRGroup[]>([]);
  const [prLoading, setPRLoading] = useState(true);
  const [expandedPRs, setExpandedPRs] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string>('Chest');
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  const loadPRs = useCallback(async () => {
    try {
      setPRLoading(true);
      const res = await api.get('/api/gym/prs');
      setPRGroups(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setPRLoading(false);
    }
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/gym/memory');
      setGroups(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemory();
    loadPRs();
  }, [loadMemory, loadPRs]);

  const toggleEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const togglePR = (entryId: string) => {
    setExpandedPRs(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) { next.delete(entryId); } else { next.add(entryId); }
      return next;
    });
  };

  const resetModal = () => {
    setSelectedMuscleGroup('Chest');
    setExerciseName('');
    setWeight('');
    setReps('');
    setSaving(false);
  };

  const handleSavePR = async () => {
    const parsedWeight = parseFloat(weight);
    const parsedReps = parseInt(reps, 10);
    if (!exerciseName.trim() || isNaN(parsedWeight) || parsedWeight <= 0 || isNaN(parsedReps) || parsedReps <= 0) {
      Alert.alert('Invalid input', 'Please fill in all fields with valid numbers.');
      return;
    }
    try {
      setSaving(true);
      const res = await api.post('/api/gym/prs', {
        muscleGroup: selectedMuscleGroup,
        exerciseName: exerciseName.trim(),
        weight: parsedWeight,
        reps: parsedReps,
      });
      const newEntry: GymPREntry = res.data.data;
      setPRGroups(prev => {
        const existing = prev.find(g => g.muscle_group === selectedMuscleGroup);
        if (existing) {
          return prev.map(g =>
            g.muscle_group === selectedMuscleGroup
              ? { ...g, entries: [newEntry, ...g.entries] }
              : g
          );
        }
        const next = [...prev, { muscle_group: selectedMuscleGroup, entries: [newEntry] }];
        return next.sort((a, b) => MUSCLE_ORDER.indexOf(a.muscle_group) - MUSCLE_ORDER.indexOf(b.muscle_group));
      });
      setModalVisible(false);
      resetModal();
    } catch {
      Alert.alert('Error', 'Failed to save PR. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePREntry = (entry: GymPREntry) => {
    Alert.alert(
      'Delete PR',
      `Delete ${entry.exercise_name} (${entry.weight} lbs × ${entry.reps} reps)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/prs/entry/${entry.id}`);
              setPRGroups(prev =>
                prev
                  .map(g => ({ ...g, entries: g.entries.filter(e => e.id !== entry.id) }))
                  .filter(g => g.entries.length > 0)
              );
            } catch {
              Alert.alert('Error', 'Failed to delete PR. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeletePRGroup = (group: GymPRGroup) => {
    Alert.alert(
      'Delete Group',
      `Delete all PR entries for "${group.muscle_group}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/prs/${encodeURIComponent(group.muscle_group)}`);
              setPRGroups(prev => prev.filter(g => g.muscle_group !== group.muscle_group));
            } catch {
              Alert.alert('Error', 'Failed to delete group. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteEntry = (entry: GymMemoryEntry, groupName: string) => {
    Alert.alert(
      'Delete Workout',
      `Delete the ${groupName} session on ${formatDate(entry.session_date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/memory/entry/${entry.id}`);
              setGroups(prev =>
                prev
                  .map(g =>
                    g.workout_group === groupName
                      ? { ...g, entries: g.entries.filter(e => e.id !== entry.id) }
                      : g
                  )
                  .filter(g => g.entries.length > 0)
              );
            } catch {
              Alert.alert('Error', 'Failed to delete workout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteGroup = (group: GymMemoryGroup) => {
    Alert.alert(
      'Delete Group',
      `Delete all memory entries for "${group.workout_group}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/gym/memory/${encodeURIComponent(group.workout_group)}`);
              setGroups(prev => prev.filter(g => g.workout_group !== group.workout_group));
            } catch {
              Alert.alert('Error', 'Failed to delete group. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderHistory = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color="#1D9E75" />
        </View>
      );
    }

    if (groups.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No gym memory yet</Text>
          <Text style={styles.emptySubtitle}>Log a workout in the Gym tab to build your history.</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {groups.map(group => (
          <View key={group.workout_group} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.workout_group}</Text>
              <TouchableOpacity onPress={() => handleDeleteGroup(group)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
            {group.entries.map((entry, index) => {
              const isLast = index === group.entries.length - 1;
              const isExpanded = expandedEntries.has(entry.id);
              return (
                <View key={entry.id}>
                  <TouchableOpacity
                    style={[styles.entryRow, isLast && !isExpanded && styles.entryRowLast]}
                    onPress={() => toggleEntry(entry.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.entryDate}>{formatDate(entry.session_date)}</Text>
                    <Text style={styles.entryChevron}>{isExpanded ? '∧' : '∨'}</Text>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={[styles.entryExpanded, isLast && styles.entryExpandedLast]}>
                      <Text style={styles.entryNotes}>{entry.notes}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteEntry(entry, group.workout_group)}
                        style={styles.deleteEntryButton}
                      >
                        <Text style={styles.deleteEntryText}>Delete workout</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderPRs = () => {
    if (prLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color="#1D9E75" />
        </View>
      );
    }

    return (
      <>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {prGroups.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No PRs logged yet</Text>
              <Text style={styles.emptySubtitle}>Tap + to log your first personal record.</Text>
            </View>
          ) : (
            prGroups.map(group => (
              <View key={group.muscle_group} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupName}>{group.muscle_group}</Text>
                  <TouchableOpacity onPress={() => handleDeletePRGroup(group)}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
                {group.entries.map((entry, index) => {
                  const isLast = index === group.entries.length - 1;
                  const isExpanded = expandedPRs.has(entry.id);
                  return (
                    <View key={entry.id}>
                      <TouchableOpacity
                        style={[styles.entryRow, isLast && !isExpanded && styles.entryRowLast]}
                        onPress={() => togglePR(entry.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.entryDate}>{entry.exercise_name}</Text>
                        <Text style={styles.entryChevron}>{isExpanded ? '∧' : '∨'}</Text>
                      </TouchableOpacity>
                      {isExpanded && (
                        <View style={[styles.entryExpanded, isLast && styles.entryExpandedLast]}>
                          <Text style={styles.entryNotes}>{entry.weight} lbs</Text>
                          <Text style={[styles.entryNotes, { marginTop: 2 }]}>{entry.reps} reps</Text>
                          <TouchableOpacity
                            onPress={() => handleDeletePREntry(entry)}
                            style={styles.deleteEntryButton}
                          >
                            <Text style={styles.deleteEntryText}>Delete PR</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => { setModalVisible(false); resetModal(); }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => { setModalVisible(false); resetModal(); }}
            >
              <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()} style={styles.modalContent}>
                <Text style={styles.modalTitle}>Log PR</Text>

                <Text style={styles.modalLabel}>Muscle Group</Text>
                <View style={styles.muscleGroupRow}>
                  {MUSCLE_GROUPS.map(mg => (
                    <TouchableOpacity
                      key={mg}
                      style={[styles.muscleChip, selectedMuscleGroup === mg && styles.muscleChipActive]}
                      onPress={() => setSelectedMuscleGroup(mg)}
                    >
                      <Text style={[styles.muscleChipText, selectedMuscleGroup === mg && styles.muscleChipTextActive]}>
                        {mg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>Exercise</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Bench Press"
                  placeholderTextColor="#555"
                  value={exerciseName}
                  onChangeText={setExerciseName}
                />

                <Text style={styles.modalLabel}>Weight (lbs)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="225"
                  placeholderTextColor="#555"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="numeric"
                />

                <Text style={styles.modalLabel}>Reps</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="8"
                  placeholderTextColor="#555"
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="numeric"
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => { setModalVisible(false); resetModal(); }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, saving && { opacity: 0.5 }]}
                    onPress={handleSavePR}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sub-tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Workout history
          </Text>
        </TouchableOpacity>
        <View style={[styles.tab, styles.prTab, activeTab === 'prs' && styles.tabActive]}>
          <TouchableOpacity style={styles.prTabLabel} onPress={() => setActiveTab('prs')}>
            <Text style={[styles.tabText, activeTab === 'prs' && styles.tabTextActive]}>PRs</Text>
          </TouchableOpacity>
          {activeTab === 'prs' && (
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {activeTab === 'history' ? renderHistory() : renderPRs()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
    backgroundColor: '#161616',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1D9E75',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#E8E8E8',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  groupCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  deleteText: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  entryDate: {
    fontSize: 14,
    color: '#888',
  },
  entryChevron: {
    fontSize: 12,
    color: '#555',
  },
  entryExpanded: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#191919',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  entryRowLast: {
    borderBottomWidth: 0,
  },
  entryExpandedLast: {
    borderBottomWidth: 0,
  },
  entryNotes: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
  },
  deleteEntryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  deleteEntryText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  prTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prTabLabel: {
    flex: 1,
    alignItems: 'center',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  addButtonText: {
    fontSize: 22,
    color: '#1D9E75',
    fontWeight: '300',
    lineHeight: 26,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  muscleGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  muscleChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1E1E1E',
  },
  muscleChipActive: {
    borderColor: '#1D9E75',
    backgroundColor: '#0D2E23',
  },
  muscleChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  muscleChipTextActive: {
    color: '#1D9E75',
  },
  modalInput: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#E8E8E8',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});

export default GymMemoryScreen;
