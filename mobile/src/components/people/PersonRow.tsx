import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Person } from '../../services/people';
import FollowButton from './FollowButton';
import Avatar from './Avatar';

// One person in a list (search results, followers, following, blocked):
// photo (or initial), name, @username, and an optional action on the right.


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
    <Avatar person={person} size={44} />
    <View style={styles.text}>
      <Text style={styles.name} numberOfLines={1}>{person.displayName || person.username}</Text>
      <Text style={styles.handle} numberOfLines={1}>@{person.username}</Text>
    </View>
    {right ?? (hideFollow ? null : <FollowButton userId={person.id} initial={!!person.isFollowing} compact />)}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0 },
  name: { color: '#F2F2F2', fontSize: 15, fontWeight: '600' },
  handle: { color: '#8A8A8A', fontSize: 13, marginTop: 1 },
});

export default PersonRow;
