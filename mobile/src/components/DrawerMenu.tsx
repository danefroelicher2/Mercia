import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';

const DRAWER_WIDTH = 200;

interface DrawerMenuProps {
  visible: boolean;
  activeSection: 'routine' | 'gym';
  onSelect: (section: 'routine' | 'gym') => void;
  onClose: () => void;
}

const ITEMS: { key: 'routine' | 'gym'; label: string }[] = [
  { key: 'routine', label: 'Routine' },
  { key: 'gym', label: 'Gym' },
];

const DrawerMenu: React.FC<DrawerMenuProps> = ({ visible, activeSection, onSelect, onClose }) => {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* Hamburger / close icon */}
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>

        {/* Menu items */}
        {ITEMS.map(({ key, label }) => {
          const isActive = activeSection === key;
          return (
            <TouchableOpacity
              key={key}
              style={styles.menuItem}
              onPress={() => onSelect(key)}
              activeOpacity={0.7}
            >
              <View style={[styles.accentBar, isActive && styles.accentBarActive]} />
              <Text style={[styles.menuItemText, isActive && styles.menuItemTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Animated.View>

      {/* Dim area — tap to close */}
      <TouchableOpacity style={styles.dimArea} onPress={onClose} activeOpacity={1} />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 999,
  },
  drawer: {
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    height: '100%',
    paddingTop: 60,
  },
  closeButton: {
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  accentBar: {
    width: 3,
    height: 20,
    backgroundColor: 'transparent',
    borderRadius: 2,
    marginRight: 12,
  },
  accentBarActive: {
    backgroundColor: '#1D9E75',
  },
  menuItemText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#111',
  },
  menuItemTextActive: {
    color: '#1D9E75',
  },
  dimArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

export default DrawerMenu;
