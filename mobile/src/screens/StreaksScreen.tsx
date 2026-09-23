import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Placeholder for Streaks (running counters for anything you want to keep
// going). Reached from the side drawer; the real thing comes later.
const StreaksScreen: React.FC = () => (
  <View style={styles.container}>
    <Ionicons name="flame-outline" size={44} color="#F3BF4C" />
    <Text style={styles.title}>Streaks</Text>
    <Text style={styles.subtitle}>Coming soon</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  subtitle: {
    fontSize: 14,
    color: '#7A7A7A',
  },
});

export default StreaksScreen;
