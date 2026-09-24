import { useEffect, useState } from 'react';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import { SECTION_COLORS, getCurrentTimeOfDay } from '../utils/timeOfDay';
import { TimeOfDay } from '../types/routine';

// The color of the current part of the day (morning sky, afternoon sun,
// night indigo), using the user's own section boundaries. Gym and Streaks
// take their accent from this so the whole sidebar area shares Routine's
// light. Re-checks every minute so it changes on its own at the boundary.
export function useTimeOfDayAccent(): { accent: string; section: TimeOfDay } {
  const { boundaries } = useRoutinePreferences();
  const [section, setSection] = useState<TimeOfDay>(() => getCurrentTimeOfDay(new Date(), boundaries));
  useEffect(() => {
    const update = () => setSection(getCurrentTimeOfDay(new Date(), boundaries));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [boundaries]);
  return { accent: SECTION_COLORS[section], section };
}
