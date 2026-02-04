import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OasisScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Oasis AI</Text>
        <Text style={styles.subtitle}>Coming in Phase 3</Text>
        <Text style={styles.description}>
          Your personal AI assistant will be available here soon.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#007AFF',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default OasisScreen;
