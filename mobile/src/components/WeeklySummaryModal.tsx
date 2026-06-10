import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { WeeklySummary } from '../types/summary';

const C = {
  bg: '#2A2A2A',
  section: '#333333',
  border: '#3A3A3A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#666666',
  primary: '#FF6B35',
  teal: '#00D9A0',
  blue: '#7B9EFF',
  red: '#FF4444',
  trackOrange: '#3A2A20',
  trackTeal: '#1A3030',
  trackBlue: '#1A1E30',
};

interface Props {
  visible: boolean;
  summary: WeeklySummary | null;
  onDismiss: () => void;
  onSave?: (summaryId: string) => Promise<void>;
  onDelete?: (summaryId: string) => Promise<void>;
  readOnly?: boolean;
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Progress Ring ────────────────────────────────────────────────────────────

interface RingProps {
  percentage: number;
  color: string;
  trackColor: string;
  size?: number;
  stroke?: number;
}

function ProgressRing({ percentage, color, trackColor, size = 86, stroke = 8 }: RingProps) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * (Math.min(Math.max(percentage, 0), 100) / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* track */}
        <Circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* progress */}
        <Circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={[filled, circumference - filled]}
          strokeLinecap="round"
          rotation={-90}
          originX={cx}
          originY={cx}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.ringInner}>
          <Text style={styles.ringPct}>{percentage}%</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const WeeklySummaryModal: React.FC<Props> = ({
  visible,
  summary,
  onDismiss,
  onSave,
  onDelete,
  readOnly = false,
  loading = false,
}) => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(summary?.is_saved || false);
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    setSaved(summary?.is_saved || false);
  }, [summary?.id]);

  if (!summary && !loading) return null;

  const handleDelete = () => {
    if (!onDelete || !summary) return;
    Alert.alert(
      'Delete Summary',
      'This will permanently remove this summary. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(summary.id);
            } catch {
              Alert.alert('Error', 'Failed to delete summary.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!onSave || saved || !summary) return;
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

  // Overall: use stored value or fall back to computed
  const overallPct = summary?.overall_percentage ?? 0;

  const yesterdayPct = summary?.yesterday_overall_percentage ?? 0;
  const perfDelta = overallPct - yesterdayPct;
  const showPerf = summary?.yesterday_overall_percentage != null && summary?.yesterday_overall_percentage > 0;

  const missedTasks = summary?.tasks_missed_frequently || [];
  const gymDays = summary?.gym_days_this_week ?? null;
  const gymPossible = summary?.gym_days_possible ?? 1;
  const completedWeekly = summary?.completed_weekly_goal_texts || [];
  const completedMonthly = summary?.completed_monthly_goal_texts || [];

  const weeklyChange = summary?.weekly_goals_change_today ?? 0;
  const monthlyChange = summary?.monthly_goals_change_today ?? 0;

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={C.teal} />
      <Text style={styles.loadingTitle}>Aggregating latest metrics</Text>
      <Text style={styles.loadingSubtitle}>Pulling your most recent data…</Text>
    </View>
  );

  const renderContent = () => (
    <>
      {/* ① THREE RINGS */}
      <View style={styles.ringsRow}>
        <View style={styles.ringItem}>
          <ProgressRing
            percentage={summary?.nonnegotiables_percentage ?? 0}
            color={C.primary}
            trackColor={C.trackOrange}
          />
          <Text style={[styles.ringLabel, { color: C.primary }]}>Required</Text>
        </View>

        <View style={styles.ringItem}>
          <ProgressRing
            percentage={overallPct}
            color={C.teal}
            trackColor={C.trackTeal}
            size={94}
            stroke={9}
          />
          <Text style={[styles.ringLabel, { color: C.teal }]}>Overall</Text>
        </View>

      </View>

      {/* ② PERFORMANCE */}
      {showPerf && (
        <View style={[
          styles.perfCard,
          perfDelta >= 0 ? styles.perfCardUp : styles.perfCardDown,
        ]}>
          <Text style={[
            styles.perfArrow,
            { color: perfDelta >= 0 ? C.teal : C.red },
          ]}>
            {perfDelta >= 0 ? '↑' : '↓'}
          </Text>
          <Text style={[
            styles.perfDelta,
            { color: perfDelta >= 0 ? C.teal : C.red },
          ]}>
            {perfDelta >= 0 ? '+' : ''}{perfDelta}%
          </Text>
          <Text style={styles.perfText}>from yesterday</Text>
        </View>
      )}

      {/* ③ MISSED TODAY */}
      {missedTasks.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Missed Yesterday</Text>
          {missedTasks.map((item, i) => (
            <View
              key={item.task_id ?? i}
              style={[styles.missedRow, i < missedTasks.length - 1 && styles.missedRowBorder]}
            >
              <View style={[styles.dot, { backgroundColor: C.textTertiary }]} />
              <Text style={styles.missedText}>{item.task_name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ④ GYM THIS WEEK */}
      {gymDays !== null && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gym This Week</Text>
          <View style={styles.gymRow}>
            <Text style={styles.gymCount}>{gymDays}</Text>
            <Text style={styles.gymOf}> / {gymPossible} days</Text>
          </View>
          <View style={styles.gymBar}>
            <View
              style={[
                styles.gymBarFill,
                { width: `${Math.round((gymDays / gymPossible) * 100)}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* ⑥ WEEKLY GOALS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Weekly Goals</Text>
          <Text style={styles.cardPct}>{summary?.weekly_goals_percentage ?? 0}%</Text>
        </View>
        <Text style={styles.completedLabel}>Completed</Text>
        {completedWeekly.length > 0 ? (
          completedWeekly.map((text, i) => (
            <View
              key={i}
              style={[styles.goalRow, i < completedWeekly.length - 1 && styles.goalRowBorder]}
            >
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.goalText}>{text}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noneText}>None today</Text>
        )}
        {weeklyChange > 0 && (
          <View style={styles.changeBadge}>
            <Text style={styles.changeBadgeText}>↑ +{weeklyChange} since yesterday</Text>
          </View>
        )}
      </View>

      {/* ⑥ MONTHLY GOALS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Monthly Goals</Text>
          <Text style={styles.cardPct}>{summary?.monthly_goals_percentage ?? 0}%</Text>
        </View>
        <Text style={styles.completedLabel}>Completed</Text>
        {completedMonthly.length > 0 ? (
          completedMonthly.map((text, i) => (
            <View
              key={i}
              style={[styles.goalRow, i < completedMonthly.length - 1 && styles.goalRowBorder]}
            >
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.goalText}>{text}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noneText}>None today</Text>
        )}
        {monthlyChange > 0 && (
          <View style={styles.changeBadge}>
            <Text style={styles.changeBadgeText}>↑ +{monthlyChange} since yesterday</Text>
          </View>
        )}
      </View>
    </>
  );

  const renderNoData = () => (
    <View style={styles.noDataContainer}>
      <Text style={styles.noDataIcon}>📋</Text>
      <Text style={styles.noDataTitle}>No Data Yet</Text>
      <Text style={styles.noDataText}>
        Complete tasks or log your day to see your daily summary.
      </Text>
    </View>
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
          {/* Handle bar */}
          <View style={styles.handle}><View style={styles.handleBar} /></View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Yesterday's Summary</Text>
            <Text style={styles.headerDate}>{summary ? formatDate(summary.week_start_date) : ''}</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? renderLoading() : summary?.has_complete_data ? renderContent() : renderNoData()}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            {!readOnly && (
              <TouchableOpacity
                style={[styles.btnPrimary, saved && styles.btnPrimaryDone]}
                onPress={handleSave}
                disabled={saved || saving}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnPrimaryText, saved && styles.btnPrimaryTextDone]}>
                  {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save to Profile'}
                </Text>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.btnDelete}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <Text style={styles.btnDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnSecondary} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.btnSecondaryText}>Close</Text>
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '88%',
    paddingBottom: 34,
  },
  handle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: '#555',
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.textPrimary,
  },
  headerDate: {
    fontSize: 13,
    color: C.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  // ── Rings ──
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 24,
    paddingTop: 4,
  },
  ringItem: {
    alignItems: 'center',
    gap: 8,
  },
  ringInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Performance ──
  perfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  perfCardUp: {
    backgroundColor: 'rgba(0,217,160,0.08)',
    borderColor: 'rgba(0,217,160,0.2)',
  },
  perfCardDown: {
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderColor: 'rgba(255,68,68,0.2)',
  },
  perfArrow: {
    fontSize: 16,
  },
  perfDelta: {
    fontSize: 16,
    fontWeight: '700',
  },
  perfText: {
    fontSize: 14,
    color: C.textSecondary,
  },

  // ── Cards ──
  card: {
    backgroundColor: C.section,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.textSecondary,
    marginBottom: 8,
  },
  cardPct: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 8,
  },

  // ── Missed ──
  missedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  missedRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  missedText: {
    flex: 1,
    fontSize: 14,
    color: '#D0D0D0',
  },
  // ── Gym ──
  gymRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  gymCount: {
    fontSize: 28,
    fontWeight: '700',
    color: C.teal,
  },
  gymOf: {
    fontSize: 16,
    color: C.textSecondary,
  },
  gymBar: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  gymBarFill: {
    height: 4,
    backgroundColor: C.teal,
    borderRadius: 2,
  },

  // ── Goals ──
  completedLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: C.textTertiary,
    marginBottom: 6,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
  },
  goalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,217,160,0.15)',
    borderWidth: 1.5,
    borderColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkMark: {
    fontSize: 9,
    color: C.teal,
    fontWeight: '700',
  },
  goalText: {
    flex: 1,
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 20,
  },
  noneText: {
    fontSize: 14,
    color: C.textTertiary,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  changeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,217,160,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  changeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.teal,
  },

  // ── No data ──
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noDataTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 10,
  },
  noDataText: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  // ── Loading ──
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ── Buttons ──
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  btnPrimaryDone: {
    backgroundColor: C.section,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
  },
  btnPrimaryTextDone: {
    color: C.textTertiary,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  btnSecondaryText: {
    fontSize: 15,
    color: C.textSecondary,
  },
  btnDelete: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.4)',
  },
  btnDeleteText: {
    fontSize: 15,
    color: C.red,
  },
});

export default WeeklySummaryModal;
