import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

// Finished years' stats, saved when each year ends. Plain layout for now.

interface Bucket {
  planned: number;
  done: number;
  points: number;
  rate: number | null;
}
interface ArchivedYear {
  year: number;
  data: {
    from: string | null;
    to: string | null;
    days: number;
    bySection: Record<string, Bucket>;
    byWeekday: Record<string, Bucket>;
    perfectDays: number;
    missedDays: number;
    actionDays: number;
    countedDays: number;
    consistency: number | null;
    goals: {
      weekly: { average: number | null; periods: number };
      monthly: { average: number | null; periods: number };
      yearly: { rate: number | null; completed: number; total: number };
    };
    final?: boolean;
  };
}

const SECTIONS = ['morning', 'afternoon', 'night'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const detail = (b: Bucket) =>
  b.planned > 0 ? `${b.done} of ${b.planned} crossed off${b.points ? ` · +${b.points} goal pts` : ''}` : 'nothing planned';

const StatsArchiveScreen: React.FC = () => {
  const [years, setYears] = useState<ArchivedYear[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get('/api/stats/archive')
        .then(res => {
          const list: ArchivedYear[] = res.data.data ?? [];
          setYears(list);
          if (list.length && open === null) setOpen(list[0].year);
        })
        .catch(() => setYears([]));
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const table = (title: string, keys: string[], data: Record<string, Bucket>, label: (k: string) => string) => (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.card}>
        {keys.map((k, i) => (
          <View key={k} style={[styles.row, i < keys.length - 1 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{label(k)}</Text>
              <Text style={styles.sub}>{detail(data[k])}</Text>
            </View>
            <Text style={styles.value}>{pct(data[k].rate)}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const list = (title: string, rows: [string, string, string][]) => (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.card}>
        {rows.map(([label, value, sub], i) => (
          <View key={label} style={[styles.row, i < rows.length - 1 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.sub}>{sub}</Text>
            </View>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {years.map(y => (
        <View key={y.year} style={styles.year}>
          <Pressable onPress={() => setOpen(open === y.year ? null : y.year)} style={styles.yearHeader}>
            <Text style={styles.yearTitle}>{y.year}</Text>
            <Text style={styles.yearMeta}>{y.data.countedDays} days tracked{y.data.final ? '' : ' · finalizing'}</Text>
          </Pressable>
          {open === y.year && (
            <>
              {table('BY PART OF DAY', SECTIONS, y.data.bySection, cap)}
              {table('BY WEEKDAY', WEEKDAYS, y.data.byWeekday, k => cap(k).slice(0, 3))}
              {list('DAYS', [
                ['Perfect days', String(y.data.perfectDays), 'every item crossed off'],
                ['Missed days', String(y.data.missedDays), 'no action at all'],
                ['Consistency', pct(y.data.consistency), `${y.data.actionDays} of ${y.data.countedDays} days with an action`],
              ])}
              {list('GOALS', [
                ['Weekly', pct(y.data.goals.weekly.average), `average of ${y.data.goals.weekly.periods} weeks`],
                ['Monthly', pct(y.data.goals.monthly.average), `average of ${y.data.goals.monthly.periods} months`],
                ['Yearly', pct(y.data.goals.yearly.rate), `${y.data.goals.yearly.completed} of ${y.data.goals.yearly.total} done`],
              ])}
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#E8E8E8' },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  year: { gap: 12 },
  yearHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  yearTitle: { fontSize: 24, fontWeight: '800', color: '#F2F2F2' },
  yearMeta: { fontSize: 13, color: '#777' },
  block: { gap: 6 },
  blockTitle: { fontSize: 12, letterSpacing: 1.1, color: '#777', fontWeight: '500' },
  card: { backgroundColor: '#161616', borderRadius: 12, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  label: { fontSize: 14, color: '#E8E8E8' },
  sub: { fontSize: 11, color: '#777', marginTop: 1 },
  value: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
});

export default StatsArchiveScreen;
