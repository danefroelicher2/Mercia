import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import api from '../services/api';

// One completed year, Wrapped-style: Mercia's retrospective paragraph at the
// top (generated once from the FULL stat set, then cached server-side),
// statistics below.

interface RankedItem {
  text?: string;
  name?: string;
  count: number;
}

interface YearReview {
  year: number;
  startedDate: string | null;
  totalActions: number;
  gymDaysLogged: number;
  perfectDays: number;
  tasksCompleted: number;
  goalsCompleted: number;
  chatsSent: number;
  topWorkouts: RankedItem[];
  topTodayItems: RankedItem[];
  topWeeklyItems: RankedItem[];
  longestStreak: { length: number; start: string; end: string } | null;
  bestMonth: { month: string; label: string; avgMomentum: number } | null;
  narrative: string | null;
}

const GOLD = '#D9A03F';

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const RankedList: React.FC<{ title: string; items: RankedItem[]; emptyText: string }> = ({
  title,
  items,
  emptyText,
}) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionLabel}>{title}</Text>
    {items.length === 0 ? (
      <Text style={styles.rankEmpty}>{emptyText}</Text>
    ) : (
      items.map((item, index) => (
        <View key={`${item.text ?? item.name}-${index}`} style={styles.rankRow}>
          <Text style={styles.rankNumber}>{index + 1}</Text>
          <Text style={styles.rankText} numberOfLines={1}>
            {item.text ?? item.name}
          </Text>
          <Text style={styles.rankCount}>{item.count}×</Text>
        </View>
      ))
    )}
  </View>
);

const StatTile: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.tile}>
    <Text style={styles.tileValue}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

const YearlyReviewDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const year: number = route.params?.year;
  const [review, setReview] = useState<YearReview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await api.get(`/api/stats/yearly-review/${year}?timezone=${encodeURIComponent(timezone)}`);
        setReview(res.data.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [year]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={GOLD} />
        <Text style={styles.loadingText}>Mercia is writing your year…</Text>
      </View>
    );
  }

  if (!review) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Nothing to show for {year}.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.yearTitle}>{review.year}</Text>
        {review.startedDate && (
          <Text style={styles.startedNote}>Started {formatDate(review.startedDate)} — a partial first year</Text>
        )}

        {/* Coach retrospective — above the statistics */}
        {review.narrative && (
          <View style={styles.narrativeCard}>
            <Text style={styles.narrativeKicker}>MERCIA ON YOUR YEAR</Text>
            <Text style={styles.narrativeText}>{review.narrative}</Text>
          </View>
        )}

        {/* Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroNumber}>{review.totalActions.toLocaleString()}</Text>
          <Text style={styles.heroLabel}>Total Actions</Text>
        </View>

        {/* Core tiles */}
        <View style={styles.tileRow}>
          <StatTile value={String(review.gymDaysLogged)} label="gym days logged" />
          <StatTile value={String(review.perfectDays)} label="perfect days" />
        </View>

        {review.longestStreak && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>LONGEST STREAK</Text>
            <Text style={styles.streakValue}>
              {review.longestStreak.length} days
              <Text style={styles.streakDates}>
                {'  '}· {formatDate(review.longestStreak.start)} → {formatDate(review.longestStreak.end)}
              </Text>
            </Text>
          </View>
        )}

        {review.bestMonth && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>BEST MONTH</Text>
            <Text style={styles.streakValue}>
              {review.bestMonth.label}
              <Text style={styles.streakDates}>{'  '}· {review.bestMonth.avgMomentum}% avg momentum</Text>
            </Text>
          </View>
        )}

        <RankedList
          title="TOP WORKOUTS"
          items={review.topWorkouts}
          emptyText="No gym sessions logged this year."
        />
        <RankedList
          title="TOP 5 TODAY ITEMS"
          items={review.topTodayItems}
          emptyText="No routine completions recorded this year."
        />
        <RankedList
          title="TOP 3 WEEKLY ITEMS"
          items={review.topWeeklyItems}
          emptyText="No weekly goal completions recorded this year."
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  yearTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#E8E8E8',
    marginBottom: 2,
  },
  startedNote: {
    fontSize: 12,
    color: GOLD,
    fontWeight: '500',
    marginBottom: 12,
  },
  narrativeCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    padding: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  narrativeKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: GOLD,
    marginBottom: 8,
  },
  narrativeText: {
    fontSize: 14,
    color: '#D8D8D8',
    lineHeight: 22,
  },
  heroCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  heroNumber: {
    fontSize: 40,
    fontWeight: '800',
    color: '#7B9EFF',
    marginBottom: 2,
  },
  heroLabel: {
    fontSize: 12,
    color: '#888',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 16,
    alignItems: 'center',
  },
  tileValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E8E8E8',
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 11,
    color: '#888',
  },
  sectionCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#666',
    marginBottom: 10,
  },
  streakValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  streakDates: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
  },
  rankNumber: {
    width: 18,
    fontSize: 13,
    fontWeight: '700',
    color: GOLD,
  },
  rankText: {
    flex: 1,
    fontSize: 14,
    color: '#E8E8E8',
  },
  rankCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  rankEmpty: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default YearlyReviewDetailScreen;
