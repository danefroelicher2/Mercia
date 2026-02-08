import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { RoutineTask, RoutineGoal, DayOfWeek } from '../types/routine';

const colors = {
  screenBg: '#1A1A1A',
  cardBg: '#2A2A2A',
  inputBg: '#333333',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#707070',
  primary: '#FF6B35',
  border: '#3A3A3A',
  success: '#00D9A0',
};

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const RoutineScreen: React.FC = () => {
  const { user } = useAuth();

  // State
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<RoutineGoal[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<RoutineGoal[]>([]);

  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const [newTaskText, setNewTaskText] = useState('');
  const [newGoalText, setNewGoalText] = useState('');

  const [taskType, setTaskType] = useState<'non-negotiable' | 'nice-to-have'>('non-negotiable');
  const [goalType, setGoalType] = useState<'weekly' | 'monthly'>('weekly');

  const [refreshing, setRefreshing] = useState(false);

  // Get today's day on mount
  useEffect(() => {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayIndex = today === 0 ? 6 : today - 1; // Convert to Mon=0, Tue=1, ..., Sun=6
    setSelectedDay(DAYS[dayIndex]);
  }, []);

  // Load data when day changes
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedDay]);

  const loadData = async () => {
    try {
      await Promise.all([
        loadTasks(),
        loadWeeklyGoals(),
        loadMonthlyGoals(),
      ]);
    } catch (error) {
      console.error('[RoutineScreen] Error loading data:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const response = await api.get(`/api/routine/tasks/${selectedDay}`);
      if (response.data.success) {
        setTasks(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading tasks:', error);
    }
  };

  const loadWeeklyGoals = async () => {
    try {
      const response = await api.get('/api/routine/goals/weekly');
      if (response.data.success) {
        setWeeklyGoals(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading weekly goals:', error);
    }
  };

  const loadMonthlyGoals = async () => {
    try {
      const response = await api.get('/api/routine/goals/monthly');
      if (response.data.success) {
        setMonthlyGoals(response.data.data);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error loading monthly goals:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Task handlers
  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;

    try {
      const response = await api.post('/api/routine/tasks', {
        text: newTaskText.trim(),
        type: taskType,
        dayOfWeek: selectedDay,
      });

      if (response.data.success) {
        setTasks([...tasks, response.data.data]);
        setNewTaskText('');
        setTaskModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const response = await api.patch(`/api/routine/tasks/${taskId}`, {
        completed: !currentStatus,
      });

      if (response.data.success) {
        setTasks(tasks.map(t =>
          t.id === taskId ? { ...t, completed: !currentStatus } : t
        ));
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling task:', error);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/routine/tasks/${taskId}`);
              setTasks(tasks.filter(t => t.id !== taskId));
            } catch (error) {
              console.error('[RoutineScreen] Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task.');
            }
          },
        },
      ]
    );
  };

  // Goal handlers
  const handleAddGoal = async () => {
    if (!newGoalText.trim()) return;

    try {
      const response = await api.post('/api/routine/goals', {
        text: newGoalText.trim(),
        type: goalType,
      });

      if (response.data.success) {
        if (goalType === 'weekly') {
          setWeeklyGoals([...weeklyGoals, response.data.data]);
        } else {
          setMonthlyGoals([...monthlyGoals, response.data.data]);
        }
        setNewGoalText('');
        setGoalModalVisible(false);
      }
    } catch (error) {
      console.error('[RoutineScreen] Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal. Please try again.');
    }
  };

  const handleToggleGoal = async (goalId: string, currentStatus: boolean, type: 'weekly' | 'monthly') => {
    try {
      const response = await api.patch(`/api/routine/goals/${goalId}`, {
        completed: !currentStatus,
      });

      if (response.data.success) {
        if (type === 'weekly') {
          setWeeklyGoals(weeklyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        } else {
          setMonthlyGoals(monthlyGoals.map(g =>
            g.id === goalId ? { ...g, completed: !currentStatus } : g
          ));
        }
      }
    } catch (error) {
      console.error('[RoutineScreen] Error toggling goal:', error);
    }
  };

  const handleDeleteGoal = (goalId: string, type: 'weekly' | 'monthly') => {
    Alert.alert(
      'Delete Goal',
      'Are you sure you want to delete this goal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/routine/goals/${goalId}`);
              if (type === 'weekly') {
                setWeeklyGoals(weeklyGoals.filter(g => g.id !== goalId));
              } else {
                setMonthlyGoals(monthlyGoals.filter(g => g.id !== goalId));
              }
            } catch (error) {
              console.error('[RoutineScreen] Error deleting goal:', error);
              Alert.alert('Error', 'Failed to delete goal.');
            }
          },
        },
      ]
    );
  };

  // Filter tasks by type
  const nonNegotiables = tasks.filter(t => t.type === 'non-negotiable');
  const niceToHave = tasks.filter(t => t.type === 'nice-to-have');

  // Render helpers
  const renderDaySwitcher = () => (
    <View style={styles.daySwitcherContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {DAYS.map((day, index) => (
          <TouchableOpacity
            key={day}
            onPress={() => setSelectedDay(day)}
            style={[
              styles.dayButton,
              selectedDay === day && styles.activeDayButton,
            ]}
          >
            <Text style={[
              styles.dayText,
              selectedDay === day && styles.activeDayText,
            ]}>
              {DAY_LABELS[index]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderTaskItem = (task: RoutineTask) => (
    <View key={task.id} style={styles.taskItem}>
      <TouchableOpacity
        onPress={() => handleToggleTask(task.id, task.completed)}
        style={styles.checkbox}
      >
        {task.completed && (
          <View style={styles.checkboxChecked}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[
        styles.taskText,
        task.completed && styles.taskTextCompleted,
      ]}>
        {task.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteTask(task.id)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGoalItem = (goal: RoutineGoal) => (
    <View key={goal.id} style={styles.taskItem}>
      <TouchableOpacity
        onPress={() => handleToggleGoal(goal.id, goal.completed, goal.type)}
        style={styles.checkbox}
      >
        {goal.completed && (
          <View style={styles.checkboxChecked}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[
        styles.taskText,
        goal.completed && styles.taskTextCompleted,
      ]}>
        {goal.text}
      </Text>

      <TouchableOpacity
        onPress={() => handleDeleteGoal(goal.id, goal.type)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSection = (
    title: string,
    items: any[],
    onAddPress: () => void,
    renderItem: (item: any) => React.ReactNode
  ) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={onAddPress} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>Nothing here yet</Text>
      ) : (
        items.map(renderItem)
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderDaySwitcher()}

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {renderSection(
          'Non-Negotiables',
          nonNegotiables,
          () => {
            setTaskType('non-negotiable');
            setTaskModalVisible(true);
          },
          renderTaskItem
        )}

        {renderSection(
          'Nice to Have',
          niceToHave,
          () => {
            setTaskType('nice-to-have');
            setTaskModalVisible(true);
          },
          renderTaskItem
        )}

        {renderSection(
          'Weekly Goals',
          weeklyGoals,
          () => {
            setGoalType('weekly');
            setGoalModalVisible(true);
          },
          renderGoalItem
        )}

        {renderSection(
          'Monthly Goals',
          monthlyGoals,
          () => {
            setGoalType('monthly');
            setGoalModalVisible(true);
          },
          renderGoalItem
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Task</Text>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  taskType === 'non-negotiable' && styles.typeButtonActive,
                ]}
                onPress={() => setTaskType('non-negotiable')}
              >
                <Text style={[
                  styles.typeButtonText,
                  taskType === 'non-negotiable' && styles.typeButtonTextActive,
                ]}>
                  Non-Negotiable
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  taskType === 'nice-to-have' && styles.typeButtonActive,
                ]}
                onPress={() => setTaskType('nice-to-have')}
              >
                <Text style={[
                  styles.typeButtonText,
                  taskType === 'nice-to-have' && styles.typeButtonTextActive,
                ]}>
                  Nice to Have
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter task..."
              placeholderTextColor={colors.textTertiary}
              value={newTaskText}
              onChangeText={setNewTaskText}
              autoFocus
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setTaskModalVisible(false);
                  setNewTaskText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddTask}
              >
                <Text style={styles.saveButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Goal Modal */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Goal</Text>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'weekly' && styles.typeButtonActive,
                ]}
                onPress={() => setGoalType('weekly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'weekly' && styles.typeButtonTextActive,
                ]}>
                  Weekly
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  goalType === 'monthly' && styles.typeButtonActive,
                ]}
                onPress={() => setGoalType('monthly')}
              >
                <Text style={[
                  styles.typeButtonText,
                  goalType === 'monthly' && styles.typeButtonTextActive,
                ]}>
                  Monthly
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter goal..."
              placeholderTextColor={colors.textTertiary}
              value={newGoalText}
              onChangeText={setNewGoalText}
              autoFocus
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setGoalModalVisible(false);
                  setNewGoalText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddGoal}
              >
                <Text style={styles.saveButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  // Day Switcher
  daySwitcherContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: colors.inputBg,
  },
  activeDayButton: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeDayText: {
    color: colors.textPrimary,
  },

  // Content
  scrollContent: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  addButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },

  // Task/Goal Items
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  taskText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 24,
    color: colors.textTertiary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typeButtonTextActive: {
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: colors.textPrimary,
    backgroundColor: colors.inputBg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

export default RoutineScreen;
