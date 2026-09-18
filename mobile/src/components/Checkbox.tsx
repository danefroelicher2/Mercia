import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Round checkbox in the section color, with a small pop when it becomes
// checked. Shared by Today items and goals.
const Checkbox: React.FC<{ done: boolean; color: string }> = ({ done, color }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
    }
    wasDone.current = done;
  }, [done, scale]);
  return (
    <Animated.View
      style={[
        styles.checkbox,
        { borderColor: color, transform: [{ scale }] },
        done && { backgroundColor: color },
      ]}
    >
      {done && <Ionicons name="checkmark" size={12} color="#0D0D0D" />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Checkbox;
