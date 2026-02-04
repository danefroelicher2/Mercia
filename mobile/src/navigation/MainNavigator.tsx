import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import OasisScreen from '../screens/OasisScreen';
import RoutineScreen from '../screens/RoutineScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Main tab param list
export type MainTabParamList = {
  Oasis: undefined;
  Routine: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Simple icon component using text/emoji (we can replace with proper icons later)
const TabIcon: React.FC<{ name: string; focused: boolean }> = ({ name, focused }) => {
  let icon = '';
  switch (name) {
    case 'Oasis':
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
      <Tab.Screen name="Oasis" component={OasisScreen} />
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
