import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoutineSettingsContent from '../components/RoutineSettingsContent';

// Profile → Routine. Same settings body as the Routine tab's gear sheet.
const RoutinePreferencesScreen: React.FC = () => (
  <SafeAreaView style={styles.container} edges={['bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <RoutineSettingsContent />
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
});

export default RoutinePreferencesScreen;
