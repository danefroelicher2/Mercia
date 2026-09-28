import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { levelFromXp, nextTier, tierOf } from '../../utils/levels';

// Your level: number, tier name, XP bar to the next level. Tap for how
// levels work.

interface Props {
  totalXp: number;
  onPress: () => void;
}

const LevelCard: React.FC<Props> = ({ totalXp, onPress }) => {
  const { level, into, needed, progress } = levelFromXp(totalXp);
  const tier = tierOf(level);
  const next = nextTier(level);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Level ${level}, ${tier.name}. How levels work`}>
      <View style={styles.row}>
        <View style={[styles.badge, { borderColor: tier.color }]}>
          <Text style={[styles.badgeNum, { color: tier.color }]}>{level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>LEVEL {level}</Text>
          <Text style={[styles.tier, { color: tier.color }]}>{tier.name}</Text>
        </View>
        <View style={styles.xpTotal}>
          <Text style={styles.xpTotalNum}>{totalXp.toLocaleString('en-US')}</Text>
          <Text style={styles.xpTotalLabel}>total XP</Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.max(3, progress * 100)}%`, backgroundColor: tier.color }]} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footText}>
          <Text style={styles.footStrong}>{into.toLocaleString('en-US')}</Text> / {needed.toLocaleString('en-US')} XP to Level {level + 1}
        </Text>
        <View style={styles.how}>
          <Text style={styles.howText}>{next ? `${next.name} at ${next.from}` : 'Top tier'}</Text>
          <Ionicons name="chevron-forward" size={14} color="#777" />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: '#141414', borderWidth: 1, borderColor: '#232323' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 46, height: 46, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  badgeNum: { fontSize: 18, fontWeight: '800', transform: [{ rotate: '-45deg' }], fontVariant: ['tabular-nums'] },
  kicker: { color: '#8A8A8A', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  tier: { fontSize: 20, fontWeight: '800', marginTop: 1 },
  xpTotal: { alignItems: 'flex-end' },
  xpTotalNum: { color: '#F2F2F2', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  xpTotalLabel: { color: '#777', fontSize: 11 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#242424', marginTop: 14, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  footText: { color: '#8A8A8A', fontSize: 12, fontVariant: ['tabular-nums'] },
  footStrong: { color: '#E8E8E8', fontWeight: '700' },
  how: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  howText: { color: '#777', fontSize: 12 },
});

export default LevelCard;
