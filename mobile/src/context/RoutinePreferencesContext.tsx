import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayBoundaries, DEFAULT_BOUNDARIES, clampBoundaries } from '../utils/timeOfDay';

// Routine tab preferences, shared so a change made in the Routine gear
// sheet applies everywhere (Routine, Home, time sheet) immediately. Stored on
// the device (AsyncStorage), same as the original visibility toggles.

export interface RoutinePreferences {
  showWeekly: boolean;
  showMonthly: boolean;
  showYearly: boolean;
  showNotepad: boolean;
  boundaries: DayBoundaries;
  multiSelect: boolean;
}

type ToggleKey = 'showWeekly' | 'showMonthly' | 'showYearly' | 'showNotepad' | 'multiSelect';

interface ContextValue extends RoutinePreferences {
  loaded: boolean;
  setToggle: (key: ToggleKey, value: boolean) => void;
  setBoundaries: (next: Partial<DayBoundaries>) => void;
  resetBoundaries: () => void;
}

// Keys for the four visibility toggles predate this context — keep them so
// existing users' choices carry over.
const KEYS: Record<ToggleKey | 'afternoonStart' | 'nightStart', string> = {
  showWeekly: 'routine_prefs_show_weekly',
  showMonthly: 'routine_prefs_show_monthly',
  showYearly: 'routine_prefs_show_yearly',
  showNotepad: 'routine_prefs_show_notepad',
  multiSelect: 'routine_prefs_multi_select',
  afternoonStart: 'routine_prefs_afternoon_start',
  nightStart: 'routine_prefs_night_start',
};

const DEFAULTS: RoutinePreferences = {
  showWeekly: true,
  showMonthly: true,
  showYearly: true,
  showNotepad: true,
  boundaries: DEFAULT_BOUNDARIES,
  multiSelect: false,
};

const RoutinePreferencesContext = createContext<ContextValue | null>(null);

export const RoutinePreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<RoutinePreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const entries = await AsyncStorage.multiGet(Object.values(KEYS));
        const stored = Object.fromEntries(entries);
        const bool = (key: string, fallback: boolean) =>
          stored[key] === null || stored[key] === undefined ? fallback : stored[key] === 'true';
        const num = (key: string) => (stored[key] == null ? undefined : Number(stored[key]));
        setPrefs({
          showWeekly: bool(KEYS.showWeekly, true),
          showMonthly: bool(KEYS.showMonthly, true),
          showYearly: bool(KEYS.showYearly, true),
          showNotepad: bool(KEYS.showNotepad, true),
          multiSelect: bool(KEYS.multiSelect, false),
          boundaries: clampBoundaries({
            afternoonStart: num(KEYS.afternoonStart),
            nightStart: num(KEYS.nightStart),
          }),
        });
      } catch (error) {
        console.error('[RoutinePreferences] Failed to load:', error);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setToggle = useCallback((key: ToggleKey, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    AsyncStorage.setItem(KEYS[key], String(value)).catch(() => {});
  }, []);

  const writeBoundaries = useCallback((next: DayBoundaries) => {
    setPrefs(prev => ({ ...prev, boundaries: next }));
    AsyncStorage.multiSet([
      [KEYS.afternoonStart, String(next.afternoonStart)],
      [KEYS.nightStart, String(next.nightStart)],
    ]).catch(() => {});
  }, []);

  const setBoundaries = useCallback(
    (next: Partial<DayBoundaries>) => {
      setPrefs(prev => {
        const merged = clampBoundaries({ ...prev.boundaries, ...next });
        AsyncStorage.multiSet([
          [KEYS.afternoonStart, String(merged.afternoonStart)],
          [KEYS.nightStart, String(merged.nightStart)],
        ]).catch(() => {});
        return { ...prev, boundaries: merged };
      });
    },
    [],
  );

  const resetBoundaries = useCallback(() => writeBoundaries(DEFAULT_BOUNDARIES), [writeBoundaries]);

  const value = useMemo<ContextValue>(
    () => ({ ...prefs, loaded, setToggle, setBoundaries, resetBoundaries }),
    [prefs, loaded, setToggle, setBoundaries, resetBoundaries],
  );

  return <RoutinePreferencesContext.Provider value={value}>{children}</RoutinePreferencesContext.Provider>;
};

export function useRoutinePreferences(): ContextValue {
  const ctx = useContext(RoutinePreferencesContext);
  if (!ctx) throw new Error('useRoutinePreferences must be used inside RoutinePreferencesProvider');
  return ctx;
}
