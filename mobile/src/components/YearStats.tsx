import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SECTION_COLORS } from '../utils/timeOfDay';
import {
  ArchivedYearData, Bucket, GROUP_COLORS, SECTIONS, WEEKDAYS, cap, monthName, num, pct, plural,
} from '../screens/statsArchiveData';

// A year of stats in the Overall / Routine / Gym / Streaks groups. Used by
// the Stats tab (the year so far, with `live`) and by a Stats Archive year.

export interface LiveExtras {
  currentStreaks: number;
  lifetime: {
    actions: number;
    itemsCrossedOff: number;
    goalsCompleted: number;
    gymDays: number;
    messages: number;
    gymSessions: number;
    favoriteGymDay: { day: string; sessions: number } | null;
    mostUsedWeekday: { day: string; activeDays: number } | null;
    mostUsedMonth: { month: number; activeDays: number } | null;
    joined: string;
    daysSinceJoining: number;
  };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (d: string) => `${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;

const ROUTINE = GROUP_COLORS.Routine;
const DAY_MS = 86400_000;
const daysAgo = (date: string) => {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);
};

const YearStats: React.FC<{ data: ArchivedYearData; live?: LiveExtras }> = ({ data: d, live }) => {
  const crossed = (b: Bucket) =>
    b.planned > 0 ? `${num(b.done)} of ${num(b.planned)} crossed off${b.points ? ` · +${b.points} goal pts` : ''}` : 'nothing planned';

  // Weekday chart: scaled to the best day so differences are visible.
  // Best/toughest compare only weekdays that have data, and only once they differ.
  const wdRates = WEEKDAYS.map(k => d.byWeekday[k]?.rate ?? 0);
  const wdMax = Math.max(...wdRates, 0.01);
  const rated = WEEKDAYS.map((_, i) => i).filter(i => d.byWeekday[WEEKDAYS[i]]?.rate != null);
  const best = rated.reduce((b, i) => (b < 0 || wdRates[i] > wdRates[b] ? i : b), -1);
  const worst = rated.reduce((w, i) => (w < 0 || wdRates[i] < wdRates[w] ? i : w), -1);
  const canCompare = rated.length > 1 && wdRates[best] !== wdRates[worst];

  const gymMax = d.gym ? Math.max(...d.gym.split.map(s => s.sessions), 1) : 1;
  const soFar = (x: number | null | undefined, unit: string) => (live && x != null ? ` · this ${unit} so far ${pct(x)}` : '');

  return (
    <View style={styles.root}>
      {live ? <Lifetime l={live.lifetime} /> : null}

      {/* Left-aligned on the Stats tab; centered in a Stats Archive year. */}
      <Group name="Overall" centered={!live} spaced={!!live} />
      <Block title="Across the app">
        <Row label="Actions" value={d.overall ? num(d.overall.actions) : '—'} sub="items and goals crossed off, gym days, messages" />
        <Row
          label="Most active month"
          value={d.overall?.mostActiveMonth ? monthName(d.overall.mostActiveMonth.month) : '—'}
          sub={d.overall?.mostActiveMonth ? plural(d.overall.mostActiveMonth.activeDays, 'active day') : undefined}
          last
        />
      </Block>
      <Block title="Days">
        <Row label="Perfect days" value={num(d.perfectDays)} sub="every Morning, Afternoon and Night item crossed off" />
        <Row label="Missed days" value={num(d.missedDays)} sub="no action at all" />
        <Row label="Consistency" value={pct(d.consistency)} sub={`${num(d.actionDays)} of ${num(d.countedDays)} days with an action`} last />
      </Block>

      <Group name="Routine" spaced />
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
          {WEEKDAYS.map((k, i) => {
            const on = canCompare && i === best;
            return (
              <View key={k} style={styles.col}>
                <Text style={[styles.colValue, on && { color: '#FFFFFF' }]}>{pct(d.byWeekday[k]?.rate)}</Text>
                <View style={styles.colTrack}>
                  <View style={[styles.colFill, { height: `${(wdRates[i] / wdMax) * 100}%`, backgroundColor: ROUTINE, opacity: on ? 1 : 0.4 }]} />
                </View>
                <Text style={[styles.colDay, on && { color: '#E8E8E8' }]}>{cap(k).slice(0, 3)}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.chartNote}>
          {canCompare
            ? `Best ${cap(WEEKDAYS[best])} · toughest ${cap(WEEKDAYS[worst])}`
            : rated.length ? 'Best and toughest days show once there are more days to compare' : 'No routine items planned yet'}
        </Text>
      </Block>
      <Block title="Goals">
        <Row label="Weekly" value={pct(d.goals.weekly.average)} sub={`average across ${plural(d.goals.weekly.periods, 'week')}${soFar(d.goals.weekly.soFar, 'week')}`} />
        <Row label="Monthly" value={pct(d.goals.monthly.average)} sub={`average across ${plural(d.goals.monthly.periods, 'month')}${soFar(d.goals.monthly.soFar, 'month')}`} />
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
              sub={d.gym.favoriteDay ? plural(d.gym.favoriteDay.sessions, 'session') : undefined}
            />
            <Row label="Rest days" value={num(d.gym.restDays)} last />
          </Block>
          <Block title="Split">
            {d.gym.split.length === 0 ? <Row label="No sessions logged" value="—" last /> : null}
            {d.gym.split.map((s, i) => (
              <View key={s.group} style={[styles.row, i < d.gym!.split.length - 1 && styles.divider]}>
                <View style={styles.rowTop}>
                  <Text style={styles.label}>{s.group}</Text>
                  <Text style={styles.value}>{pct(s.sessions / d.gym!.sessions)}</Text>
                </View>
                <Bar ratio={s.sessions / gymMax} color={GROUP_COLORS.Gym} />
                <Text style={styles.sub}>
                  {plural(s.sessions, 'session')}
                  {live && s.last ? ` · last ${daysAgo(s.last)}d ago` : ''}
                </Text>
              </View>
            ))}
          </Block>
        </>
      ) : null}

      {d.streaks ? (
        <>
          <Group name="Streaks" />
          <Block title="The year">
            {live ? <Row label="Current streaks" value={num(live.currentStreaks)} sub="running now" /> : null}
            <Row
              label="Longest streak"
              value={d.streaks.longest?.name ?? '—'}
              sub={d.streaks.longest ? `${d.streaks.longest.days.toFixed(1)} days${live && d.streaks.longest.running ? ' · still going' : ''}` : 'no streaks this year'}
            />
            <Row
              label="Least consistent"
              value={d.streaks.leastConsistent?.name ?? '—'}
              sub={d.streaks.leastConsistent ? `restarted ${plural(d.streaks.leastConsistent.restarts, 'time')}` : 'no restarts'}
              last
            />
          </Block>
        </>
      ) : null}
    </View>
  );
};

// All-time numbers — the Stats tab only; a saved year never has these.
const Lifetime = ({ l }: { l: LiveExtras['lifetime'] }) => (
  <>
    <Group name="Lifetime" centered />
    <Block title="Since you joined">
      <Row
        label="Lifetime actions"
        value={num(l.actions)}
        sub={`${num(l.itemsCrossedOff)} items · ${num(l.goalsCompleted)} goals · ${num(l.gymDays)} gym days · ${num(l.messages)} messages`}
      />
      <Row label="Gym sessions logged" value={num(l.gymSessions)} />
      <Row
        label="Favorite training day"
        value={l.favoriteGymDay ? cap(l.favoriteGymDay.day) : '—'}
        sub={l.favoriteGymDay ? plural(l.favoriteGymDay.sessions, 'session') : undefined}
      />
      <Row
        label="Most used day"
        value={l.mostUsedWeekday ? cap(l.mostUsedWeekday.day) : '—'}
        sub={l.mostUsedWeekday ? plural(l.mostUsedWeekday.activeDays, 'active day') : undefined}
      />
      <Row
        label="Most used month"
        value={l.mostUsedMonth ? monthName(`0000-${String(l.mostUsedMonth.month).padStart(2, '0')}`) : '—'}
        sub={l.mostUsedMonth ? plural(l.mostUsedMonth.activeDays, 'active day') : undefined}
      />
      <Row label="Days since joining" value={num(l.daysSinceJoining)} sub={`joined ${longDate(l.joined)}`} last />
    </Block>
  </>
);

const Group = ({ name, centered, spaced }: { name: string; centered?: boolean; spaced?: boolean }) => (
  <View style={[styles.group, centered && styles.groupCentered, spaced && styles.groupSpaced]}>
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
  root: { gap: 16 },
  group: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2A2A',
  },
  groupCentered: { justifyContent: 'center' },
  groupSpaced: { marginTop: 36 },
  groupDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  // Built-in iOS italic — classy but easy to read.
  groupTitle: { fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 42, lineHeight: 50, color: '#F2F2F2' },
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

export default YearStats;
