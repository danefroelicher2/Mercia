import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { ArchivedYear, SAMPLE_YEAR, num, pct, shortDate } from './statsArchiveData';

// One card per finished year; tapping opens that year's full stats.

const StatsArchiveScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [years, setYears] = useState<ArchivedYear[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      const withSample = (list: ArchivedYear[]) =>
        __DEV__ && !list.some(y => y.year === SAMPLE_YEAR.year) ? [...list, SAMPLE_YEAR] : list;
      api
        .get('/api/stats/archive')
        .then(res => setYears(withSample(res.data.data ?? [])))
        .catch(() => setYears(withSample([])));
    }, []),
  );

  if (years === null) {
    return <View style={styles.center}><ActivityIndicator color="#888" /></View>;
  }

  if (years.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No finished years yet</Text>
        <Text style={styles.emptyText}>When a year ends, its stats are saved here and Stats starts fresh.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Each year is saved here when it ends.</Text>
      {years.map(y => {
        const d = y.data;
        return (
          <Pressable
            key={y.year}
            onPress={() => navigation.navigate('StatsArchiveYear', { entry: y })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.yearLine}>
                  <Text style={styles.year}>{y.year}</Text>
                  {y.sample ? <Text style={styles.tag}>SAMPLE</Text> : null}
                  {!y.sample && !d.final ? <Text style={styles.tag}>FINALIZING</Text> : null}
                </View>
                <Text style={styles.range}>
                  {shortDate(d.from)} – {shortDate(d.to)} · {num(d.countedDays)} days tracked
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#555" />
            </View>
            <View style={styles.figures}>
              <Figure value={pct(d.consistency)} label="Consistency" />
              <Figure value={num(d.perfectDays)} label="Perfect days" />
              <Figure value={d.gym ? num(d.gym.sessions) : '—'} label="Gym sessions" />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const Figure = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.figure}>
    <Text style={styles.figureValue}>{value}</Text>
    <Text style={styles.figureLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#E8E8E8' },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  intro: { fontSize: 13, color: '#777', marginBottom: 4 },
  card: { backgroundColor: '#161616', borderRadius: 14, padding: 16, gap: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  yearLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  year: { fontSize: 30, fontWeight: '800', color: '#F2F2F2', fontVariant: ['tabular-nums'] },
  tag: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#999',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
  },
  range: { fontSize: 13, color: '#777', marginTop: 2 },
  figures: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A2A', paddingTop: 14 },
  figure: { flex: 1 },
  figureValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 11, color: '#777', marginTop: 2 },
});

export default StatsArchiveScreen;
