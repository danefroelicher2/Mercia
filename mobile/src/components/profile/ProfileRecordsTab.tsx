import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileRecord } from '../../types/profileFeed';

// The Records tab: best lifts and personal bests.

const Group: React.FC<{ title: string; items: ProfileRecord[]; accent: string }> = ({ title, items, accent }) => (
  <>
    <Text style={styles.section}>{title}</Text>
    <View style={styles.card}>
      {items.map((r, i) => (
        <View key={r.label} style={[styles.row, i === items.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={[styles.icon, { backgroundColor: `${accent}22` }]}>
            <Ionicons name={r.icon as any} size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.sub}>{r.sub}</Text>
          </View>
          <Text style={styles.value}>{r.value}</Text>
        </View>
      ))}
    </View>
  </>
);

const ProfileRecordsTab: React.FC<{ lifts: ProfileRecord[]; bests: ProfileRecord[] }> = ({ lifts, bests }) => (
  <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
    <Group title="BEST LIFTS" items={lifts} accent="#4FA3F7" />
    <Group title="PERSONAL BESTS" items={bests} accent="#F2B544" />
  </View>
);

const styles = StyleSheet.create({
  section: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, marginBottom: 8 },
  card: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#232323', marginBottom: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#F2F2F2', fontSize: 15, fontWeight: '600' },
  sub: { color: '#777', fontSize: 12, marginTop: 1 },
  value: { color: '#F5F5F5', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});

export default ProfileRecordsTab;
