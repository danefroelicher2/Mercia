import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { RoutinePreferencesProvider } from './context/RoutinePreferencesContext';
import RootNavigator from './navigation/RootNavigator';

const App: React.FC = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <RoutinePreferencesProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </BottomSheetModalProvider>
          </RoutinePreferencesProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
