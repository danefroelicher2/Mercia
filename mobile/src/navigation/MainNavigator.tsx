import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, StyleSheet } from 'react-native';
import OasisHomeScreen from '../screens/OasisHomeScreen';
import ChatScreen from '../screens/ChatScreen';
import RoutineScreen from '../screens/RoutineScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { OasisStackParamList } from '../types/navigation';

// Main tab param list
export type MainTabParamList = {
  OasisTab: undefined;
  Routine: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const OasisStack = createNativeStackNavigator<OasisStackParamList>();

// Simple icon component using text/emoji (we can replace with proper icons later)
const TabIcon: React.FC<{ name: string; focused: boolean }> = ({ name, focused }) => {
  let icon = '';
  switch (name) {
    case 'OasisTab':
      icon = '🏠';
      break;
    case 'Routine':
      icon = '📅';
      break;
    case 'Profile':
      icon = '👤';
      break;
    default:
      icon = '•';
  }
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icon}
    </Text>
  );
};

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

const MainNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }: { focused: boolean }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      })}
    >
      <Tab.Screen
        name="OasisTab"
        component={OasisStackNavigator}
        options={{
          tabBarLabel: 'Oasis',
        }}
      />
      <Tab.Screen name="Routine" component={RoutineScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    paddingBottom: 8,
    height: 60,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  icon: {
    fontSize: 20,
  },
  iconFocused: {
    fontSize: 22,
  },
});

export default MainNavigator;
