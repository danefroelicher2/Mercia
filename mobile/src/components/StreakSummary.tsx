import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Current and best day streaks (consecutive days with activity), side by side
// in one card. A streak stays alive through today if yesterday was active.

export interface StreakData {
  currentStreak: number;
  currentStartedAt?: string | null;
  activeToday?: boolean;
  longestStreak: { length: number; startedAt?: string | null; endedAt: string | null; isCurrent: boolean };
}

const GREEN = '#5DCAA5';
const AMBER = '#E8A13A';
const GOLD = '#D8B45A';

const StreakSummary: React.FC<{ data: StreakData | null }> = ({ data }) => {
  const current = data?.currentStreak ?? 0;
  const best = data?.longestStreak;

  let currentStatus: { text: string; color: string } | null = null;
  if (data) {
    if (current === 0) currentStatus = { text: 'Do anything today to start', color: '#8A8A8A' };
    else currentStatus = data.activeToday ? { text: 'Today counted', color: GREEN } : { text: 'Keep it going today', color: AMBER };
  }
  const bestStatus = best?.isCurrent && best.length > 0 ? { text: 'Happening now', color: GOLD } : null;

  return (
    <View style={styles.card}>
      <Half label="Current streak" value={current} status={currentStatus} centered />
      <View style={styles.rule} />
      <Half label="Best streak" value={best?.length ?? 0} status={bestStatus} centered />
    </View>
  );
};

const Half = ({ label, value, status, centered }: { label: string; value: number; status: { text: string; color: string } | null; centered?: boolean }) => (
  <View style={[styles.half, centered && styles.centered]}>
    <Text style={styles.label}>{label.toUpperCase()}</Text>
    <View style={styles.valueRow}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.unit}>{value === 1 ? 'day' : 'days'}</Text>
    </View>
    <View style={styles.statusRow}>
      {status ? (
        <>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
        </>
      ) : (
        <Text style={styles.status}> </Text>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#161616', borderRadius: 18, paddingVertical: 18, marginBottom: 16 },
  rule: { width: StyleSheet.hairlineWidth, backgroundColor: '#2A2A2A', marginVertical: 4 },
  half: { flex: 1, paddingHorizontal: 18 },
  centered: { alignItems: 'center' },
  label: { fontSize: 11, letterSpacing: 1.2, color: '#777', fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 },
  value: { fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 46, lineHeight: 54, color: '#F2F2F2', fontVariant: ['lining-nums'] },
  unit: { fontSize: 14, color: '#8A8A8A' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 12, fontWeight: '600' },
});

export default StreakSummary;
