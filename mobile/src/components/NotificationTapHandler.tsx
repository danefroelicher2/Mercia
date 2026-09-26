import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useDrawer } from '../context/DrawerContext';

// Opens the right screen when a reminder is tapped (also on a cold start):
// routine reminders → the Routine tab, streak reminders → Home.
const NotificationTapHandler: React.FC = () => {
  const response = Notifications.useLastNotificationResponse();
  const navigation = useNavigation<any>();
  const { selectSection } = useDrawer();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const screen = response.notification.request.content.data?.screen;
    if (screen === 'routine') selectSection('routine');
    else if (screen === 'home') navigation.navigate('Tabs', { screen: 'MerciaTab' });
  }, [response, navigation, selectSection]);

  return null;
};

export default NotificationTapHandler;
