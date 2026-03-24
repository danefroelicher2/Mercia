import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Left panel */}
        <View style={styles.panel}>
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
        </View>

        {/* Right overlay — tap to close */}
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  panel: {
    width: 200,
    backgroundColor: '#FFFFFF',
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

export default DrawerMenu;
