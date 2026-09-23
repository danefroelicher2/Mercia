import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

// Shows or hides its child with a sideways slide and fade while the space it
// takes opens or closes, so the content below glides instead of jumping.
// Timed to match the Today card's page swipe.

interface Props {
  visible: boolean;
  // Which way the child leaves (and returns from): 1 = right, -1 = left.
  direction?: 1 | -1;
  children: React.ReactNode;
}

const DURATION = 320;
const SLIDE = 48;

const SlidePresence: React.FC<Props> = ({ visible, direction = 1, children }) => {
  const presence = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [height, setHeight] = useState(0);
  // Once hidden and settled, the child stops rendering (and taking touches).
  const [mounted, setMounted] = useState(visible);
  // Height is only driven while entering or leaving; otherwise the child
  // sizes itself (so its own row animations aren't clipped).
  const [animating, setAnimating] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (visible) setMounted(true);
    setAnimating(true);
    const animation = Animated.timing(presence, {
      toValue: visible ? 1 : 0,
      duration: DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      setAnimating(false);
      if (!visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, presence]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{
        height: animating && height > 0
          ? presence.interpolate({ inputRange: [0, 1], outputRange: [0, height] })
          : undefined,
        opacity: presence,
        transform: [{ translateX: presence.interpolate({ inputRange: [0, 1], outputRange: [SLIDE * direction, 0] }) }],
        overflow: 'hidden',
      }}
    >
      <View onLayout={e => setHeight(e.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
};

export default SlidePresence;
