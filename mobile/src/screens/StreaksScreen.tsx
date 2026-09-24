import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { dayLabel } from '../utils/streakDates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import StreakDetail from '../components/StreakDetail';
import { useTimeOfDayAccent } from '../hooks/useTimeOfDayAccent';
import { textOnColor, withAlpha } from '../utils/timeOfDay';

// Streaks: clocks you name and start, which count until you stop them.
// Layout (the "ledger"): the longest-running streak up top, then every
// running streak as a row with its live days + clock, then past runs.
// Names are the user's own words — nothing is ever suggested.


interface Streak {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  best_seconds?: number;
}

interface Props {
  // The header's + (owned by the Routine tab) asks for the add sheet.
  addRequest: number;
}

const DAY = 86400;
// 21.3 — days to one decimal, rounded down so it never shows a day early.
const decimalDays = (seconds: number) => (Math.floor((seconds / DAY) * 10) / 10).toFixed(1);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');

function elapsed(startIso: string, endIso: string | null, now: number) {
  const end = endIso ? Date.parse(endIso) : now;
  const total = Math.max(0, Math.floor((end - Date.parse(startIso)) / 1000));
  const days = Math.floor(total / DAY);
  const h = Math.floor((total % DAY) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { total, days, clock: `${pad(h)}:${pad(m)}:${pad(s)}`, hours: h };
}

const shortDate = (iso: string) => dayLabel(iso);

const Flame: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <Ionicons name="flame-outline" size={size} color={color} />
);

const StreaksScreen: React.FC<Props> = ({ addRequest }) => {
  // Accent follows the part of the day, like the Routine tab.
  const { accent } = useTimeOfDayAccent();
  const t = useMemo(() => makeThemedStyles(accent), [accent]);
  const [active, setActive] = useState<Streak[]>([]);
  const [past, setPast] = useState<Streak[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [held, setHeld] = useState<Streak | null>(null);
  // A stopped streak (all its runs) held in Past → delete sheet.
  const [heldPast, setHeldPast] = useState<Streak[] | null>(null);
  // A streak's own page (by name).
  const [detailName, setDetailName] = useState<string | null>(null);


  // Clocks tick every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/streaks');
      if (res.data.success) {
        setActive(res.data.data.active);
        setPast(res.data.data.past);
      }
    } catch (error) {
      console.error('[Streaks] load failed:', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Header + (skip the initial value).
  const firstRequest = useRef(addRequest);
  useEffect(() => {
    if (addRequest !== firstRequest.current) openAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest]);

  const openAdd = () => {
    setDraft('');
    setAdding(true);
  };

  const start = async () => {
    const name = draft.trim();
    if (!name) return;
    setAdding(false);
    // Shows at once; swapped for the saved row when the server answers.
    const tmp: Streak = { id: `tmp-${Date.now()}`, name, started_at: new Date().toISOString(), ended_at: null };
    setActive(prev => [...prev, tmp]);
    try {
      const res = await api.post('/api/streaks', { name });
      const saved: Streak = res.data.data;
      setActive(prev => prev.map(s => (s.id === tmp.id ? { ...saved, best_seconds: 0 } : s)));
    } catch (error) {
      console.error('[Streaks] start failed:', error);
      setActive(prev => prev.filter(s => s.id !== tmp.id));
      Alert.alert("Couldn't start", `"${name}" wasn't saved. Check your connection and try again.`);
    }
  };

  const act = async (streak: Streak, action: 'stop' | 'restart' | 'delete') => {
    setHeld(null);
    // Still saving (started a moment ago) — nothing on the server to change yet.
    if (streak.id.startsWith('tmp-')) return;
    try {
      if (action === 'delete') await api.delete(`/api/streaks/${streak.id}`);
      else await api.post(`/api/streaks/${streak.id}/${action}`);
    } catch (error) {
      console.error(`[Streaks] ${action} failed:`, error);
      Alert.alert("Couldn't save", 'That change didn’t go through. Pull down to refresh and try again.');
    }
    load();
  };

  const deletePast = async (runs: Streak[]) => {
    setHeldPast(null);
    const ids = new Set(runs.map(r => r.id));
    setPast(prev => prev.filter(r => !ids.has(r.id)));
    try {
      await Promise.all(runs.map(r => api.delete(`/api/streaks/${r.id}`)));
    } catch (error) {
      console.error('[Streaks] delete failed:', error);
      Alert.alert("Couldn't delete", 'Pull down to refresh and try again.');
    }
    load();
  };

  const confirmDelete = (streak: Streak) => {
    const fromSheet = held !== null;
    setHeld(null);
    // Let the stop sheet finish closing first, or iOS drops the alert.
    setTimeout(() => Alert.alert(`Delete “${streak.name}”?`, 'This removes this run completely, including from your history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act(streak, 'delete') },
    ]), fromSheet ? 400 : 0);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Longest running first.
  const running = [...active].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const top = running[0];


  // Past, one row per streak that isn't running now (its latest run).
  const pastGroups = Object.values(
    past.reduce<Record<string, Streak[]>>((groups, run) => {
      if (running.some(r => sameName(r.name, run.name))) return groups;
      const key = run.name.trim().toLowerCase();
      (groups[key] = groups[key] ?? []).push(run);
      return groups;
    }, {}),
  ).sort((a, b) => Date.parse(b[0].ended_at!) - Date.parse(a[0].ended_at!));

  const detailRuns = detailName ? [...active, ...past].filter(r => sameName(r.name, detailName)) : [];
  // Nothing left under this name (deleted) → close its page.
  useEffect(() => {
    if (detailName && loaded && detailRuns.length === 0) setDetailName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailName, detailRuns.length, loaded]);

  const bestDays = (s: Streak) =>
    decimalDays(Math.max(s.best_seconds ?? 0, elapsed(s.started_at, s.ended_at, now).total));

  // A running streak as its own card: a soft diagonal wash of the
  // time-of-day color (a little softer for each card down the list).
  const WASH = [1, 0.8, 0.64, 0.5];
  const renderCard = (s: Streak, index: number) => {
    const e = elapsed(s.started_at, null, now);
    const k = WASH[Math.min(index, WASH.length - 1)];
    return (
      <Pressable
        key={s.id}
        onPress={() => setDetailName(s.name)}
        onLongPress={() => setHeld(s)}
        delayLongPress={350}
        style={({ pressed }) => [styles.card, { borderColor: withAlpha(accent, 0.35 * k) }, pressed && styles.pressed]}
        accessibilityHint="Tap to see its history, hold to stop or restart"
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={`wash-${s.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.3 * k} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.06 * k} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#wash-${s.id})`} />
        </Svg>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.cardName} numberOfLines={1}>{s.name}</Text>
          <Text style={styles.cardMeta}>since {shortDate(s.started_at)}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.cardDays}>{decimalDays(e.total)}</Text>
          <Text style={styles.cardUnit}>days</Text>
        </View>
      </Pressable>
    );
  };


  if (!loaded) {
    return <View style={styles.center}><ActivityIndicator color={accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {running.length === 0 ? (
          <>
            {/* No streaks yet: say what a streak is and how to start one */}
            <View style={styles.dashed}>
              <Flame size={34} color={accent} />
              <Text style={styles.dashedTitle}>Start a streak</Text>
              <Text style={styles.dashedText}>
                Name something you're keeping going. A clock starts right away and runs until you stop it.
              </Text>
              <Pressable onPress={openAdd} style={({ pressed }) => [styles.primary, t.primary, pressed && styles.pressed]}>
                <Text style={[styles.primaryText, t.primaryText]}>+ New streak</Text>
              </Pressable>
            </View>
            <Text style={styles.section}>HOW IT WORKS</Text>
            <View style={styles.list}>
              {[
                ['Type a name', 'Your words — nothing is suggested'],
                ['Watch it count', 'Days, hours, minutes, seconds'],
                ['Hold to stop', 'Your best run is kept'],
              ].map(([title, sub], i, all) => (
                <View key={title} style={[styles.row, i < all.length - 1 && styles.rowDivider]}>
                  <View style={[styles.rowIcon, t.rowIcon]}><Text style={[styles.stepNum, t.text]}>{i + 1}</Text></View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{title}</Text>
                    <Text style={styles.rowMeta}>{sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Longest running */}
            {(() => {
              const e = elapsed(top.started_at, null, now);
              return (
                <Pressable onPress={() => setDetailName(top.name)} onLongPress={() => setHeld(top)} delayLongPress={350} style={({ pressed }) => [styles.hero, t.hero, pressed && styles.pressed]}>
                  <Text style={[styles.heroLabel, t.text]}>LONGEST RUNNING</Text>
                  <Text style={styles.heroName} numberOfLines={1}>{top.name}</Text>
                  <Text style={styles.heroDays}>
                    {decimalDays(e.total)} <Text style={[styles.heroDaysUnit, t.soft]}>days</Text>
                  </Text>
                  <Text style={styles.heroCompare}>since {shortDate(top.started_at)}</Text>
                </Pressable>
              );
            })()}

            {running.length === 1 ? (
              <View style={[styles.dashed, styles.dashedSmall]}>
                <Text style={styles.dashedText}>Keeping anything else going?</Text>
                <Pressable onPress={openAdd} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>+ New streak</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.section}>CURRENT · {running.length}</Text>
                <View style={styles.cards}>{running.map(renderCard)}</View>
              </>
            )}
            <Text style={styles.hint}>Tap a streak to see its history · hold to stop or restart</Text>
          </>
        )}

        {pastGroups.length > 0 && (
          <>
            <Text style={styles.section}>HISTORY</Text>
            <View style={styles.history}>
              {pastGroups.slice(0, 10).map((runs, i, all) => {
                const last = runs[0];
                const lastRun = elapsed(last.started_at, last.ended_at, now).total;
                return (
                  <Pressable
                    key={last.id}
                    onPress={() => setDetailName(last.name)}
                    onLongPress={() => setHeldPast(runs)}
                    delayLongPress={350}
                    style={({ pressed }) => [styles.historyRow, i < all.length - 1 && styles.historyDivider, pressed && styles.pressed]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.historyName} numberOfLines={1}>{last.name}</Text>
                      <Text style={styles.historyDates}>
                        {shortDate(last.started_at)} – {shortDate(last.ended_at!)}
                      </Text>
                    </View>
                    <Text style={styles.historyDays}>
                      {decimalDays(lastRun)}<Text style={styles.historyUnit}> days</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <StreakDetail
        visible={detailName !== null}
        name={detailName ?? ''}
        runs={detailRuns}
        now={now}
        accent={accent}
        onClose={() => setDetailName(null)}
        onMore={run => setHeld(run)}
        onDeleteRun={run => confirmDelete(run)}
      />

      {/* Start a streak */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <Pressable style={styles.scrim} onPress={() => setAdding(false)} />
          <View style={styles.sheet}>
            <View style={styles.grab} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>New streak</Text>
              <Pressable onPress={() => setAdding(false)} hitSlop={10}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, t.input]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Name it"
              placeholderTextColor="#555"
              autoFocus
              maxLength={60}
              returnKeyType="go"
              onSubmitEditing={start}
              selectionColor={accent}
              keyboardAppearance="dark"
              autoCapitalize="sentences"
            />
            <Text style={styles.sheetNote}>Counting starts the moment you tap Start.</Text>
            <Pressable
              onPress={start}
              disabled={!draft.trim()}
              style={({ pressed }) => [styles.primary, t.primary, !draft.trim() && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={[styles.primaryText, t.primaryText]}>Start the clock</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete a stopped streak */}
      <Modal visible={heldPast !== null} transparent animationType="slide" onRequestClose={() => setHeldPast(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} onPress={() => setHeldPast(null)} />
          {heldPast && (
            <View style={styles.sheet}>
              <View style={styles.grab} />
              <View style={styles.stopHead}>
                <Text style={styles.stopTitle}>Delete “{heldPast[0].name}”?</Text>
                <Text style={styles.stopText}>
                  Removes {heldPast.length === 1 ? 'this run' : `all ${heldPast.length} runs`} from your history. This can't be undone.
                </Text>
              </View>
              <Pressable onPress={() => deletePast(heldPast)} style={({ pressed }) => [styles.danger, pressed && styles.pressed]}>
                <Text style={styles.dangerText}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* Stop / restart */}
      <Modal visible={held !== null} transparent animationType="slide" onRequestClose={() => setHeld(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} onPress={() => setHeld(null)} />
          {held && (() => {
            const e = elapsed(held.started_at, null, now);
            return (
              <View style={styles.sheet}>
                <View style={styles.grab} />
                <View style={styles.stopHead}>
                  <Flame size={30} color={accent} />
                  <Text style={styles.stopTitle}>Stop “{held.name}”?</Text>
                  <Text style={styles.stopText}>
                    It's been running <Text style={styles.stopStrong}>{decimalDays(e.total)} days</Text>
                    {' '}— your best is {bestDays(held)} days.{'\n'}Stopping moves it to your history.
                  </Text>
                </View>
                <Pressable onPress={() => act(held, 'stop')} style={({ pressed }) => [styles.danger, pressed && styles.pressed]}>
                  <Text style={styles.dangerText}>Stop streak</Text>
                </Pressable>
                <Pressable onPress={() => act(held, 'restart')} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>Restart from now</Text>
                </Pressable>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
};

// Accent-colored pieces, rebuilt when the part of the day changes.
const makeThemedStyles = (accent: string) =>
  StyleSheet.create({
    primary: { backgroundColor: accent },
    primaryText: { color: textOnColor(accent) },
    text: { color: accent },
    soft: { color: withAlpha(accent, 0.75) },
    rowIcon: { backgroundColor: withAlpha(accent, 0.12) },
    hero: { backgroundColor: withAlpha(accent, 0.08), borderColor: withAlpha(accent, 0.28) },
    input: { borderColor: accent },
  });

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },

  dashed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#3A3A3A',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  dashedSmall: { paddingVertical: 16, marginTop: 0 },
  dashedTitle: { fontSize: 19, fontWeight: '800', color: '#F2F2F2' },
  dashedText: { fontSize: 14, color: '#9A9A9A', textAlign: 'center', lineHeight: 20 },

  primary: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', },
  secondary: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1C1C1C',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 16, fontWeight: '700', color: '#E8E8E8' },

  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: '#6F6F6F', marginTop: 6, marginLeft: 4 },
  list: { backgroundColor: '#141414', borderWidth: 1, borderColor: '#222', borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 15, fontWeight: '800', },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#E8E8E8' },
  rowMeta: { fontSize: 12, color: '#7A7A7A', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowDays: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  rowClock: { fontSize: 12, color: '#8A8A8A', fontVariant: ['tabular-nums'] },

  hero: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 2,
  },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, },
  heroName: { fontSize: 17, fontWeight: '700', color: '#F2F2F2', marginTop: 2 },
  heroDays: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroDaysUnit: { fontSize: 22, fontWeight: '700', },
  heroCompare: { fontSize: 13, color: '#9A9A9A', marginTop: 8 },
  cards: { gap: 10 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#262626' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  historyDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1E1E1E' },
  historyName: { fontSize: 16, fontWeight: '600', color: '#C8C8C8' },
  historyDates: { fontSize: 12, color: '#6F6F6F', marginTop: 2 },
  historyDays: { fontSize: 18, fontWeight: '700', color: '#B0B0B0', fontVariant: ['tabular-nums'] },
  historyUnit: { fontSize: 12, fontWeight: '500', color: '#6F6F6F' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#121216',
    overflow: 'hidden',
  },
  cardName: { fontSize: 17, fontWeight: '700', color: '#F2F2F2' },
  cardMeta: { fontSize: 12, color: '#A5A8B4', marginTop: 2 },
  cardDays: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  cardUnit: { fontSize: 12, color: '#A5A8B4', marginTop: -2 },
  hint: { fontSize: 12, color: '#555', textAlign: 'center', marginTop: 2 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#171717',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 12,
  },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#3A3A3A', alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#F2F2F2' },
  cancel: { fontSize: 15, color: '#8A8A8A' },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#111',
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#F2F2F2',
  },
  sheetNote: { fontSize: 12, color: '#8A8A8A' },

  stopHead: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  stopTitle: { fontSize: 19, fontWeight: '800', color: '#F2F2F2', textAlign: 'center' },
  stopText: { fontSize: 14, color: '#9A9A9A', textAlign: 'center', lineHeight: 20 },
  stopStrong: { color: '#FFFFFF', fontWeight: '700' },
  danger: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#3A1414',
    borderWidth: 1,
    borderColor: '#5A2020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontSize: 16, fontWeight: '700', color: '#FF6B6B' },
});

export default StreaksScreen;
