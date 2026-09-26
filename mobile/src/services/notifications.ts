import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

const PUSH_TOKEN_KEY = 'mercia_push_token';

// The eight reminders (Profile → Notifications). The server decides when to
// send each one; these switches only say which ones the user wants.
export const REMINDER_KEYS = [
  'morningWrapup',
  'afternoonWrapup',
  'nightCheck',
  'streakAtRisk',
  'lastCall',
  'freshStart',
  'weeklyGoals',
  'monthlyGoals',
] as const;
export type ReminderKey = (typeof REMINDER_KEYS)[number];
export type ReminderPrefs = Record<ReminderKey, boolean>;
export const ALL_ON: ReminderPrefs = Object.fromEntries(REMINDER_KEYS.map(k => [k, true])) as ReminderPrefs;

export async function fetchReminderPrefs(): Promise<ReminderPrefs> {
  const res = await api.get('/api/notifications/preferences');
  return { ...ALL_ON, ...(res.data?.data ?? {}) };
}

export async function saveReminderPref(key: ReminderKey, on: boolean): Promise<void> {
  await api.put('/api/notifications/preferences', { [key]: on });
}

/** Whether iOS allows Mercia's notifications at all. */
export async function notificationsAllowed(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // 1.x scheduled a local Monday "Weekly Summary Ready" reminder on the device; it's retired.
  Notifications.cancelScheduledNotificationAsync('weekly-summary').catch(() => {});
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

  // Sync token to backend so the server can send push notifications
  try {
    await api.post('/api/notifications/register', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  } catch {
    // Non-fatal — token is cached locally; will retry on next save
  }

  return token;
}
