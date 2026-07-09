import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';
import { WeeklySummary } from '../types/summary';
import WeeklySummaryModal from '../components/WeeklySummaryModal';

const colors = {
  screenBg: '#1A1A1A',
  cardBg: '#2A2A2A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#707070',
  primary: '#FF6B35',
  border: '#3A3A3A',
};

function formatSummaryDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const SummaryHistoryScreen: React.FC = () => {
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSummary, setSelectedSummary] = useState<WeeklySummary | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDelete = async (summaryId: string) => {
    await api.delete(`/api/summaries/${summaryId}`);
    setSummaries(prev => prev.filter(s => s.id !== summaryId));
    setSelectedSummary(null);
  };

  const loadHistory = async () => {
    try {
      const response = await api.get('/api/summaries/history');
      if (response.data.success) {
        setSummaries(response.data.data);
      }
    } catch (error) {
      console.error('[SummaryHistory] Error loading:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: WeeklySummary }) => {
    const overallPercentage = item.overall_percentage ?? 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelectedSummary(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>
            {formatSummaryDate(item.week_end_date)}
          </Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
        <View style={styles.cardStats}>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatValue}>{overallPercentage}%</Text>
            <Text style={styles.cardStatLabel}>Overall</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatValue}>
              {item.weekly_goals_completed}/{item.weekly_goals_total}
            </Text>
            <Text style={styles.cardStatLabel}>Goals</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatValue}>{item.today_percentage}%</Text>
            <Text style={styles.cardStatLabel}>Today</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {summaries.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Saved Summaries</Text>
          <Text style={styles.emptyText}>
            Save your daily summaries from the Routine tab to see them here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={summaries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      <WeeklySummaryModal
        visible={!!selectedSummary}
        summary={selectedSummary}
        onDismiss={() => setSelectedSummary(null)}
        onDelete={handleDelete}
        readOnly
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardArrow: {
    fontSize: 20,
    color: colors.textTertiary,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cardStat: {
    alignItems: 'center',
  },
  cardStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  cardStatLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default SummaryHistoryScreen;
