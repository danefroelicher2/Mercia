import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { RoutineTask } from '../types/routine';

// Shared visual language with the rest of the app (dark cards, teal/blue accents).
const C = {
  sheetBg: '#161616',
  border: '#232323',
  rowBg: '#1C1C1C',
  textPrimary: '#E8E8E8',
  textSecondary: '#888',
  textTertiary: '#666',
  teal: '#00D9A0',
  blue: '#7B9EFF',
  barTrack: '#252525',
};

// ============================================
// TODAY RING SHEET — the receipt for the number
// ============================================

interface TodayRingSheetProps {
  percentage: number;
  tasks: RoutineTask[];
  onGoToRoutine: () => void;
}

export const TodayRingSheet = forwardRef<React.ElementRef<typeof BottomSheetModal>, TodayRingSheetProps>(
  ({ percentage, tasks, onGoToRoutine }, ref) => {
    const remaining = tasks.filter(t => !t.completed).length;

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>
            Today — <Text style={{ color: C.teal }}>{percentage}%</Text>
          </Text>

          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>No tasks set for today yet.</Text>
          ) : (
            tasks.map(task => (
              <View key={task.id} style={styles.taskRow}>
                <View style={[styles.taskCheck, task.completed && styles.taskCheckDone]}>
                  {task.completed && <View style={styles.taskCheckInner} />}
                </View>
                <Text
                  style={[styles.taskText, task.completed && styles.taskTextDone]}
                  numberOfLines={2}
                >
                  {task.text}
                </Text>
                {(task.target_count ?? 1) > 1 && !task.completed && (
                  <View style={styles.countChip}>
                    <Text style={styles.countChipText}>
                      {(task.target_count ?? 1) - (task.current_count ?? 1)}/{task.target_count}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}

          {tasks.length > 0 && (
            <Text style={styles.footerText}>
              {remaining === 0
                ? 'All done — full ring ✓'
                : `${remaining} left · finish by midnight`}
            </Text>
          )}

          <TouchableOpacity style={styles.linkButton} onPress={onGoToRoutine}>
            <Text style={[styles.linkText, { color: C.teal }]}>Go to Routine →</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

// ============================================
// MOMENTUM RING SHEET — the composite, decomposed
// ============================================

export interface MomentumCategory {
  active: boolean;
  percent: number; // 0-100 earned within the category
  weight: number;
  detail: string; // right-side caption, e.g. "4/6 done"
}

export interface MomentumData {
  percentage: number;
  routine: MomentumCategory;
  gym: MomentumCategory & { done: number; target: number; isDefaultTarget: boolean };
  weekly: MomentumCategory;
  monthly: MomentumCategory;
}

interface MomentumRingSheetProps {
  data: MomentumData | null;
  isSavingTarget: boolean;
  onChangeGymTarget: (targetDays: number) => void;
}

const CategoryRow: React.FC<{ name: string; category: MomentumCategory }> = ({ name, category }) => (
  <View style={styles.categoryRow}>
    <View style={styles.categoryHeader}>
      <Text style={styles.categoryName}>{name}</Text>
      <Text style={styles.categoryDetail}>{category.active ? category.detail : 'None set'}</Text>
    </View>
    <View style={styles.barRow}>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${category.active ? Math.min(100, Math.max(0, category.percent)) : 0}%` },
            !category.active && { backgroundColor: C.textTertiary },
          ]}
        />
      </View>
      <Text style={styles.categoryPercent}>
        {category.active ? `${Math.round(category.percent)}%` : '—'}
      </Text>
      <Text style={styles.categoryWeight}>({category.weight}%)</Text>
    </View>
  </View>
);

export const MomentumRingSheet = forwardRef<React.ElementRef<typeof BottomSheetModal>, MomentumRingSheetProps>(
  ({ data, isSavingTarget, onChangeGymTarget }, ref) => {
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {data == null ? (
            <ActivityIndicator color={C.blue} style={{ marginVertical: 32 }} />
          ) : (
            <>
              <Text style={styles.title}>
                Momentum — <Text style={{ color: C.blue }}>{data.percentage}%</Text>
              </Text>
              <Text style={styles.subtitle}>
                Weighted across your active categories. Inactive ones don't count against you.
              </Text>

              <CategoryRow name="Routine" category={data.routine} />
              <CategoryRow name="Gym" category={data.gym} />

              {/* Gym weekly target editor — lives right where the score comes from */}
              <View style={styles.targetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.targetLabel}>Weekly gym target</Text>
                  <Text style={styles.targetCaption}>
                    {data.gym.done} of {data.gym.target} days this week
                    {data.gym.isDefaultTarget ? '  ·  default — set yours' : ''}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepperButton, (isSavingTarget || data.gym.target <= 1) && styles.stepperDisabled]}
                    disabled={isSavingTarget || data.gym.target <= 1}
                    onPress={() => onChangeGymTarget(data.gym.target - 1)}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{data.gym.target}</Text>
                  <TouchableOpacity
                    style={[styles.stepperButton, (isSavingTarget || data.gym.target >= 7) && styles.stepperDisabled]}
                    disabled={isSavingTarget || data.gym.target >= 7}
                    onPress={() => onChangeGymTarget(data.gym.target + 1)}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <CategoryRow name="Weekly goals" category={data.weekly} />
              <CategoryRow name="Monthly goals" category={data.monthly} />
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: C.sheetBg,
  },
  handleIndicator: {
    backgroundColor: '#555',
    width: 36,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: C.textTertiary,
    marginBottom: 16,
    lineHeight: 17,
  },
  emptyText: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 16,
  },

  // Today sheet
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  taskCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskCheckDone: {
    borderColor: C.teal,
  },
  taskCheckInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.teal,
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    color: C.textPrimary,
  },
  taskTextDone: {
    color: C.textSecondary,
    textDecorationLine: 'line-through',
  },
  countChip: {
    minWidth: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 160, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  countChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.teal,
  },
  footerText: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 14,
  },
  linkButton: {
    marginTop: 12,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Momentum sheet
  categoryRow: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
  },
  categoryDetail: {
    fontSize: 11,
    color: C.textSecondary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.barTrack,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: C.blue,
  },
  categoryPercent: {
    width: 42,
    fontSize: 12,
    fontWeight: '600',
    color: C.textPrimary,
    textAlign: 'right',
  },
  categoryWeight: {
    width: 40,
    fontSize: 11,
    color: C.textTertiary,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.rowBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginTop: -6,
    marginBottom: 16,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 2,
  },
  targetCaption: {
    fontSize: 11,
    color: C.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  stepperButtonText: {
    fontSize: 17,
    color: C.textPrimary,
    lineHeight: 20,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    color: C.blue,
    minWidth: 18,
    textAlign: 'center',
  },
});
