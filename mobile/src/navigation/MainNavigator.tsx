import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MerciaHomeScreen from '../screens/MerciaHomeScreen';
import ChatScreen from '../screens/ChatScreen';
import RoutineScreen from '../screens/RoutineScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SummaryDataScreen from '../screens/SummaryDataScreen';
import GymMemoryScreen from '../screens/GymMemoryScreen';
import GymArchiveScreen from '../screens/GymArchiveScreen';
import YearlyReviewsScreen from '../screens/YearlyReviewsScreen';
import StatsArchiveScreen from '../screens/StatsArchiveScreen';
import StatsArchiveYearScreen from '../screens/StatsArchiveYearScreen';
import type { ArchivedYear } from '../screens/statsArchiveData';
import { useRoutinePreferences } from '../context/RoutinePreferencesContext';
import YearlyReviewDetailScreen from '../screens/YearlyReviewDetailScreen';
import YearlyGoalsScreen from '../screens/YearlyGoalsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PaywallScreen from '../screens/PaywallScreen';
import { useSubscription } from '../context/SubscriptionContext';
import { MerciaStackParamList } from '../types/navigation';
import { getConsent } from '../services/consentService';
import api from '../services/api';
import { setWidgetDayParts, syncWidgetFromServer } from '../services/widgetSync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from '../services/notifications';
import { STORAGE_KEYS } from '../constants/config';
import SideDrawer from '../components/SideDrawer';
import NotificationTapHandler from '../components/NotificationTapHandler';
import { DrawerProvider } from '../context/DrawerContext';

// Root stack param list (tabs + paywall modal)
export type MainRootStackParamList = {
  Tabs: undefined;
  Paywall: undefined;
};

// Main tab param list
export type MainTabParamList = {
  MerciaTab: undefined;
  Routine: undefined;
  Stats: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  SummaryData: undefined;
  GymMemory: undefined;
  GymArchive: undefined;
  YearlyReviews: undefined;
  StatsArchive: undefined;
  StatsArchiveYear: { entry: ArchivedYear };
  YearlyReviewDetail: { year: number };
  NotificationSettings: undefined;
  YearlyGoals: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const MerciaStack = createNativeStackNavigator<MerciaStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MainRootStack = createNativeStackNavigator<MainRootStackParamList>();

// Mercia Stack Navigator (contains MerciaHome and ChatScreen)
const MerciaStackNavigator: React.FC = () => {
  return (
    <MerciaStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <MerciaStack.Screen
        name="MerciaHome"
        component={MerciaHomeScreen}
        options={{ headerShown: false }}
      />
      <MerciaStack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.chat?.title || 'Chat',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: '#1A1A1A',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
          },
        })}
      />
    </MerciaStack.Navigator>
  );
};

// Profile Stack Navigator
const ProfileStackNavigator: React.FC = () => {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen
        name="GymMemory"
        component={GymMemoryScreen}
        options={{
          headerShown: true,
          title: 'Gym Memory',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="GymArchive"
        component={GymArchiveScreen}
        options={{
          headerShown: true,
          title: 'Gym Archive',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="StatsArchive"
        component={StatsArchiveScreen}
        options={{
          headerShown: true,
          title: 'Stats Archive',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="StatsArchiveYear"
        component={StatsArchiveYearScreen}
        options={{
          headerShown: true,
          title: '',
          headerBackTitle: 'Archive',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="YearlyReviews"
        component={YearlyReviewsScreen}
        options={{
          headerShown: true,
          title: 'Yearly Reviews',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="YearlyReviewDetail"
        component={YearlyReviewDetailScreen}
        options={{
          headerShown: true,
          title: 'Your Year',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="SummaryData"
        component={SummaryDataScreen}
        options={{
          headerShown: true,
          title: 'Summary Data',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          headerShown: true,
          title: 'Notifications',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
      <ProfileStack.Screen
        name="YearlyGoals"
        component={YearlyGoalsScreen}
        options={{
          headerShown: true,
          title: 'Yearly Goals',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
    </ProfileStack.Navigator>
  );
};

// Internal tabs component - rendered inside MainRootStack so useNavigation gives root stack navigation
const MainTabs: React.FC = () => {
  const { isSubscribed, isLoadingSubscription } = useSubscription();
  const rootNavigation = useNavigation<NativeStackNavigationProp<MainRootStackParamList>>();
  const { boundaries, loaded: prefsLoaded } = useRoutinePreferences();

  // Update last_active_at (inactivity pushes) and tell the server this
  // device's time zone and Morning/Afternoon/Night times, so each day and
  // year close at the user's own midnight (routine stats). Re-sent when the
  // times change in the Routine gear.
  useEffect(() => {
    if (!prefsLoaded) return;
    AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN).then((token) => {
      if (!token) return;
      api.post('/api/notifications/ping', {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        afternoonStart: boundaries.afternoonStart,
        nightStart: boundaries.nightStart,
      }).catch(() => {});
    });
  }, [prefsLoaded, boundaries.afternoonStart, boundaries.nightStart]);

  // Streak widget: sync its snapshot at launch, whenever the app comes back to
  // the foreground, and when the Afternoon/Night times change. Foregrounding
  // also refreshes the server's last-active time.
  useEffect(() => {
    if (!prefsLoaded) return;
    setWidgetDayParts(boundaries.afternoonStart, boundaries.nightStart);
    syncWidgetFromServer();
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      syncWidgetFromServer();
      // Last-active time: reminders hold off while the user was just in the app.
      api.post('/api/notifications/ping', {}).catch(() => {});
    });
    return () => sub.remove();
  }, [prefsLoaded, boundaries.afternoonStart, boundaries.nightStart]);

  const [hasConsent, setHasConsent] = useState(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState(true);

  useEffect(() => {
    getConsent().then((value) => {
      setHasConsent(value);
      setIsLoadingConsent(false);
    });

    // Only ping and register if we have a valid session token
    AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN).then((token) => {
      if (!token) return;
      // Ensure push token is registered / synced to backend
      registerForPushNotifications().catch(() => {});
    });
  }, []);

  const isLoading = isLoadingSubscription || isLoadingConsent;
  const isLocked = !isLoading && (!isSubscribed || !hasConsent);

  // Refs updated synchronously each render so the tabPress handler always reads
  // the latest values — React Navigation registers listeners via internal useEffect
  // (async, after paint), so a plain closure can capture stale state if the user
  // taps in the window between a re-render and the listener being re-registered.
  const isSubscribedRef = useRef(isSubscribed);
  const isLoadingRef = useRef(isLoading);
  const hasConsentRef = useRef(hasConsent);
  isSubscribedRef.current = isSubscribed;
  isLoadingRef.current = isLoading;
  hasConsentRef.current = hasConsent;

  // Debug render log
  console.log('[MainNavigator] render — isSubscribed:', isSubscribed, '| isLoadingSubscription:', isLoadingSubscription, '| hasConsent:', hasConsent, '| isLoadingConsent:', isLoadingConsent, '| isLocked:', isLocked);

  // The side drawer's items (Routine / Gym / Streaks) live on the Routine tab.
  const showRoutineTab = useCallback(() => {
    rootNavigation.navigate('Tabs', { screen: 'Routine' } as never);
  }, [rootNavigation]);

  return (
    <DrawerProvider onShowRoutineTab={showRoutineTab}>
    <NotificationTapHandler />
    <SideDrawer>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1,
          borderTopColor: '#2A2A2A',
          height: 85,
          paddingBottom: 16,
          paddingTop: 10,
        },
      }}
    >
      <Tab.Screen
        name="MerciaTab"
        component={MerciaStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name={focused ? 'home' : 'home-outline'}
                size={24}
                color={focused ? '#FFFFFF' : '#555555'}
              />
              {isLocked && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={9} color="#888888" />
                </View>
              )}
            </View>
          ),
        }}
        listeners={({ navigation: tabNav }) => ({
          tabPress: (e) => {
            // Read from refs so we always get the latest values regardless of
            // when React Navigation last re-registered this handler.
            const subscribed = isSubscribedRef.current;
            const loading = isLoadingRef.current;
            const consent = hasConsentRef.current;
            console.log('[MainNavigator] tabPress — isSubscribed:', subscribed, '| isLoading:', loading, '| hasConsent:', consent);
            if (loading) {
              // Still loading — block the tap silently, state isn't settled yet
              e.preventDefault();
              return;
            }
            if (!subscribed) {
              console.log('[MainNavigator] tabPress — blocking: not subscribed → showing Paywall');
              e.preventDefault();
              rootNavigation.navigate('Paywall');
            } else if (!consent) {
              console.log('[MainNavigator] tabPress — blocking: no consent → showing Alert');
              e.preventDefault();
              Alert.alert(
                'Consent Required',
                'Please enable AI Data Consent in your Profile settings to access Mercia.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Go to Profile', onPress: () => tabNav.navigate('Profile') },
                ]
              );
            } else {
              console.log('[MainNavigator] tabPress — allowing navigation to Mercia');
            }
          },
        })}
      />
      <Tab.Screen
        name="Routine"
        component={RoutineScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={24}
              color={focused ? '#FFFFFF' : '#555555'}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'bar-chart' : 'bar-chart-outline'}
              size={24}
              color={focused ? '#FFFFFF' : '#555555'}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={focused ? '#FFFFFF' : '#555555'}
            />
          ),
        }}
      />
    </Tab.Navigator>
    </SideDrawer>
    </DrawerProvider>
  );
};

const MainNavigator: React.FC = () => {
  return (
    <MainRootStack.Navigator screenOptions={{ headerShown: false }}>
      <MainRootStack.Screen name="Tabs" component={MainTabs} />
      <MainRootStack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </MainRootStack.Navigator>
  );
};

const styles = StyleSheet.create({
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -8,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    padding: 1,
  },
});

export default MainNavigator;
