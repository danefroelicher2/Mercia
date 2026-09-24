import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDrawer } from '../context/DrawerContext';

// The header row every tab shares, so the side-drawer menu button sits in
// exactly the same spot on all four. Optional center (a title) and right
// (an action) slots; the height is fixed so tabs line up.

export const SCREEN_HEADER_HEIGHT = 44;

interface Props {
  center?: React.ReactNode;
  right?: React.ReactNode;
}

const ScreenHeader: React.FC<Props> = ({ center, right }) => {
  const { open } = useDrawer();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={open}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.menu}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <View style={styles.line} />
        <View style={styles.line} />
        <View style={styles.line} />
      </Pressable>
      {center ? (
        <View style={styles.center} pointerEvents="box-none">
          {center}
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: SCREEN_HEADER_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menu: {
    gap: 5,
    justifyContent: 'center',
  },
  line: {
    width: 22,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

export default ScreenHeader;
