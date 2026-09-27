import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

// A person's round profile photo, or their initial on green when they have
// none (or it fails to load).

export const initialOf = (p: { displayName?: string | null; username?: string }) =>
  (Array.from((p.displayName || p.username || '?').trim())[0] ?? '?').toUpperCase();

interface Props {
  person: { displayName?: string | null; username?: string; avatarUrl?: string | null } | null | undefined;
  size: number;
}

const Avatar: React.FC<Props> = ({ person, size }) => {
  const url = person?.avatarUrl ?? null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (url && !failed) {
    return <Image source={{ uri: url }} style={[round, styles.photo]} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[round, styles.fallback]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{person ? initialOf(person) : ''}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  photo: { backgroundColor: '#1B1B1B' },
  fallback: { backgroundColor: '#1D9E75', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF', fontWeight: '700' },
});

export default Avatar;
