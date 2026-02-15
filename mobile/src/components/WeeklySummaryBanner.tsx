import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { WeeklySummary } from '../types/summary';

interface WeeklySummaryBannerProps {
  summary: WeeklySummary | null;
  onPress: () => void;
}

const WeeklySummaryBanner: React.FC<WeeklySummaryBannerProps> = ({ summary, onPress }) => {
  // Only show on Mondays when a summary exists
  const isMonday = new Date().getDay() === 1;
  if (!isMonday || !summary) return null;

  return (
    <TouchableOpacity onPress={onPress} style={styles.banner} activeOpacity={0.8}>
      <View style={styles.content}>
        <Text style={styles.icon}>📊</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Weekly Summary Available</Text>
          <Text style={styles.subtitle}>
            {summary.has_complete_data
              ? `${Math.round((summary.nonnegotiables_percentage + summary.nicetohaves_percentage + summary.weekly_goals_percentage) / 3)}% overall completion`
              : 'Tap to view'}
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FF6B35',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  arrow: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '300',
  },
});

export default WeeklySummaryBanner;
