import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { DrawerSection, useDrawer } from '../context/DrawerContext';

// X-style side drawer around the bottom tabs. A right swipe anywhere on any
// tab pulls it in from the left; the page slides over by the drawer's width
// and dims. Release past a third of the way (or flick) to open; swipe left,
// tap the page, or pick an item to close.

const WIDTH_SHARE = 0.55;
const OPEN_AT = 0.35;
const FLICK = 500;
const DIM = 0.55;
const ACCENT = '#86CCF4';

const ITEMS: { key: DrawerSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'routine', label: 'Routine', icon: 'calendar-outline' },
  { key: 'gym', label: 'Gym', icon: 'barbell-outline' },
  { key: 'streaks', label: 'Streaks', icon: 'flame-outline' },
];

const SideDrawer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.round(screenWidth * WIDTH_SHARE);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOpen, open, close, section, selectSection, drag } = useDrawer();
  const ignoring = useRef(false);

  // 0 = closed, 1 = open. Follows the finger during a drag, then animates.
  const progress = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);
  const current = useRef(0);
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      current.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const settle = (toOpen: boolean, velocity = 0) => {
    Animated.spring(progress, {
      toValue: toOpen ? 1 : 0,
      velocity: velocity / drawerWidth,
      tension: 70,
      friction: 12,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  };

  // Open/close requested from outside (Routine's menu button, picking an item).
  useEffect(() => {
    settle(isOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Drag handling shared by the drawer's own swipe and by pagers that hand
  // a right swipe over on their first page.
  const beginDrag = () => {
    progress.stopAnimation();
    dragStart.current = current.current;
  };
  const updateDrag = (translationX: number) => {
    progress.setValue(Math.min(1, Math.max(0, dragStart.current + translationX / drawerWidth)));
  };
  const endDrag = (velocityX: number) => {
    const toOpen = velocityX > FLICK ? true : velocityX < -FLICK ? false : current.current > OPEN_AT;
    settle(toOpen, velocityX);
    if (toOpen) open();
    else close();
  };
  drag.current = { begin: beginDrag, update: updateDrag, end: endDrag };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        // Horizontal only: vertical scrolling never grabs the drawer.
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onStart(e => {
          // A left swipe with the drawer shut does nothing.
          ignoring.current = current.current === 0 && e.translationX < 0;
          if (!ignoring.current) drag.current.begin();
        })
        .onUpdate(e => {
          if (!ignoring.current) drag.current.update(e.translationX);
        })
        .onEnd(e => {
          if (!ignoring.current) drag.current.end(e.velocityX);
        }),
    [drag],
  );

  const pageShift = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drawerWidth] });
  const panelShift = progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] });
  const dim = progress.interpolate({ inputRange: [0, 1], outputRange: [0, DIM] });

  const name = user?.username || user?.email?.split('@')[0] || 'You';
  const initial = name.charAt(0).toUpperCase();

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        {/* The tabs, pushed right while the drawer is out */}
        <Animated.View style={[styles.page, { transform: [{ translateX: pageShift }] }]}>
          {children}
          <Animated.View
            pointerEvents={isOpen ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
          </Animated.View>
        </Animated.View>

        {/* The drawer */}
        <Animated.View
          style={[
            styles.panel,
            { width: drawerWidth, paddingTop: insets.top + 12, transform: [{ translateX: panelShift }] },
          ]}
          accessibilityViewIsModal={isOpen}
        >
          {/* Profile picture spot — becomes your photo and opens your profile later */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {user?.username ? <Text style={styles.handle} numberOfLines={1}>@{user.username}</Text> : null}

          <View style={styles.divider} />

          {ITEMS.map(item => {
            const active = item.key === section;
            return (
              <Pressable
                key={item.key}
                onPress={() => selectSection(item.key)}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={active ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon}
                  size={24}
                  color={active ? ACCENT : '#E8E8E8'}
                />
                <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    overflow: 'hidden',
  },
  page: {
    flex: 1,
  },
  dim: {
    backgroundColor: '#000',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#111111',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#2A2A2A',
    paddingHorizontal: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  name: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#F2F2F2',
  },
  handle: {
    marginTop: 2,
    fontSize: 14,
    color: '#7A7A7A',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A2A',
    marginVertical: 18,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
  },
  itemPressed: {
    opacity: 0.6,
  },
  itemText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  itemTextActive: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default SideDrawer;
