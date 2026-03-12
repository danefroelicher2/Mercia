import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ConsentScreen from '../screens/ConsentScreen';
import { hasConsentBeenAnswered } from '../services/consentService';

const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  // null = not yet checked, true = answered (yes or no), false = not yet answered
  const [consentAnswered, setConsentAnswered] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!isAuthenticated) {
      // Reset consent check state so it re-runs after next login
      setConsentAnswered(null);
      return;
    }

    hasConsentBeenAnswered().then(setConsentAnswered);
  }, [isAuthenticated, isAuthLoading]);

  // Show spinner while auth is resolving or while we check AsyncStorage for consent
  if (isAuthLoading || (isAuthenticated && consentAnswered === null)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // Not authenticated — show auth flow
  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    );
  }

  // Authenticated but consent not yet answered — show ConsentScreen ONLY.
  // No NavigationContainer, no stack, no gesture dismissal possible.
  if (!consentAnswered) {
    return (
      <ConsentScreen onConsentAnswered={() => setConsentAnswered(true)} />
    );
  }

  // Authenticated and consent answered — show main app
  return (
    <NavigationContainer>
      <MainNavigator />
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RootNavigator;
