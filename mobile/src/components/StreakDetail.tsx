import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../utils/timeOfDay';
import { compareToBest } from '../utils/streakCompare';


// A streak's own page: every run recorded under its name. A big live clock
// when one is running, then best run, total time across all runs and the
// number of restarts, a bar per run (the current one lit) and the full list.

export interface StreakRun {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
}

interface Props {
  visible: boolean;
  name: string;
  // All runs under this name, any order.
  runs: StreakRun[];
  now: number;
  accent: string;
  onClose: () => void;
  // ••• : stop / restart / delete for the running run.
  onMore: (run: StreakRun) => void;
  // Hold a past run to delete it.
  onDeleteRun: (run: StreakRun) => void;
}

const DAY = 86400;
const pad = (n: number) => String(n).padStart(2, '0');

const secondsOf = (run: StreakRun, now: number) =>
  Math.max(0, Math.floor(((run.ended_at ? Date.parse(run.ended_at) : now) - Date.parse(run.started_at)) / 1000));

function short(seconds: number) {
  const d = Math.floor(seconds / DAY);
  const h = Math.floor((seconds % DAY) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d${h ? ` ${h}h` : ''}`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const StreakDetail: React.FC<Props> = ({ visible, name, runs, now, accent, onClose, onMore, onDeleteRun }) => {
  const insets = useSafeAreaInsets();
  const ordered = [...runs].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const current = ordered.find(r => !r.ended_at) ?? null;
  const lengths = ordered.map(r => secondsOf(r, now));
  const best = Math.max(0, ...lengths);
  const total = lengths.reduce((a, b) => a + b, 0);
  const restarts = Math.max(0, ordered.length - 1);

  const cur = current ? secondsOf(current, now) : 0;
  const days = Math.floor(cur / DAY);
  const clock = `${pad(Math.floor((cur % DAY) / 3600))}:${pad(Math.floor((cur % 3600) / 60))}:${pad(cur % 60)}`;
  // Best of the earlier runs, for the comparison under the clock.
  const earlierBest = Math.max(0, ...ordered.filter(r => r.ended_at).map(r => secondsOf(r, now)));
  const barMax = Math.max(cur, earlierBest, 1);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back" style={styles.headerSide}>
            <Ionicons name="chevron-back" size={26} color="#E8E8E8" />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            {current && (
              <Pressable onPress={() => onMore(current)} hitSlop={12} accessibilityLabel="Streak options">
                <Ionicons name="ellipsis-horizontal" size={22} color="#E8E8E8" />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {current ? (
            <View style={styles.clockBlock}>
              <Text style={styles.bigDays}>{days}</Text>
              <Text style={styles.bigUnit}>{days === 1 ? 'day' : 'days'}</Text>
              <Text style={[styles.clock, { color: accent }]}>{clock}</Text>
              <Text style={styles.since}>
                since {new Date(current.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </Text>
              {earlierBest > 0 && (
                <View style={styles.compare}>
                  <View style={styles.compareTrack}>
                    <View style={[styles.compareFill, { width: `${(cur / barMax) * 100}%`, backgroundColor: accent }]} />
                    <View style={[styles.compareMark, { left: `${(earlierBest / barMax) * 100}%` }]} />
                  </View>
                </View>
              )}
              <Text style={styles.compareText}>{compareToBest(cur, earlierBest)}</Text>
            </View>
          ) : (
            <View style={styles.clockBlock}>
              <Ionicons name="stop-circle-outline" size={34} color="#6A6A6A" />
              <Text style={styles.stopped}>Not running</Text>
              <Text style={styles.since}>Start it again with the + on Streaks.</Text>
            </View>
          )}

          <View style={styles.stats}>
            {[
              [short(best), 'BEST RUN'],
              [short(total), 'TOTAL'],
              [String(restarts), restarts === 1 ? 'RESTART' : 'RESTARTS'],
            ].map(([value, label]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>EVERY RUN</Text>
          <View style={styles.chart}>
            {ordered.map((run, i) => (
              <View
                key={run.id}
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(6, best > 0 ? (lengths[i] / best) * 100 : 6)}%`,
                    backgroundColor: run.ended_at ? withAlpha(accent, 0.35) : accent,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.list}>
            {[...ordered].reverse().map((run, i, all) => (
              <Pressable
                key={run.id}
                onLongPress={run.ended_at ? () => onDeleteRun(run) : undefined}
                delayLongPress={350}
                style={[styles.row, i < all.length - 1 && styles.rowDivider]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {dateLabel(run.started_at)} – {run.ended_at ? dateLabel(run.ended_at) : 'now'}
                  </Text>
                  <Text style={styles.rowMeta}>{run.ended_at ? 'ended' : 'running'}</Text>
                </View>
                <Text style={[styles.rowValue, !run.ended_at && { color: accent }]}>{short(secondsOf(run, now))}</Text>
              </Pressable>
            ))}
          </View>
          {ordered.some(r => r.ended_at) && <Text style={styles.hint}>Hold a past run to delete it</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headerSide: { width: 44 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#F2F2F2' },
  content: { paddingHorizontal: 16, gap: 14 },
  clockBlock: { alignItems: 'center', paddingVertical: 18, gap: 2 },
  bigDays: { fontSize: 88, fontWeight: '800', color: '#FFFFFF', letterSpacing: -3, lineHeight: 92, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 18, color: '#A0A0A0', fontWeight: '600' },
  clock: { fontSize: 26, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },
  since: { fontSize: 13, color: '#7A7A7A', marginTop: 6 },
  compare: { alignSelf: 'stretch', paddingHorizontal: 24, marginTop: 16 },
  compareTrack: { height: 6, borderRadius: 3, backgroundColor: '#222', overflow: 'visible', justifyContent: 'center' },
  compareFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  compareMark: { position: 'absolute', width: 2, height: 14, marginLeft: -1, borderRadius: 1, backgroundColor: '#FFFFFF' },
  compareText: { fontSize: 13, color: '#9A9A9A', marginTop: 10 },
  stopped: { fontSize: 20, fontWeight: '700', color: '#B8B8B8', marginTop: 6 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#F2F2F2', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: '#7A7A7A', marginTop: 2 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: '#6F6F6F', marginTop: 6, marginLeft: 4 },
  chart: {
    height: 110,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    padding: 12,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
  },
  bar: { flex: 1, maxWidth: 40, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  list: { backgroundColor: '#141414', borderWidth: 1, borderColor: '#222', borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#E8E8E8' },
  rowMeta: { fontSize: 12, color: '#7A7A7A', marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '800', color: '#CFCFCF', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12, color: '#555', textAlign: 'center' },
});

export default StreakDetail;
