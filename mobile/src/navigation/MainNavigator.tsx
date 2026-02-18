import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import OasisHomeScreen from '../screens/OasisHomeScreen';
import ChatScreen from '../screens/ChatScreen';
import RoutineScreen from '../screens/RoutineScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryHistoryScreen from '../screens/SummaryHistoryScreen';
import OasisMemoryScreen from '../screens/OasisMemoryScreen';
import { OasisStackParamList } from '../types/navigation';

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
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const OasisStack = createNativeStackNavigator<OasisStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

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
    </ProfileStack.Navigator>
  );
};

const MainNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarIcon: ({ focused }: { focused: boolean }) => {
          const iconMap: Record<string, { active: string; inactive: string }> = {
            OasisTab: { active: 'home', inactive: 'home-outline' },
            Routine: { active: 'calendar', inactive: 'calendar-outline' },
            Stats: { active: 'bar-chart', inactive: 'bar-chart-outline' },
            Profile: { active: 'person', inactive: 'person-outline' },
          };
          const icons = iconMap[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
          return (
            <Ionicons
              name={(focused ? icons.active : icons.inactive) as any}
              size={24}
              color={focused ? '#FFFFFF' : '#555555'}
            />
          );
        },
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1,
          borderTopColor: '#2A2A2A',
          height: 85,
          paddingBottom: 16,
          paddingTop: 10,
        },
      })}
    >
      <Tab.Screen name="OasisTab" component={OasisStackNavigator} />
      <Tab.Screen name="Routine" component={RoutineScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
};

export default MainNavigator;
