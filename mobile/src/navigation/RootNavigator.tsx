import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ConsentScreen from '../screens/ConsentScreen';
import { hasConsentBeenAnswered } from '../services/consentService';

export type RootStackParamList = {
  Main: undefined;
  Consent: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Renders MainNavigator and immediately navigates to Consent if not yet answered
const MainWithConsentCheck: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    const check = async () => {
      const answered = await hasConsentBeenAnswered();
      if (!answered) {
        navigation.navigate('Consent');
      }
    };
    check();
  }, []);

  return <MainNavigator />;
};

const AuthenticatedRoot: React.FC = () => (
  <RootStack.Navigator screenOptions={{ headerShown: false }}>
    <RootStack.Screen name="Main" component={MainWithConsentCheck} />
    <RootStack.Screen
      name="Consent"
      component={ConsentScreen}
      options={{ presentation: 'fullScreenModal' }}
    />
  </RootStack.Navigator>
);

const RootNavigator: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      {isAuthenticated ? <AuthenticatedRoot /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
