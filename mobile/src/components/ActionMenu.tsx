import React, { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// App-styled replacement for ActionSheetIOS. The system sheet on iOS 26 is a
// popover that lets the dismissing tap fall through to whatever is under it
// (e.g. checking off a task). This menu's full-screen backdrop swallows that
// tap: tapping outside only closes the menu.

export interface ActionMenuItem {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  // Right-aligned value, e.g. the current time on "Change time"
  detail?: string;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  items: ActionMenuItem[];
  // Icon/detail color; defaults to the app teal.
  accent?: string;
  onClose: () => void;
}

const ActionMenu: React.FC<Props> = ({ visible, title, items, accent = '#5DCAA5', onClose }) => {
  // The chosen action runs after the menu has fully closed, so anything it
  // opens (keyboard focus, an alert) isn't blocked by the closing modal.
  const pendingAction = useRef<(() => void) | null>(null);

  const choose = (item: ActionMenuItem) => {
    pendingAction.current = item.onPress;
    onClose();
  };

  const runPending = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={runPending}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps on the card's padding */}
        <Pressable style={styles.card} onPress={() => {}}>
          {title ? (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {items.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => choose(item)}
              style={({ pressed }) => [
                styles.row,
                (index > 0 || !!title) && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              {item.icon && (
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.destructive ? '#FF6B6B' : accent}
                />
              )}
              <Text style={[styles.rowText, item.destructive && styles.rowTextDestructive]}>
                {item.label}
              </Text>
              {item.detail ? <Text style={[styles.detail, { color: accent }]}>{item.detail}</Text> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2E2E2E',
  },
  rowPressed: {
    backgroundColor: '#242424',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: '#E8E8E8',
  },
  detail: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowTextDestructive: {
    color: '#FF6B6B',
  },
});

export default ActionMenu;
