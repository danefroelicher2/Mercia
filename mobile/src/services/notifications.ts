import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PUSH_TOKEN_KEY = 'oasis_push_token';
const NOTIFICATION_PREFS_KEY = 'oasis_notification_prefs';

export interface NotificationPrefs {
  dailyQuestionReminder: boolean;
  dailyQuestionTime: { hour: number; minute: number };
  weeklySummaryReady: boolean;
  inactivityReminder: boolean;
  streakAtRisk: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyQuestionReminder: true,
  dailyQuestionTime: { hour: 9, minute: 0 },
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

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
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

  // Daily question reminder
  await cancelNotification('daily-question');
  if (prefs.dailyQuestionReminder) {
    await scheduleLocalNotification(
      'daily-question',
      'Daily Question',
      "Your daily reflection question is ready. Take a moment to answer it.",
      {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: prefs.dailyQuestionTime.hour,
        minute: prefs.dailyQuestionTime.minute,
      }
    );
  }

  // Weekly summary
  await cancelNotification('weekly-summary');
  if (prefs.weeklySummaryReady) {
    await scheduleLocalNotification(
      'weekly-summary',
      'Weekly Summary Ready',
      "Your weekly Oasis summary is ready to review.",
      {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday
        hour: 9,
        minute: 0,
      }
    );
  }

  // inactivityReminder and streakAtRisk are server-side push notifications.
  // Preferences are already saved to AsyncStorage above; the server reads them
  // via the push token to decide whether to send those notifications.
}
