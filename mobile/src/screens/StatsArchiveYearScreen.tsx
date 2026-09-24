import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SECTION_COLORS } from '../utils/timeOfDay';
import { ArchivedYear, Bucket, GROUP_COLORS, SECTIONS, WEEKDAYS, cap, num, pct, shortDate } from './statsArchiveData';

// One finished year, laid out in the same groups as the Stats tab.

const ROUTINE = GROUP_COLORS.Routine;

const StatsArchiveYearScreen: React.FC = () => {
  const { entry } = useRoute<any>().params as { entry: ArchivedYear };
  const d = entry.data;

  const crossed = (b: Bucket) =>
    b.planned > 0 ? `${num(b.done)} of ${num(b.planned)} crossed off${b.points ? ` · +${b.points} goal pts` : ''}` : 'nothing planned';

  // Weekday chart: scaled to the best day so differences are visible.
  const wdRates = WEEKDAYS.map(k => d.byWeekday[k]?.rate ?? 0);
  const wdMax = Math.max(...wdRates, 0.01);
  const best = wdRates.indexOf(Math.max(...wdRates));
  const worst = wdRates.indexOf(Math.min(...wdRates));

  const gymMax = d.gym ? Math.max(...d.gym.split.map(s => s.sessions), 1) : 1;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View>
        <View style={styles.yearLine}>
          <Text style={styles.year}>{entry.year}</Text>
          {entry.sample ? <Text style={styles.tag}>SAMPLE</Text> : null}
        </View>
        <Text style={styles.range}>
          {shortDate(d.from)} – {shortDate(d.to)} · {num(d.countedDays)} days tracked
        </Text>
      </View>

      <View style={styles.hero}>
        <Hero value={pct(d.consistency)} label="Consistency" />
        <View style={styles.heroRule} />
        <Hero value={num(d.perfectDays)} label="Perfect days" />
        <View style={styles.heroRule} />
        <Hero value={d.gym ? num(d.gym.sessions) : '—'} label="Gym sessions" />
      </View>

      <Group name="Routine" />

      <Block title="By part of day">
        {SECTIONS.map((s, i) => {
          const b = d.bySection[s];
          return (
            <View key={s} style={[styles.row, i < SECTIONS.length - 1 && styles.divider]}>
              <View style={styles.rowTop}>
                <Text style={styles.label}>{cap(s)}</Text>
                <Text style={styles.value}>{pct(b?.rate)}</Text>
              </View>
              <Bar ratio={b?.rate ?? 0} color={SECTION_COLORS[s]} />
              <Text style={styles.sub}>{b ? crossed(b) : '—'}</Text>
            </View>
          );
        })}
      </Block>

      <Block title="By weekday">
        <View style={styles.chart}>
          {WEEKDAYS.map((k, i) => (
            <View key={k} style={styles.col}>
              <Text style={[styles.colValue, i === best && { color: '#FFFFFF' }]}>{pct(wdRates[i])}</Text>
              <View style={styles.colTrack}>
                <View
                  style={[
                    styles.colFill,
                    { height: `${(wdRates[i] / wdMax) * 100}%`, backgroundColor: ROUTINE, opacity: i === best ? 1 : 0.4 },
                  ]}
                />
              </View>
              <Text style={[styles.colDay, i === best && { color: '#E8E8E8' }]}>{cap(k).slice(0, 3)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.chartNote}>
          Best {cap(WEEKDAYS[best])} · toughest {cap(WEEKDAYS[worst])}
        </Text>
      </Block>

      <Block title="Days">
        <Row label="Perfect days" value={num(d.perfectDays)} sub="every Morning, Afternoon and Night item crossed off" />
        <Row label="Missed days" value={num(d.missedDays)} sub="no action at all" />
        <Row label="Consistency" value={pct(d.consistency)} sub={`${num(d.actionDays)} of ${num(d.countedDays)} days with an action`} last />
      </Block>

      <Block title="Goals">
        <Row label="Weekly" value={pct(d.goals.weekly.average)} sub={`average across ${d.goals.weekly.periods} weeks`} />
        <Row label="Monthly" value={pct(d.goals.monthly.average)} sub={`average across ${d.goals.monthly.periods} months`} />
        <Row label="Yearly" value={pct(d.goals.yearly.rate)} sub={`${d.goals.yearly.completed} of ${d.goals.yearly.total} done`} last />
      </Block>

      {d.gym ? (
        <>
          <Group name="Gym" />
          <Block title="Training">
            <Row label="Sessions logged" value={num(d.gym.sessions)} />
            <Row
              label="Favorite training day"
              value={d.gym.favoriteDay ? cap(d.gym.favoriteDay.day) : '—'}
              sub={d.gym.favoriteDay ? `${d.gym.favoriteDay.sessions} sessions` : undefined}
            />
            <Row label="Rest days" value={num(d.gym.restDays)} last />
          </Block>
          <Block title="Split">
            {d.gym.split.map((s, i) => (
              <View key={s.group} style={[styles.row, i < d.gym!.split.length - 1 && styles.divider]}>
                <View style={styles.rowTop}>
                  <Text style={styles.label}>{s.group}</Text>
                  <Text style={styles.value}>{pct(s.sessions / d.gym!.sessions)}</Text>
                </View>
                <Bar ratio={s.sessions / gymMax} color={GROUP_COLORS.Gym} />
                <Text style={styles.sub}>{s.sessions} sessions</Text>
              </View>
            ))}
          </Block>
        </>
      ) : null}

      {d.streaks ? (
        <>
          <Group name="Streaks" />
          <Block title="The year">
            <Row
              label="Longest streak"
              value={d.streaks.longest?.name ?? '—'}
              sub={d.streaks.longest ? `${d.streaks.longest.days.toFixed(1)} days` : undefined}
            />
            <Row
              label="Least consistent"
              value={d.streaks.leastConsistent?.name ?? '—'}
              sub={d.streaks.leastConsistent ? `restarted ${d.streaks.leastConsistent.restarts} times` : 'no restarts'}
              last
            />
          </Block>
        </>
      ) : null}
    </ScrollView>
  );
};

const Hero = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.heroCell}>
    <Text style={styles.heroValue}>{value}</Text>
    <Text style={styles.heroLabel}>{label}</Text>
  </View>
);

const Group = ({ name }: { name: string }) => (
  <View style={styles.group}>
    <View style={[styles.groupDot, { backgroundColor: GROUP_COLORS[name] ?? '#888' }]} />
    <Text style={styles.groupTitle}>{name}</Text>
  </View>
);

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.block}>
    <Text style={styles.blockTitle}>{title.toUpperCase()}</Text>
    <View style={styles.card}>{children}</View>
  </View>
);

const Row = ({ label, value, sub, last }: { label: string; value: string; sub?: string; last?: boolean }) => (
  <View style={[styles.rowInline, !last && styles.divider]}>
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
    <Text style={styles.value}>{value}</Text>
  </View>
);

// Rates can pass 100% with goal boosts; the bar just fills.
const Bar = ({ ratio, color }: { ratio: number; color: string }) => (
  <View style={styles.track}>
    <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, ratio)) * 100}%`, backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  yearLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  year: { fontSize: 44, fontWeight: '800', color: '#F2F2F2', fontVariant: ['tabular-nums'] },
  tag: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#999',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
  },
  range: { fontSize: 13, color: '#777', marginTop: 2 },
  hero: { flexDirection: 'row', backgroundColor: '#161616', borderRadius: 14, paddingVertical: 16 },
  heroCell: { flex: 1, alignItems: 'center' },
  heroRule: { width: StyleSheet.hairlineWidth, backgroundColor: '#2A2A2A' },
  heroValue: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 11, color: '#777', marginTop: 3 },
  group: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2A2A',
  },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: 20, fontWeight: '700', color: '#F2F2F2', letterSpacing: 0.2 },
  block: { gap: 8 },
  blockTitle: { fontSize: 12, letterSpacing: 1.1, color: '#777', fontWeight: '500' },
  card: { backgroundColor: '#161616', borderRadius: 12, paddingHorizontal: 14 },
  row: { paddingVertical: 12, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowInline: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  label: { fontSize: 14, color: '#E8E8E8' },
  sub: { fontSize: 11, color: '#777', marginTop: 1 },
  value: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, backgroundColor: '#242424', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  chart: { flexDirection: 'row', height: 150, paddingTop: 14, gap: 6 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  colValue: { fontSize: 11, color: '#888', fontVariant: ['tabular-nums'] },
  colTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', borderRadius: 4, backgroundColor: '#1F1F1F', overflow: 'hidden' },
  colFill: { width: '100%', borderRadius: 4 },
  colDay: { fontSize: 11, color: '#777', marginBottom: 2 },
  chartNote: { fontSize: 11, color: '#777', paddingTop: 6, paddingBottom: 12 },
});

export default StatsArchiveYearScreen;
