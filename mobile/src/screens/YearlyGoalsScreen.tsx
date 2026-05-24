import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface YearlyGoal {
  id: string;
  text: string;
  completed: boolean;
  created_at: string;
}

const getDayOfYear = (): { day: number; total: number } => {
  const now = new Date();
  const year = now.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const total = isLeap ? 366 : 365;
  const start = new Date(year, 0, 0);
  const diff = now.getTime() - start.getTime();
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  return { day, total };
};

const YearlyGoalsScreen: React.FC = () => {
  const [goals, setGoals] = useState<YearlyGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { day, total } = getDayOfYear();
  const progress = day / total;

  const fetchGoals = useCallback(async () => {
    try {
      const response = await api.get('/api/routine/goals/yearly');
      if (response.data.success) {
        setGoals(response.data.data ?? []);
      }
    } catch (error) {
      console.error('[YearlyGoalsScreen] Error fetching goals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAddGoal = async () => {
    const text = newGoalText.trim();
    if (!text) return;
    setSaving(true);
    try {
      const response = await api.post('/api/routine/goals', { text, type: 'yearly' });
      if (response.data.success) {
        setGoals((prev) => [...prev, response.data.data]);
        setNewGoalText('');
        setAddingGoal(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add goal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (goal: YearlyGoal) => {
    setTogglingId(goal.id);
    try {
      const response = await api.patch(`/api/routine/goals/${goal.id}`, {
        completed: !goal.completed,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (response.data.success) {
        setGoals((prev) =>
          prev.map((g) => (g.id === goal.id ? { ...g, completed: !goal.completed } : g))
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update goal.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (goal: YearlyGoal) => {
    Alert.alert('Delete Goal', `Delete "${goal.text}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(goal.id);
          try {
            await api.delete(`/api/routine/goals/${goal.id}`);
            setGoals((prev) => prev.filter((g) => g.id !== goal.id));
          } catch (error) {
            Alert.alert('Error', 'Failed to delete goal.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const renderGoal = ({ item }: { item: YearlyGoal }) => {
    const isToggling = togglingId === item.id;
    const isDeleting = deletingId === item.id;

    return (
      <View style={styles.goalRow}>
        <TouchableOpacity
          style={styles.checkButton}
          onPress={() => handleToggle(item)}
          disabled={isToggling || isDeleting}
          activeOpacity={0.7}
        >
          {isToggling ? (
            <ActivityIndicator size="small" color="#1D9E75" />
          ) : (
            <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
              {item.completed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
          )}
        </TouchableOpacity>

        <Text style={[styles.goalText, item.completed && styles.goalTextDone]}>{item.text}</Text>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
          disabled={isToggling || isDeleting}
          activeOpacity={0.7}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#555" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#555" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Day-of-year tracker */}
        <View style={styles.trackerCard}>
          <View style={styles.trackerHeader}>
            <Text style={styles.trackerLabel}>Day of the Year</Text>
            <Text style={styles.trackerCount}>
              {day} / {total}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.trackerSubtitle}>
            {Math.round(progress * 100)}% of the year complete
          </Text>
        </View>

        {/* Goals list */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#1D9E75" />
          </View>
        ) : (
          <FlatList
            data={goals}
            keyExtractor={(item) => item.id}
            renderItem={renderGoal}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No yearly goals yet. Tap + to add one.
              </Text>
            }
          />
        )}

        {/* Add goal input */}
        {addingGoal ? (
          <View style={styles.addInputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter your goal..."
              placeholderTextColor="#555"
              value={newGoalText}
              onChangeText={setNewGoalText}
              autoFocus
              onSubmitEditing={handleAddGoal}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.saveGoalButton, (!newGoalText.trim() || saving) && styles.saveGoalButtonDisabled]}
              onPress={handleAddGoal}
              disabled={!newGoalText.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveGoalButtonText}>Add</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelInputButton}
              onPress={() => {
                setAddingGoal(false);
                setNewGoalText('');
              }}
            >
              <Text style={styles.cancelInputText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addButton} onPress={() => setAddingGoal(true)}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Goal</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  trackerCard: {
    margin: 16,
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#232323',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  trackerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
    letterSpacing: 0.3,
  },
  trackerCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D9E75',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1D9E75',
    borderRadius: 4,
  },
  trackerSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#232323',
  },
  checkButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  goalText: {
    flex: 1,
    fontSize: 15,
    color: '#E8E8E8',
    lineHeight: 20,
  },
  goalTextDone: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  deleteButton: {
    padding: 6,
    marginLeft: 8,
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#232323',
    backgroundColor: '#0D0D0D',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#E8E8E8',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  saveGoalButton: {
    backgroundColor: '#1D9E75',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 52,
    alignItems: 'center',
  },
  saveGoalButtonDisabled: {
    opacity: 0.4,
  },
  saveGoalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelInputButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  cancelInputText: {
    color: '#888',
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginTop: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
});

export default YearlyGoalsScreen;
