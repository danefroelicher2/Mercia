import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import api from '../services/api';
import { colors, spacing, typography } from '../constants/theme';
import { InsightEntry, GroupedInsightsApiResponse } from '../types/memory';

const QUESTION_FACTS_MAX = 40;
const CONVERSATION_FACTS_MAX = 60;

const MerciaMemoryScreen: React.FC = () => {
  const [data, setData] = useState<GroupedInsightsApiResponse['data'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInsights = useCallback(async () => {
    try {
      const response = await api.get<GroupedInsightsApiResponse>('/api/memory/insights');
      if (response.data.success && response.data.data) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('[MerciaMemoryScreen] Error fetching insights:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchInsights();
  }, [fetchInsights]);

  const renderProgressBar = (count: number, max: number) => {
    const completeness = max > 0 ? Math.min(count / max, 1) : 0;
    return (
      <View style={styles.progressBarRow}>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${completeness * 100}%` }]} />
        </View>
        <Text style={styles.progressBarLabel}>{count} / {max}</Text>
      </View>
    );
  };

  const renderFactsList = (entries: InsightEntry[], emptyText: string) => {
    if (entries.length === 0) {
      return (
        <Text style={styles.emptyText}>{emptyText}</Text>
      );
    }

    // Group by category
    const grouped: Record<string, InsightEntry[]> = {};
    for (const entry of entries) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }

    return (
      <>
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.categoryGroup}>
            <Text style={styles.categoryLabel}>{category.toUpperCase()}</Text>
            {items.map((item, idx) => (
              <Text key={item.id ?? idx} style={styles.bulletItem}>
                {'\u2022'} {item.content}
              </Text>
            ))}
          </View>
        ))}
      </>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
          progressBackgroundColor="transparent"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* FROM YOUR QUESTIONS */}
      <Text style={styles.subsectionTitle}>FROM YOUR QUESTIONS</Text>
      {renderProgressBar(data?.question_facts_count ?? 0, QUESTION_FACTS_MAX)}
      {renderFactsList(
        data?.from_questions ?? [],
        "Answer today's question and Mercia will start learning about you."
      )}

      <View style={styles.divider} />

      {/* FROM YOUR CONVERSATIONS */}
      <Text style={styles.subsectionTitle}>FROM YOUR CONVERSATIONS</Text>
      {renderProgressBar(data?.conversation_facts_count ?? 0, CONVERSATION_FACTS_MAX)}
      {renderFactsList(
        data?.from_conversations ?? [],
        'Have a conversation with Mercia and it will begin learning from what you share.'
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.screenBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.screenPadding,
  },
  subsectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.elementGap,
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.elementGap,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressBarLabel: {
    ...typography.timestamp,
    marginLeft: 10,
  },
  categoryGroup: {
    marginTop: 12,
  },
  categoryLabel: {
    ...typography.timestamp,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bulletItem: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
    paddingLeft: spacing.smallGap,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 20,
  },
});

export default MerciaMemoryScreen;
