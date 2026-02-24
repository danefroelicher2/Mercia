import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import RootNavigator from './navigation/RootNavigator';

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <SubscriptionProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </SubscriptionProvider>
    </SafeAreaProvider>
  );
};

export default App;
