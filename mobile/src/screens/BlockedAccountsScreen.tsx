import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PersonRow from '../components/people/PersonRow';
import { Person, fetchBlocked, setBlocked } from '../services/people';

// Profile → Blocked accounts: everyone you've blocked, each with Unblock.

const BlockedAccountsScreen: React.FC = () => {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetchBlocked().then(setPeople).catch(() => setError(true));
  }, []);
  useFocusEffect(load);

  const unblock = (p: Person) =>
    Alert.alert(`Unblock @${p.username}?`, "They'll be able to find your profile and follow you again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await setBlocked(p.id, false);
            setPeople(cur => (cur ?? []).filter(x => x.id !== p.id));
          } catch (e: any) {
            Alert.alert(e.message);
          }
        },
      },
    ]);

  if (!people) {
    return (
      <View style={[styles.root, styles.center]}>
        {error ? (
          <>
            <Text style={styles.message}>Couldn't load blocked accounts.</Text>
            <Pressable onPress={load} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>
          </>
        ) : <ActivityIndicator color="#777" />}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={people}
      keyExtractor={p => p.id}
      contentContainerStyle={{ paddingVertical: 8 }}
      renderItem={({ item }) => (
        <PersonRow
          person={item}
          right={
            <Pressable onPress={() => unblock(item)} style={styles.button} accessibilityRole="button">
              <Text style={styles.buttonText}>Unblock</Text>
            </Pressable>
          }
        />
      )}
      ListEmptyComponent={
        <Text style={[styles.message, { marginTop: 40 }]}>
          You haven't blocked anyone. Blocked people can't find your profile or follow you.
        </Text>
      }
    />
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { color: '#777', fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  button: { borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 999, paddingHorizontal: 16, height: 32, justifyContent: 'center' },
  buttonText: { color: '#E8E8E8', fontSize: 14, fontWeight: '600' },
});

export default BlockedAccountsScreen;
