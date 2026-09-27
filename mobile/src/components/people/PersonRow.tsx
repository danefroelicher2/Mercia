import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Person } from '../../services/people';
import FollowButton from './FollowButton';

// One person in a list (search results, followers, following, blocked):
// initial avatar, name, @username, and an optional action on the right.

export const initialOf = (p: { displayName?: string | null; username?: string }) =>
  (Array.from((p.displayName || p.username || '?').trim())[0] ?? '?').toUpperCase();

interface Props {
  person: Person;
  onPress?: () => void;
  right?: React.ReactNode; // replaces the default follow button
  hideFollow?: boolean;
}

const PersonRow: React.FC<Props> = ({ person, onPress, right, hideFollow }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: '#161616' }]}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={`${person.displayName || person.username}, @${person.username}`}
  >
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initialOf(person)}</Text>
    </View>
    <View style={styles.text}>
      <Text style={styles.name} numberOfLines={1}>{person.displayName || person.username}</Text>
      <Text style={styles.handle} numberOfLines={1}>@{person.username}</Text>
    </View>
    {right ?? (hideFollow ? null : <FollowButton userId={person.id} initial={!!person.isFollowing} compact />)}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1D9E75', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  text: { flex: 1, minWidth: 0 },
  name: { color: '#F2F2F2', fontSize: 15, fontWeight: '600' },
  handle: { color: '#8A8A8A', fontSize: 13, marginTop: 1 },
});

export default PersonRow;
