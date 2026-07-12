import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  momentumPercentage: number;
  onPressToday?: () => void;
  onPressMomentum?: () => void;
}

const HomeRings: React.FC<HomeRingsProps> = ({
  todayPercentage,
  momentumPercentage,
  onPressToday,
  onPressMomentum,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.ringItem} onPress={onPressToday} activeOpacity={0.7}>
        <ProgressRing
          percentage={todayPercentage}
          color={C.teal}
          trackColor={C.trackTeal}
          size={RING_SIZE}
          stroke={RING_STROKE}
        />
        <Text style={[styles.ringLabel, { color: C.teal }]}>Today</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.ringItem} onPress={onPressMomentum} activeOpacity={0.7}>
        <ProgressRing
          percentage={momentumPercentage}
          color={C.blue}
          trackColor={C.trackBlue}
          size={RING_SIZE}
          stroke={RING_STROKE}
        />
        <Text style={[styles.ringLabel, { color: C.blue }]}>Momentum</Text>
      </TouchableOpacity>
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
