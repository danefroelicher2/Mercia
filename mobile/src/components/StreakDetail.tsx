import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../utils/timeOfDay';


// A streak's own page: every run recorded under its name. A readout
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
// 21.3 — days to one decimal, rounded down so it never shows a day early.
const decimalDays = (seconds: number) => (Math.floor((seconds / DAY) * 10) / 10).toFixed(1);

const secondsOf = (run: StreakRun, now: number) =>
  Math.max(0, Math.floor(((run.ended_at ? Date.parse(run.ended_at) : now) - Date.parse(run.started_at)) / 1000));

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const StreakDetail: React.FC<Props> = ({ visible, name, runs, now, accent, onClose, onMore, onDeleteRun }) => {
  const insets = useSafeAreaInsets();
  const ordered = [...runs].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const current = ordered.find(r => !r.ended_at) ?? null;
  const lengths = ordered.map(r => secondsOf(r, now));
  const best = Math.max(0, ...lengths);
  const restarts = Math.max(0, ordered.length - 1);

  const cur = current ? secondsOf(current, now) : 0;
  const last = ordered[ordered.length - 1];
  const lastSeconds = last ? secondsOf(last, now) : 0;
  const currentIsBest = current !== null && ordered.length > 1 && cur >= best;
  const startedLabel = (current ?? last)
    ? new Date((current ?? last).started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const facts: [string, string, string?][] = [
    [current ? 'Started' : 'Last started', startedLabel],
    ['Best run', `${decimalDays(best)} days`, currentIsBest ? 'this run' : undefined],
    ['Restarts', String(restarts)],
  ];

  // Bar chart: the 10 most recent runs, oldest to newest.
  const recent = ordered.slice(-10).map(run => ({ run, length: secondsOf(run, now) }));
  const recentMax = Math.max(1, ...recent.map(r => r.length));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back" style={styles.headerSide}>
            <Ionicons name="chevron-back" size={26} color="#E8E8E8" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            {current && (
              <Pressable onPress={() => onMore(current)} hitSlop={12} accessibilityLabel="Streak options">
                <Ionicons name="ellipsis-horizontal" size={22} color="#E8E8E8" />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {/* Name (script, centered, with a short accent rule), then days */}
          <View style={styles.readout}>
            <Text style={styles.name}>{name}</Text>
            <View style={[styles.rule, { backgroundColor: accent }]} />
            <Text style={styles.days}>
              {decimalDays(current ? cur : lastSeconds)}
              <Text style={styles.daysUnit}> days{current ? '' : ' last run'}</Text>
            </Text>
          </View>

          {/* Facts */}
          <View style={styles.facts}>
            {facts.map(([label, value, note], i) => (
              <View key={label} style={[styles.fact, i < facts.length - 1 && styles.factDivider]}>
                <Text style={styles.factLabel}>{label}</Text>
                <Text style={styles.factValue}>
                  {value}
                  {note ? <Text style={[styles.factNote, { color: accent }]}>  {note}</Text> : null}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>HISTORY</Text>
          <View style={styles.chart}>
            {recent.map(({ run, length }) => (
              <View
                key={run.id}
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(6, recentMax > 0 ? (length / recentMax) * 100 : 6)}%`,
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
                <Text style={[styles.rowValue, !run.ended_at && { color: accent }]}>{decimalDays(secondsOf(run, now))}d</Text>
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
  content: { paddingHorizontal: 16, gap: 14 },
  readout: { paddingTop: 12, paddingBottom: 4 },
  name: {
    fontWeight: '700',
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.3,
    color: '#F2F2F2',
    textAlign: 'center',
  },
  rule: { width: 44, height: 2, borderRadius: 1, alignSelf: 'center', marginTop: 2, marginBottom: 16 },
  days: { fontSize: 56, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  daysUnit: { fontSize: 22, fontWeight: '600', color: '#8A8A8A', letterSpacing: 0 },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#2A2A2A' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 },
  factDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1F1F1F' },
  factLabel: { fontSize: 15, color: '#8A8A8A' },
  factValue: { fontSize: 15, fontWeight: '600', color: '#E8E8E8', fontVariant: ['tabular-nums'] },
  factNote: { fontSize: 12, fontWeight: '700' },
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
