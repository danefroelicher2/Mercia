import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileYearStats } from '../../types/profileFeed';

// The Stats tab: this year's numbers, weekly XP for the last 12 weeks, and
// when you're at your best.

const Tile: React.FC<{ value: string; label: string; icon: string; color: string }> = ({ value, label, icon, color }) => (
  <View style={styles.tile}>
    <Ionicons name={icon as any} size={18} color={color} />
    <Text style={styles.tileValue}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

const Rhythm: React.FC<{ label: string; value: string; pct: number; last?: boolean }> = ({ label, value, pct, last }) => (
  <View style={[styles.rhythm, last && { borderBottomWidth: 0 }]}>
    <Text style={styles.rhythmLabel}>{label}</Text>
    <Text style={styles.rhythmValue}>{value}</Text>
    <Text style={styles.rhythmPct}>{pct}%</Text>
  </View>
);

const ProfileStatsTab: React.FC<{ year: ProfileYearStats; currentStreak: number; bestStreak: number }> = ({ year, currentStreak, bestStreak }) => {
  const max = Math.max(1, ...year.weeklyXp);
  const thisWeek = year.weeklyXp[year.weeklyXp.length - 1];
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      <Text style={styles.section}>{new Date().getFullYear()}</Text>
      <View style={styles.grid}>
        <Tile value={`${year.consistency}%`} label="Consistency" icon="pie-chart" color="#5DCAA5" />
        <Tile value={String(year.perfectDays)} label="Perfect days" icon="sunny" color="#F2B544" />
        <Tile value={String(year.gymSessions)} label="Gym sessions" icon="barbell" color="#4FA3F7" />
        <Tile value={year.tasksDone.toLocaleString('en-US')} label="Tasks done" icon="checkmark-done" color="#A77BF3" />
      </View>

      <Text style={styles.section}>WEEKLY XP</Text>
      <View style={styles.card}>
        <View style={styles.chartHead}>
          <Text style={styles.chartBig}>{thisWeek.toLocaleString('en-US')}</Text>
          <Text style={styles.chartSmall}>XP this week</Text>
        </View>
        <View style={styles.chart}>
          {year.weeklyXp.map((v, i) => (
            <View key={i} style={styles.barSlot}>
              <View style={[styles.bar, { height: `${(v / max) * 100}%` }, i === year.weeklyXp.length - 1 && styles.barNow]} />
            </View>
          ))}
        </View>
        <View style={styles.chartAxis}>
          <Text style={styles.axisText}>12 weeks ago</Text>
          <Text style={styles.axisText}>This week</Text>
        </View>
      </View>

      <Text style={styles.section}>STREAKS</Text>
      <View style={styles.grid}>
        <Tile value={`${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`} label="Current streak" icon="flame" color="#F2705B" />
        <Tile value={`${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}`} label="Best streak" icon="trophy" color="#C9A45C" />
      </View>

      <Text style={styles.section}>AT YOUR BEST</Text>
      <View style={styles.card}>
        <Rhythm label="Part of day" value={year.bestPart.label} pct={year.bestPart.pct} />
        <Rhythm label="Day of week" value={year.bestWeekday.label} pct={year.bestWeekday.pct} />
        <Rhythm label="Month" value={year.bestMonth.label} pct={year.bestMonth.pct} last />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 14 },
  tile: { width: '48.5%', backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#232323', padding: 14 },
  tileValue: { color: '#F5F5F5', fontSize: 22, fontWeight: '800', marginTop: 10, fontVariant: ['tabular-nums'] },
  tileLabel: { color: '#8A8A8A', fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#232323', padding: 14, marginBottom: 14 },
  chartHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  chartBig: { color: '#F5F5F5', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chartSmall: { color: '#8A8A8A', fontSize: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 6, marginTop: 12 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 4, backgroundColor: '#2E4A40', minHeight: 4 },
  barNow: { backgroundColor: '#5DCAA5' },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { color: '#666', fontSize: 11 },
  rhythm: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  rhythmLabel: { flex: 1, color: '#8A8A8A', fontSize: 14 },
  rhythmValue: { color: '#F2F2F2', fontSize: 14, fontWeight: '700', marginRight: 10 },
  rhythmPct: { color: '#5DCAA5', fontSize: 14, fontWeight: '700', width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
});

export default ProfileStatsTab;
