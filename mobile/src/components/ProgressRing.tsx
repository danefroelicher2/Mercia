import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ProgressRingProps {
  percentage: number;
  color: string;
  trackColor: string;
  size?: number;
  stroke?: number;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  color,
  trackColor,
  size = 86,
  stroke = 8,
}) => {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * (Math.min(Math.max(percentage, 0), 100) / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* track */}
        <Circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* progress */}
        <Circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={[filled, circumference - filled]}
          strokeLinecap="round"
          rotation={-90}
          originX={cx}
          originY={cx}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.ringInner}>
          <Text style={styles.ringPct}>{percentage}%</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  ringInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default ProgressRing;
