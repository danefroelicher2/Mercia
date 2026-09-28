import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TIERS, XP_RULES, levelFromXp, tierOf } from '../../utils/levels';

// "How levels work": what earns XP and the tiers, with yours highlighted.

interface Props {
  visible: boolean;
  totalXp: number;
  onClose: () => void;
}

const LevelSheet: React.FC<Props> = ({ visible, totalXp, onClose }) => {
  const { level } = levelFromXp(totalXp);
  const mine = tierOf(level);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>How levels work</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#E8E8E8" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          <Text style={styles.lead}>
            Everything you do in Mercia earns XP. XP fills your level, and each level takes a little more than the last.
          </Text>

          <Text style={styles.section}>EARN XP</Text>
          <View style={styles.group}>
            {XP_RULES.map((r, i) => (
              <View key={r.action} style={[styles.rule, i === XP_RULES.length - 1 && { borderBottomWidth: 0 }]}>
                <Ionicons name={r.icon as any} size={20} color="#A8A8A8" />
                <Text style={styles.ruleText}>{r.action}</Text>
                <Text style={styles.ruleXp}>+{r.xp}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>TIERS</Text>
          <View style={styles.group}>
            {TIERS.map((t, i) => {
              const next = TIERS[i + 1];
              const current = t.name === mine.name;
              return (
                <View key={t.name} style={[styles.rule, i === TIERS.length - 1 && { borderBottomWidth: 0 }, current && styles.current]}>
                  <View style={[styles.dot, { backgroundColor: t.color }]} />
                  <Text style={[styles.ruleText, { color: t.color, fontWeight: '700' }]}>{t.name}</Text>
                  <Text style={styles.range}>{next ? `Levels ${t.from}–${next.from - 1}` : `Level ${t.from}+`}</Text>
                  {current ? <Text style={styles.you}>You</Text> : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { color: '#F5F5F5', fontSize: 22, fontWeight: '800' },
  lead: { color: '#A8A8A8', fontSize: 15, lineHeight: 22 },
  section: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 24, marginBottom: 8 },
  group: { backgroundColor: '#161616', borderRadius: 14, borderWidth: 1, borderColor: '#232323', overflow: 'hidden' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  current: { backgroundColor: '#1C1C1C' },
  ruleText: { flex: 1, color: '#E8E8E8', fontSize: 15 },
  ruleXp: { color: '#5DCAA5', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  range: { color: '#8A8A8A', fontSize: 13, fontVariant: ['tabular-nums'] },
  you: { color: '#0D0D0D', backgroundColor: '#E8E8E8', fontSize: 11, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
});

export default LevelSheet;
