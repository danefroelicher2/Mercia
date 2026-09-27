import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import PersonRow from '../components/people/PersonRow';
import { useAuth } from '../context/AuthContext';
import { Person, fetchFollowList } from '../services/people';

// Someone's followers, or the people they follow. Newest first, 50 at a time.

type Kind = 'followers' | 'following';

const FollowListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { userId, username, kind } = useRoute<any>().params as { userId: string; username: string; kind: Kind };
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const loadingMore = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: kind === 'followers' ? 'Followers' : 'Following' });
  }, [navigation, kind]);

  const loadFirst = useCallback(() => {
    setState(cur => (cur === 'done' ? 'done' : 'loading'));
    fetchFollowList(userId, kind)
      .then(r => { setPeople(r.people); setNext(r.nextBefore); setState('done'); })
      .catch(() => setState('error'));
  }, [userId, kind]);
  // Re-read on every focus: follows and blocks made on a profile show up here.
  useFocusEffect(loadFirst);

  const loadMore = () => {
    if (!next || loadingMore.current) return;
    loadingMore.current = true;
    fetchFollowList(userId, kind, next)
      .then(r => {
        setPeople(cur => [...cur, ...r.people.filter(p => !cur.some(c => c.id === p.id))]);
        setNext(r.nextBefore);
      })
      .catch(() => {})
      .finally(() => { loadingMore.current = false; });
  };

  const isMine = user?.id === userId;
  const empty =
    kind === 'followers'
      ? (isMine ? 'No followers yet.' : `No one follows @${username} yet.`)
      : (isMine ? "You're not following anyone yet." : `@${username} isn't following anyone yet.`);

  if (state !== 'done' && !people.length) {
    return (
      <View style={[styles.root, styles.center]}>
        {state === 'loading' ? <ActivityIndicator color="#777" /> : (
          <>
            <Text style={styles.message}>Couldn't load this list.</Text>
            <Pressable onPress={loadFirst} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={people}
      keyExtractor={p => p.id}
      renderItem={({ item }) => (
        <PersonRow
          person={item}
          hideFollow={item.id === user?.id}
          onPress={() => navigation.push('UserProfile', { userId: item.id, username: item.username })}
        />
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<Text style={[styles.message, { marginTop: 40 }]}>{empty}</Text>}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { color: '#777', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retry: { borderWidth: 1, borderColor: '#333', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  retryText: { color: '#E8E8E8', fontWeight: '600' },
});

export default FollowListScreen;
