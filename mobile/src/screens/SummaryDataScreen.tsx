import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';

interface SummaryData {
  total_possible: number;
  total_completed: number;
  percentage: number;
  week_start: string;
  week_end: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SummaryDataScreen: React.FC = () => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {data && data.total_possible > 0 ? (
          <View style={styles.trackerCard}>
            <View style={styles.trackerHeader}>
              <Text style={styles.trackerLabel}>Today Items</Text>
              <Text style={styles.trackerCount}>
                {data.total_completed} / {data.total_possible}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${data.percentage}%` }]}
              />
            </View>
            <Text style={styles.trackerSubtitle}>
              {data.percentage}% of this week's Today items completed
            </Text>
            <Text style={styles.weekRange}>
              {formatDate(data.week_start)} – {formatDate(data.week_end)}
            </Text>
          </View>
        ) : (
          <View style={styles.trackerCard}>
            <Text style={styles.emptyText}>
              No Today items set up yet. Add non-negotiable tasks in your Routine to see weekly completion data here.
            </Text>
          </View>
        )}
      </View>
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
  content: {
    padding: 16,
  },
  trackerCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232323',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  trackerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E8E8E8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  trackerCount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1D9E75',
  },
  progressTrack: {
    height: 8,
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
  trackerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  weekRange: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
});

export default SummaryDataScreen;
