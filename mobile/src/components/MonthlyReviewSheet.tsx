import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';

// Hero stats for the prior month, served by GET /api/stats/monthly-review.
export interface MonthlyReviewData {
  month: string; // YYYY-MM
  monthLabel: string; // "June 2026"
  daysLogged: number;
  avgOverall: number;
  routineCompleted: number;
  routineTotal: number;
  gymSessions: number;
  monthlyGoalsCompleted: number;
  monthlyGoalsTotal: number;
  bestDay: { date: string; percentage: number } | null;
}

interface MonthlyReviewSheetProps {
  data: MonthlyReviewData | null;
}

const StatTile: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.tile}>
    <Text style={styles.tileValue}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

const formatBestDay = (dateStr: string): string => {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const MonthlyReviewSheet = forwardRef<React.ElementRef<typeof BottomSheetModal>, MonthlyReviewSheetProps>(
  ({ data }, ref) => {
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {data && (
            <>
              <Text style={styles.kicker}>MONTHLY REVIEW</Text>
              <Text style={styles.title}>{data.monthLabel}</Text>

              <View style={styles.heroRow}>
                <Text style={styles.heroValue}>{data.avgOverall}%</Text>
                <Text style={styles.heroLabel}>average momentum across {data.daysLogged} logged days</Text>
              </View>

              <View style={styles.tileGrid}>
                <StatTile
                  value={`${data.routineCompleted}/${data.routineTotal}`}
                  label="routine tasks done"
                />
                <StatTile value={String(data.gymSessions)} label="gym sessions" />
                <StatTile
                  value={`${data.monthlyGoalsCompleted}/${data.monthlyGoalsTotal}`}
                  label="monthly goals hit"
                />
                <StatTile
                  value={data.bestDay ? `${data.bestDay.percentage}%` : '—'}
                  label={data.bestDay ? `best day · ${formatBestDay(data.bestDay.date)}` : 'best day'}
                />
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#161616',
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
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#D9A03F',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E8E8E8',
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 20,
  },
  heroValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#7B9EFF',
  },
  heroLabel: {
    flex: 1,
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#1C1C1C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 14,
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E8E8E8',
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 11,
    color: '#888',
  },
});

export default MonthlyReviewSheet;
