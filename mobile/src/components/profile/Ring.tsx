import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// A progress ring with rounded ends, filling clockwise from 12 o'clock, with
// anything you like in the middle.

interface Props {
  size: number;
  stroke: number;
  progress: number; // 0–1
  color: string;
  track?: string;
  children?: React.ReactNode;
}

const Ring: React.FC<Props> = ({ size, stroke, progress, color, track = '#242424', children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 ? (
          <Circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${c * p} ${c}`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });

export default Ring;
