import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ProgressRing from './ProgressRing';

const C = {
  teal: '#00D9A0',
  blue: '#7B9EFF',
  trackTeal: '#1A3030',
  trackBlue: '#1A1E30',
};

const RING_SIZE = 132;
const RING_STROKE = 11;

interface HomeRingsProps {
  todayPercentage: number;
  overallPercentage: number;
}

const HomeRings: React.FC<HomeRingsProps> = ({ todayPercentage, overallPercentage }) => {
  return (
    <View style={styles.container}>
      <View style={styles.ringItem}>
        <ProgressRing
          percentage={todayPercentage}
          color={C.teal}
          trackColor={C.trackTeal}
          size={RING_SIZE}
          stroke={RING_STROKE}
        />
        <Text style={[styles.ringLabel, { color: C.teal }]}>Today</Text>
      </View>

      <View style={styles.ringItem}>
        <ProgressRing
          percentage={overallPercentage}
          color={C.blue}
          trackColor={C.trackBlue}
          size={RING_SIZE}
          stroke={RING_STROKE}
        />
        <Text style={[styles.ringLabel, { color: C.blue }]}>Overall</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  ringItem: {
    alignItems: 'center',
    gap: 8,
  },
  ringLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export default HomeRings;
