import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

const PUSH_TOKEN_KEY = 'mercia_push_token';
const NOTIFICATION_PREFS_KEY = 'mercia_notification_prefs';

export interface NotificationPrefs {
  weeklySummaryReady: boolean;
  inactivityReminder: boolean;
  streakAtRisk: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  weeklySummaryReady: true,
  inactivityReminder: true,
  streakAtRisk: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
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

export async function scheduleLocalNotification(
  identifier: string,
  title: string,
  body: string,
  trigger: any
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger,
  });
}

export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function applyNotificationPreferences(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));

  // Weekly summary
  await cancelNotification('weekly-summary');
  if (prefs.weeklySummaryReady) {
    await scheduleLocalNotification(
      'weekly-summary',
      'Weekly Summary Ready',
      "Your weekly Mercia summary is ready to review.",
      {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday
        hour: 9,
        minute: 0,
      }
    );
  }

  // Sync all preferences (including server-side ones) to backend
  try {
    await api.put('/api/notifications/preferences', {
      weeklySummaryEnabled: prefs.weeklySummaryReady,
      inactivityReminderEnabled: prefs.inactivityReminder,
      streakAtRiskEnabled: prefs.streakAtRisk,
    });
  } catch {
    // Non-fatal — local prefs still applied
  }
}
