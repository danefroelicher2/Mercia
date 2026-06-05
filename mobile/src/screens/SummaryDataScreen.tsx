import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

interface WeekData {
  week_start: string;
  week_end: string;
  total_possible: number;
  total_completed: number;
  percentage: number;
}

interface MonthData {
  year: number;
  month: number;
  total_possible: number;
  total_completed: number;
  percentage: number;
}

interface SummaryData {
  current_week: WeekData;
  weeks: WeekData[];
  months: MonthData[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ProgressCardProps {
  label: string;
  sublabel: string;
  total_completed: number;
  total_possible: number;
  percentage: number;
  dimmed?: boolean;
}

const ProgressCard: React.FC<ProgressCardProps> = ({
  label,
  sublabel,
  total_completed,
  total_possible,
  percentage,
  dimmed = false,
}) => (
  <View style={[styles.card, dimmed && styles.cardDimmed]}>
    <View style={styles.cardHeader}>
      <View>
        <Text style={[styles.cardLabel, dimmed && styles.cardLabelDimmed]}>{label}</Text>
        <Text style={styles.cardSublabel}>{sublabel}</Text>
      </View>
      <Text style={[styles.cardCount, dimmed && styles.cardCountDimmed]}>
        {total_completed} / {total_possible}
      </Text>
    </View>
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${total_possible > 0 ? percentage : 0}%` }, dimmed && styles.progressFillDimmed]} />
    </View>
    <Text style={styles.cardPct}>{percentage}% completion</Text>
  </View>
);

const SummaryDataScreen: React.FC = () => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await api.get('/api/routine/summary-data', { params: { timezone } });
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('[SummaryData] Error loading:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#1D9E75" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No Today items set up yet. Add tasks in your Routine to see weekly completion data here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { current_week, weeks, months } = data;
  const hasStoredData = weeks.length > 0 || months.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Current week — always at top */}
        <ProgressCard
          label="This Week"
          sublabel={`${formatDateShort(current_week.week_start)} – ${formatDateShort(current_week.week_end)}`}
          total_completed={current_week.total_completed}
          total_possible={current_week.total_possible}
          percentage={current_week.percentage}
        />

        {/* Prior weeks of current month */}
        {weeks.map((week) => (
          <ProgressCard
            key={week.week_start}
            label={`${formatDateShort(week.week_start)} – ${formatDateShort(week.week_end)}`}
            sublabel="Weekly"
            total_completed={week.total_completed}
            total_possible={week.total_possible}
            percentage={week.percentage}
            dimmed
          />
        ))}

        {/* Monthly rollups */}
        {months.map((m) => (
          <ProgressCard
            key={`${m.year}-${m.month}`}
            label={`${MONTH_NAMES[m.month - 1]} ${m.year}`}
            sublabel="Monthly"
            total_completed={m.total_completed}
            total_possible={m.total_possible}
            percentage={m.percentage}
            dimmed
          />
        ))}

        {!hasStoredData && current_week.total_possible === 0 && (
          <Text style={styles.emptyText}>
            No Today items set up yet. Add tasks in your Routine to see completion data here.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Card
  card: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#232323',
  },
  cardDimmed: {
    borderColor: '#1E1E1E',
    backgroundColor: '#131313',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 2,
  },
  cardLabelDimmed: {
    color: '#AAAAAA',
  },
  cardSublabel: {
    fontSize: 11,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D9E75',
  },
  cardCountDimmed: {
    color: '#1A7A5A',
  },
  progressTrack: {
    height: 7,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1D9E75',
    borderRadius: 4,
  },
  progressFillDimmed: {
    backgroundColor: '#1A7A5A',
  },
  cardPct: {
    fontSize: 12,
    color: '#666',
  },
});

export default SummaryDataScreen;
