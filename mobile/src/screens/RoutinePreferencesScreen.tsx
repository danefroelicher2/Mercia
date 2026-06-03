import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  weekly: 'routine_prefs_show_weekly',
  monthly: 'routine_prefs_show_monthly',
  yearly: 'routine_prefs_show_yearly',
  notepad: 'routine_prefs_show_notepad',
};

const RoutinePreferencesScreen: React.FC = () => {
  const [showWeekly, setShowWeekly] = useState(true);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showYearly, setShowYearly] = useState(true);
  const [showNotepad, setShowNotepad] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [w, m, y, n] = await Promise.all([
        AsyncStorage.getItem(KEYS.weekly),
        AsyncStorage.getItem(KEYS.monthly),
        AsyncStorage.getItem(KEYS.yearly),
        AsyncStorage.getItem(KEYS.notepad),
      ]);
      if (w !== null) setShowWeekly(w === 'true');
      if (m !== null) setShowMonthly(m === 'true');
      if (y !== null) setShowYearly(y === 'true');
      if (n !== null) setShowNotepad(n === 'true');
    };
    load();
  }, []);

  const toggle = async (key: keyof typeof KEYS, current: boolean) => {
    const next = !current;
    if (key === 'weekly') setShowWeekly(next);
    else if (key === 'monthly') setShowMonthly(next);
    else if (key === 'yearly') setShowYearly(next);
    else setShowNotepad(next);
    await AsyncStorage.setItem(KEYS[key], String(next));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Choose which sections appear in your Routine tab. Today's tasks are always shown. Toggle off anything you don't use to keep your view focused.
        </Text>

        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Weekly Goals</Text>
            <Switch
              value={showWeekly}
              onValueChange={() => toggle('weekly', showWeekly)}
              trackColor={{ false: '#333333', true: '#1D9E75' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Monthly Goals</Text>
            <Switch
              value={showMonthly}
              onValueChange={() => toggle('monthly', showMonthly)}
              trackColor={{ false: '#333333', true: '#1D9E75' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Yearly Goals</Text>
            <Switch
              value={showYearly}
              onValueChange={() => toggle('yearly', showYearly)}
              trackColor={{ false: '#333333', true: '#1D9E75' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Notepad</Text>
            <Switch
              value={showNotepad}
              onValueChange={() => toggle('notepad', showNotepad)}
              trackColor={{ false: '#333333', true: '#1D9E75' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  description: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 4,
  },
  group: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E8E8E8',
  },
});

export default RoutinePreferencesScreen;
