import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { setFollowing } from '../../services/people';

// Follow / Following. Flips right away and rolls back if the server says no.
// `onChange` reports the new state and the person's follower count.

interface Props {
  userId: string;
  initial: boolean;
  compact?: boolean; // list rows
  wide?: boolean; // profile page: full-width, Instagram-shaped
  onChange?: (isFollowing: boolean, followers?: number) => void;
}

const FollowButton: React.FC<Props> = ({ userId, initial, compact, wide, onChange }) => {
  const [following, setFollowingState] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFollowingState(initial), [initial]);

  const toggle = async () => {
    if (busy) return;
    const next = !following;
    setFollowingState(next);
    onChange?.(next);
    setBusy(true);
    try {
      const r = await setFollowing(userId, next);
      setFollowingState(r.isFollowing);
      onChange?.(r.isFollowing, r.followers);
    } catch (e: any) {
      setFollowingState(!next);
      onChange?.(!next);
      Alert.alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : wide ? styles.wide : styles.full,
        following ? (wide ? styles.wideOn : styles.on) : styles.off,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Following. Tap to unfollow' : 'Follow'}
    >
      {busy && compact ? (
        <ActivityIndicator size="small" color={following ? '#E8E8E8' : '#0B1F18'} />
      ) : (
        <Text style={[styles.text, following ? styles.textOn : styles.textOff]}>{following ? 'Following' : 'Follow'}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  compact: { height: 32, minWidth: 92, paddingHorizontal: 14 },
  full: { height: 40, minWidth: 140, paddingHorizontal: 24 },
  wide: { flex: 1, height: 34, borderRadius: 8 },
  wideOn: { backgroundColor: '#262626' },
  off: { backgroundColor: '#5DCAA5' },
  on: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3A3A3A' },
  text: { fontSize: 14, fontWeight: '700' },
  textOff: { color: '#0B1F18' },
  textOn: { color: '#E8E8E8' },
});

export default FollowButton;
