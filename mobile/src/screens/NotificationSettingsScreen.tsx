import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import {
  ALL_ON,
  ReminderKey,
  ReminderPrefs,
  fetchReminderPrefs,
  registerForPushNotifications,
  saveReminderPref,
} from '../services/notifications';

// Profile → Notifications: the eight reminders, each on/off. The server sends
// each one only when there's something to act on; times follow the user's own
// Afternoon/Night starts (same math as backend lib/notificationRules).

const GREEN = '#5DCAA5';

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

type Row = { key: ReminderKey; title: string; when: string };

function groups(afternoon: number, night: number): { name: string; color: string; rows: Row[] }[] {
  const latest = 23 * 60 + 45;
  return [
    {
      name: 'Routine',
      color: '#5DCAA5',
      rows: [
        { key: 'morningWrapup', title: 'Morning wrap-up', when: `${clock(afternoon - 60)} · if morning items are left` },
        { key: 'afternoonWrapup', title: 'Afternoon wrap-up', when: `${clock(night - 60)} · if afternoon items are left` },
        { key: 'nightCheck', title: 'Night check', when: `${clock(Math.min(night + 120, latest))} · if night items are left` },
      ],
    },
    {
      name: 'Streak',
      color: '#8E9BFF',
      rows: [
        { key: 'streakAtRisk', title: 'Streak at risk', when: `${clock(night)} · if you haven’t done anything today` },
        { key: 'lastCall', title: 'Last call', when: `${clock(Math.min(Math.max(23 * 60, night + 30), latest))} · if your streak is still at risk` },
        { key: 'freshStart', title: 'Fresh start', when: '9:00 AM · the morning after a streak ends' },
      ],
    },
    {
      name: 'Goals',
      color: '#D8B45A',
      rows: [
        { key: 'weeklyGoals', title: 'Weekly goals', when: `Sundays at ${clock(afternoon)} · if weekly goals are left` },
        { key: 'monthlyGoals', title: 'Monthly goals', when: '3 days before month end · if monthly goals are left' },
      ],
    },
  ];
}

type Permission = 'granted' | 'denied' | 'undetermined';

const NotificationSettingsScreen: React.FC = () => {
  const { boundaries } = useRoutinePreferences();
  const [prefs, setPrefs] = useState<ReminderPrefs>(ALL_ON);
  const [permission, setPermission] = useState<Permission>('granted');

  const checkPermission = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(p => setPermission(p.status as Permission))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReminderPrefs().then(setPrefs).catch(() => {});
      checkPermission();
    }, [checkPermission]),
  );

  // Coming back from iOS Settings: re-check.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => s === 'active' && checkPermission());
    return () => sub.remove();
  }, [checkPermission]);

  const toggle = (key: ReminderKey, on: boolean) => {
    setPrefs(p => ({ ...p, [key]: on }));
    saveReminderPref(key, on).catch(() => setPrefs(p => ({ ...p, [key]: !on })));
  };

  const blocked = permission !== 'granted';
  const enable = async () => {
    if (permission === 'undetermined') {
      await registerForPushNotifications().catch(() => null);
      checkPermission();
    } else {
      Linking.openSettings();
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {blocked ? (
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Notifications are off for Mercia</Text>
            <Text style={styles.bannerText}>
              {permission === 'undetermined' ? 'Allow them to get these reminders.' : 'Turn them on in iOS Settings to get these.'}
            </Text>
          </View>
          <Pressable onPress={enable} style={({ pressed }) => [styles.bannerButton, pressed && { opacity: 0.7 }]}>
            <Text style={styles.bannerButtonText}>{permission === 'undetermined' ? 'Allow' : 'Open Settings'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.intro}>
        Pick the reminders you want. Each one is only sent when there{'’'}s something to do, and times follow your Morning, Afternoon
        and Night.
      </Text>

      {groups(boundaries.afternoonStart, boundaries.nightStart).map(g => (
        <View key={g.name} style={[styles.groupWrap, blocked && styles.dim]}>
          <View style={styles.group}>
            <View style={[styles.groupDot, { backgroundColor: g.color }]} />
            <Text style={styles.groupTitle}>{g.name}</Text>
          </View>
          <View style={styles.card}>
            {g.rows.map((r, i) => (
              <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, !prefs[r.key] && styles.titleOff]}>{r.title}</Text>
                  <Text style={styles.when}>{r.when}</Text>
                </View>
                <Switch
                  value={prefs[r.key]}
                  onValueChange={on => toggle(r.key, on)}
                  trackColor={{ false: '#39393D', true: GREEN }}
                  ios_backgroundColor="#39393D"
                  accessibilityLabel={r.title}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.foot}>
        <Text style={styles.footStrong}>At most 3 a day.</Text> Nothing between midnight and 7 AM, and nothing right after you{'’'}ve
        been in the app.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(232,161,58,0.10)', borderWidth: 1, borderColor: 'rgba(232,161,58,0.35)',
  },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: '#F2C27A' },
  bannerText: { fontSize: 12, color: '#B9A07A', marginTop: 2 },
  bannerButton: { backgroundColor: '#E8A13A', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  bannerButtonText: { fontSize: 12, fontWeight: '700', color: '#1A1206' },
  intro: { fontSize: 13, color: '#8A8A8A', lineHeight: 19 },
  groupWrap: { gap: 10 },
  dim: { opacity: 0.45 },
  group: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
    paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2A2A',
  },
  groupDot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 3 },
  groupTitle: { fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 30, lineHeight: 36, color: '#F2F2F2' },
  card: { backgroundColor: '#161616', borderRadius: 12, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#262626' },
  title: { fontSize: 15, color: '#E8E8E8' },
  titleOff: { color: '#8A8A8A' },
  when: { fontSize: 12, color: '#7D7D7D', marginTop: 2 },
  foot: { fontSize: 12, color: '#6F6F6F', lineHeight: 18, paddingHorizontal: 2 },
  footStrong: { color: '#9A9A9A', fontWeight: '600' },
});

export default NotificationSettingsScreen;
