import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { WeeklySummary } from '../types/summary';

const colors = {
  screenBg: '#1A1A1A',
  cardBg: '#2A2A2A',
  sectionBg: '#333333',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#707070',
  primary: '#FF6B35',
  success: '#00FF00',
  error: '#FF0000',
  border: '#3A3A3A',
};

interface WeeklySummaryModalProps {
  visible: boolean;
  summary: WeeklySummary | null;
  onDismiss: () => void;
  onSave?: (summaryId: string) => Promise<void>;
  readOnly?: boolean;
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

function getWeekOfMonth(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00');
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  return Math.ceil(dayOfMonth / 7);
}

const WeeklySummaryModal: React.FC<WeeklySummaryModalProps> = ({
  visible,
  summary,
  onDismiss,
  onSave,
  readOnly = false,
}) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(summary?.is_saved || false);

  // Reset saved state when summary changes
  React.useEffect(() => {
    setSaved(summary?.is_saved || false);
  }, [summary?.id]);

  if (!summary) return null;

  const handleSave = async () => {
    if (!onSave || saved) return;
    setSaving(true);
    try {
      await onSave(summary.id);
      setSaved(true);
      Alert.alert('Saved', 'Summary saved to your profile!');
    } catch {
      Alert.alert('Error', 'Failed to save summary.');
    } finally {
      setSaving(false);
    }
  };

  const overallPercentage = Math.round(
    (summary.nonnegotiables_percentage +
      summary.nicetohaves_percentage +
      summary.weekly_goals_percentage) / 3
  );

  const weekOfMonth = getWeekOfMonth(summary.week_start_date);
  const showMonthlySection = weekOfMonth >= 2;

  // Check if this is the first-ever summary (no previous week data)
  const isFirstSummary = summary.improvement_percentage === 0 && !summary.is_improvement;
  // We'll show performance section only if there's meaningful data
  // A zero improvement with is_improvement=false could be first week OR genuinely no change
  // We'll show it unless it looks like a first summary (both zero and no change)

  const renderIncompleteData = () => (
    <View style={styles.incompleteContainer}>
      <Text style={styles.incompleteIcon}>📋</Text>
      <Text style={styles.incompleteTitle}>Insufficient Data</Text>
      <Text style={styles.incompleteText}>
        Complete a full week (Monday–Sunday) to see your first summary. Check back next Monday!
      </Text>
    </View>
  );

  const renderStats = () => (
    <>
      {/* Overall */}
      <View style={styles.overallSection}>
        <Text style={styles.overallPercentage}>{overallPercentage}%</Text>
        <Text style={styles.overallLabel}>Overall Completion</Text>
      </View>

      {/* Daily Tasks Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Tasks</Text>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Non-Negotiables</Text>
          <Text style={styles.statValue}>
            {summary.nonnegotiables_completed}/{summary.nonnegotiables_total}{' '}
            <Text style={styles.statPercentage}>({summary.nonnegotiables_percentage}%)</Text>
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Nice-to-Haves</Text>
          <Text style={styles.statValue}>
            {summary.nicetohaves_completed}/{summary.nicetohaves_total}{' '}
            <Text style={styles.statPercentage}>({summary.nicetohaves_percentage}%)</Text>
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Best Day (Combined)</Text>
          <Text style={styles.statValueHighlight}>{summary.best_day_combined}</Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Most Consistent Day</Text>
          <Text style={styles.statValueHighlight}>{summary.most_consistent_day}</Text>
        </View>

        {summary.tasks_missed_frequently && summary.tasks_missed_frequently.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.missedTitle}>Frequently Missed</Text>
            {summary.tasks_missed_frequently.slice(0, 3).map((item, idx) => (
              <Text key={idx} style={styles.missedItem}>
                {item.task_name}: {item.times_missed}/7 missed
              </Text>
            ))}
          </>
        )}
      </View>

      {/* Weekly Goals Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Goals</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>
            {summary.weekly_goals_completed}/{summary.weekly_goals_total}{' '}
            <Text style={styles.statPercentage}>({summary.weekly_goals_percentage}%)</Text>
          </Text>
        </View>
      </View>

      {/* Monthly Goals Section (hide for week 1 of month) */}
      {showMonthlySection && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Goals</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Completed This Month</Text>
            <Text style={styles.statValue}>{summary.monthly_goals_total}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Change from Last Week</Text>
            <Text style={[
              styles.statValue,
              summary.monthly_goals_change_from_last_week > 0 && { color: colors.success },
            ]}>
              {summary.monthly_goals_change_from_last_week > 0 ? '+' : ''}
              {summary.monthly_goals_change_from_last_week}
            </Text>
          </View>
        </View>
      )}

      {/* Performance Section (hide for first summary) */}
      {!isFirstSummary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance</Text>
          <View style={styles.performanceRow}>
            <Text style={[
              styles.performanceIndicator,
              { color: summary.is_improvement ? colors.success : colors.error },
            ]}>
              {summary.is_improvement ? '↑' : '↓'} {Math.abs(summary.improvement_percentage)}%
            </Text>
            <Text style={styles.performanceLabel}>
              {summary.is_improvement ? 'improvement' : 'decrease'} from last week
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Weekly Summary</Text>
            <Text style={styles.headerDate}>
              {formatDateRange(summary.week_start_date, summary.week_end_date)}
            </Text>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {summary.has_complete_data ? renderStats() : renderIncompleteData()}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            {!readOnly && (
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saved && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={saved || saving}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.saveButtonText,
                  saved && styles.saveButtonTextDisabled,
                ]}>
                  {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save to Profile'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerDate: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  overallSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  overallPercentage: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.primary,
  },
  overallLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    backgroundColor: colors.sectionBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statPercentage: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  statValueHighlight: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  missedTitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  missedItem: {
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 3,
  },
  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  performanceIndicator: {
    fontSize: 20,
    fontWeight: '700',
  },
  performanceLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  incompleteContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  incompleteIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  incompleteTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  incompleteText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.sectionBg,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveButtonTextDisabled: {
    color: colors.textTertiary,
  },
  dismissButton: {
    flex: 1,
    backgroundColor: colors.sectionBg,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default WeeklySummaryModal;
