import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import OasisHomeScreen from '../screens/OasisHomeScreen';
import ChatScreen from '../screens/ChatScreen';
import RoutineScreen from '../screens/RoutineScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryHistoryScreen from '../screens/SummaryHistoryScreen';
import OasisMemoryScreen from '../screens/OasisMemoryScreen';
import GymMemoryScreen from '../screens/GymMemoryScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PaywallScreen from '../screens/PaywallScreen';
import { useSubscription } from '../context/SubscriptionContext';
import { OasisStackParamList } from '../types/navigation';
import { getConsent } from '../services/consentService';

// Root stack param list (tabs + paywall modal)
export type MainRootStackParamList = {
  Tabs: undefined;
  Paywall: undefined;
};

// Main tab param list
export type MainTabParamList = {
  OasisTab: undefined;
  Routine: undefined;
  Stats: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Settings: undefined;
  SummaryHistory: undefined;
  OasisMemory: undefined;
  GymMemory: undefined;
  NotificationSettings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const OasisStack = createNativeStackNavigator<OasisStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MainRootStack = createNativeStackNavigator<MainRootStackParamList>();

// Oasis Stack Navigator (contains OasisHome and ChatScreen)
const OasisStackNavigator: React.FC = () => {
  return (
    <OasisStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <OasisStack.Screen
        name="OasisHome"
        component={OasisHomeScreen}
        options={{ headerShown: false }}
      />
      <OasisStack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.chat?.title || 'Chat',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: '#fff',
          },
          headerTintColor: '#007AFF',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
          },
        })}
      />
    </OasisStack.Navigator>
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
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen
        name="SummaryHistory"
        component={SummaryHistoryScreen}
        options={{
          headerShown: true,
          title: 'Summary History',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: '#1A1A1A',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
          },
        }}
      />
      <ProfileStack.Screen
        name="OasisMemory"
        component={OasisMemoryScreen}
        options={{
          headerShown: true,
          title: 'Oasis Memory',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#1A1A1A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        }}
      />
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
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          headerShown: true,
          title: 'Notification Settings',
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
  const [hasConsent, setHasConsent] = useState(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState(true);

  useEffect(() => {
    getConsent().then((value) => {
      setHasConsent(value);
      setIsLoadingConsent(false);
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

  return (
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
        name="OasisTab"
        component={OasisStackNavigator}
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
                'Please enable AI Data Consent in your Profile settings to access Oasis.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Go to Profile', onPress: () => tabNav.navigate('Profile') },
                ]
              );
            } else {
              console.log('[MainNavigator] tabPress — allowing navigation to Oasis');
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
