import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import api, { onAction } from './api';

// Keeps the iOS streak widget's snapshot (App Group, key "streak") current.
// The widget works out Morning/Afternoon/Night and "Done" from this plus the
// clock, so it stays right even on days the app isn't opened.
//
// Written: on launch/foreground (from the server), right after any action
// (optimistically — the server records the day just after it responds), when
// the day-part times change, and cleared on sign-out.

const APP_GROUP = 'group.com.oasisai.app';
const KEY = 'streak';

interface Snapshot {
  v: 1;
  lastActive: string | null;
  streakThroughLastActive: number;
  recentActive: string[];
  afternoonStart: number;
  nightStart: number;
  updatedAt: string;
}

const storage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;
let dayParts = { afternoonStart: 720, nightStart: 1080 };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};

function read(): Snapshot | null {
  try {
    const raw = storage?.get(KEY);
    const snap = raw ? JSON.parse(raw) : null;
    return snap?.v === 1 ? snap : null;
  } catch {
    return null;
  }
}

function write(snap: Omit<Snapshot, 'v' | 'updatedAt' | 'afternoonStart' | 'nightStart'>) {
  if (!storage) return;
  try {
    const recent = Array.from(new Set(snap.recentActive)).sort().slice(-14);
    storage.set(KEY, JSON.stringify({ v: 1, ...snap, recentActive: recent, ...dayParts, updatedAt: new Date().toISOString() }));
    ExtensionStorage.reloadWidget();
  } catch (err) {
    console.warn('[Widget] write failed:', err);
  }
}

/** Replace the snapshot with the server's streak (launch, foreground). */
export async function syncWidgetFromServer(): Promise<void> {
  if (!storage) return;
  try {
    const res = await api.get('/api/stats/streaks');
    const d = res.data?.data;
    if (!d) return;
    write({ lastActive: d.lastActive ?? null, streakThroughLastActive: d.currentStreak ?? 0, recentActive: d.recentActive ?? [] });
  } catch {
    // Offline or signed out: keep the last snapshot; the widget still follows the clock.
  }
}

/** The user just did something: today counts, right away. */
export function markTodayActive(): void {
  if (!storage) return;
  const snap = read();
  const t = today();
  if (snap?.lastActive === t) return;
  const streak = snap?.lastActive === yesterday() ? snap.streakThroughLastActive + 1 : 1;
  write({ lastActive: t, streakThroughLastActive: streak, recentActive: [...(snap?.recentActive ?? []), t] });
}

/** The user's Afternoon/Night start times (minutes after midnight). */
export function setWidgetDayParts(afternoonStart: number, nightStart: number): void {
  dayParts = { afternoonStart, nightStart };
  const snap = read();
  if (snap) write(snap);
}

// Any action anywhere in the app counts for today.
onAction(markTodayActive);

/** Signed out: the widget shows "Open Mercia to start your streak". */
export function clearWidget(): void {
  if (!storage) return;
  try {
    storage.remove(KEY);
    ExtensionStorage.reloadWidget();
  } catch {}
}
