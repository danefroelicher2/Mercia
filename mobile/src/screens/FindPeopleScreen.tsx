import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import PersonRow from '../components/people/PersonRow';
import { Person, searchPeople } from '../services/people';

// Find people by username or name. Searches as you type (after a short pause);
// tapping someone opens their profile.

const FindPeopleScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const latest = useRef('');
  // Coming back from a profile (after a follow, unfollow or block) re-runs the
  // search, so the list never shows stale follow state or a blocked person.
  const [focusCount, setFocusCount] = useState(0);
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) firstFocus.current = false;
    else setFocusCount(n => n + 1);
  }, []));

  useEffect(() => {
    const query = q.trim();
    latest.current = query;
    if (!query) {
      setResults([]);
      setState('idle');
      return;
    }
    setState('loading');
    const t = setTimeout(() => {
      searchPeople(query)
        .then(r => {
          if (latest.current !== query) return;
          setResults(r);
          setState('done');
        })
        .catch(() => latest.current === query && setState('error'));
    }, focusCount && results.length ? 0 : 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, focusCount]);

  const message =
    state === 'idle' ? 'Search by username or name.' :
    state === 'error' ? "Couldn't search. Check your connection." :
    state === 'done' && !results.length ? `No one found for “${q.trim()}”.` : null;

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#777" />
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Search people"
          placeholderTextColor="#666"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search people"
        />
        {state === 'loading' ? <ActivityIndicator size="small" color="#777" /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={p => p.id}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        renderItem={({ item }) => (
          <PersonRow person={item} onPress={() => navigation.navigate('UserProfile', { userId: item.id, username: item.username })} />
        )}
        ListEmptyComponent={message ? <Text style={styles.message}>{message}</Text> : null}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8, height: 44,
    paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#1B1B1B', borderWidth: 1, borderColor: '#2C2C2C',
  },
  input: { flex: 1, alignSelf: 'stretch', color: '#FFFFFF', fontSize: 16, paddingVertical: 0 },
  message: { color: '#777', fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
});

export default FindPeopleScreen;
