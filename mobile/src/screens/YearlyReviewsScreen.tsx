import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

// Wrapped-style yearly reviews. A card exists only for COMPLETED calendar
// years with at least one action — a user who starts in Oct 2026 sees their
// first card ("2026 · started Oct") on Jan 1, 2027.

interface YearCard {
  year: number;
  startedDate: string | null;
  totalActions: number;
  gymDaysLogged: number;
}

const formatStarted = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const YearlyReviewsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [cards, setCards] = useState<YearCard[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const res = await api.get(`/api/stats/yearly-reviews?timezone=${encodeURIComponent(timezone)}`);
          setCards(res.data.data || []);
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1D9E75" />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyTitle}>No reviews yet</Text>
        <Text style={styles.emptySubtitle}>
          Your first yearly review appears on January 1st, once a full calendar year of Mercia is behind you.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {cards.map(card => (
          <TouchableOpacity
            key={card.year}
            style={styles.yearCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('YearlyReviewDetail', { year: card.year })}
          >
            <View style={styles.yearCardTop}>
              <Text style={styles.yearNumber}>{card.year}</Text>
              {card.startedDate && (
                <Text style={styles.startedBadge}>started {formatStarted(card.startedDate)}</Text>
              )}
            </View>
            <Text style={styles.yearCardStats}>
              {card.totalActions.toLocaleString()} actions · {card.gymDaysLogged} gym days
            </Text>
            <Text style={styles.yearCardCta}>View your year →</Text>
          </TouchableOpacity>
        ))}
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
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8E8E8',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  yearCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    borderTopWidth: 3,
    borderTopColor: '#D9A03F',
    padding: 18,
    marginBottom: 12,
  },
  yearCardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 6,
  },
  yearNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#E8E8E8',
  },
  startedBadge: {
    fontSize: 11,
    color: '#D9A03F',
    fontWeight: '500',
  },
  yearCardStats: {
    fontSize: 13,
    color: '#888',
    marginBottom: 10,
  },
  yearCardCta: {
    fontSize: 13,
    color: '#D9A03F',
    fontWeight: '600',
  },
});

export default YearlyReviewsScreen;
