import React, { useState } from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../people/Avatar';
import Ring from './Ring';
import { tierOf } from '../../utils/levels';
import type { ProfilePost } from '../../types/profileFeed';

// One auto-made post on a profile: a finished workout, a perfect day, a PR,
// a streak milestone, a level up or a finished goal. Your own posts have
// "⋯" (Pin / Hide); everyone can give props.

const GREEN = '#5DCAA5';

const KIND: Record<ProfilePost['kind'], { label: string; icon: string; color: string }> = {
  workout: { label: 'Workout', icon: 'barbell', color: '#4FA3F7' },
  perfect_day: { label: 'Perfect day', icon: 'sunny', color: '#F2B544' },
  pr: { label: 'Personal record', icon: 'trophy', color: '#F2B544' },
  streak: { label: 'Streak', icon: 'flame', color: '#F2705B' },
  level_up: { label: 'Level up', icon: 'arrow-up-circle', color: '#A77BF3' },
  goal: { label: 'Goal', icon: 'flag', color: GREEN },
};

export function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  post: ProfilePost;
  author: { displayName?: string | null; username: string; avatarUrl?: string | null };
  mine: boolean;
  onPin?: (id: string) => void;
  onHide?: (id: string) => void;
}

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

function Body({ post }: { post: ProfilePost }) {
  switch (post.kind) {
    case 'workout':
      return (
        <>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.sub}>{post.focus}</Text>
          <View style={styles.stats}>
            <Stat value={`${post.minutes}m`} label="Time" />
            <Stat value={post.volumeLb.toLocaleString('en-US')} label="Volume (lb)" />
            <Stat value={String(post.sets)} label="Sets" />
            {post.prs ? <Stat value={String(post.prs)} label={post.prs === 1 ? 'PR' : 'PRs'} /> : null}
          </View>
          <View style={styles.list}>
            {post.exercises.map(e => (
              <View key={e.name} style={styles.exercise}>
                <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                <Text style={styles.exDetail}>{e.detail}</Text>
                {e.pr ? <Ionicons name="trophy" size={13} color="#F2B544" /> : <View style={{ width: 13 }} />}
              </View>
            ))}
          </View>
        </>
      );
    case 'perfect_day':
      return (
        <>
          <Text style={styles.title}>Perfect day</Text>
          <Text style={styles.sub}>{post.done} of {post.planned} crossed off</Text>
          <View style={styles.parts}>
            {post.parts.map(part => (
              <View key={part.label} style={styles.part}>
                <View style={styles.partBar}>
                  <View style={[styles.partFill, { width: `${(part.done / Math.max(1, part.planned)) * 100}%` }]} />
                </View>
                <Text style={styles.partLabel}>{part.label}</Text>
                <Text style={styles.partCount}>{part.done}/{part.planned}</Text>
              </View>
            ))}
          </View>
        </>
      );
    case 'pr':
      return (
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(242,181,68,0.14)' }]}><Ionicons name="trophy" size={26} color="#F2B544" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sub}>{post.exercise}</Text>
            <Text style={styles.heroValue}>{post.value}</Text>
            <Text style={styles.heroNote}><Text style={{ color: GREEN, fontWeight: '700' }}>{post.delta}</Text> vs {post.previous}</Text>
          </View>
        </View>
      );
    case 'streak':
      return (
        <View style={styles.hero}>
          <Ring size={64} stroke={5} progress={1} color="#F2705B">
            <Ionicons name="flame" size={26} color="#F2705B" />
          </Ring>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroValue}>{post.days}-day streak</Text>
            <Text style={styles.heroNote}>Showed up {post.days} days in a row</Text>
          </View>
        </View>
      );
    case 'level_up': {
      const tier = tierOf(post.level);
      return (
        <View style={styles.hero}>
          <View style={[styles.levelBadge, { borderColor: tier.color }]}>
            <Text style={[styles.levelNum, { color: tier.color }]}>{post.level}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroValue}>Reached Level {post.level}</Text>
            <Text style={styles.heroNote}>{post.newTier ? 'New tier: ' : ''}<Text style={{ color: tier.color, fontWeight: '700' }}>{post.tier}</Text></Text>
          </View>
        </View>
      );
    }
    case 'goal':
      return (
        <View style={styles.hero}>
          <Ring size={64} stroke={5} progress={post.done / Math.max(1, post.target)} color={GREEN}>
            <Text style={styles.ringText}>{post.done}/{post.target}</Text>
          </Ring>
          <View style={{ flex: 1 }}>
            <Text style={styles.sub}>{post.scope === 'weekly' ? 'Weekly goal complete' : 'Yearly goal complete'}</Text>
            <Text style={styles.heroValue}>{post.title}</Text>
          </View>
        </View>
      );
  }
}

const PostCard: React.FC<Props> = ({ post, author, mine, onPin, onHide }) => {
  const kind = KIND[post.kind];
  const [propped, setPropped] = useState(!!post.proppedByMe);
  const props = post.props + (propped && !post.proppedByMe ? 1 : 0) - (!propped && post.proppedByMe ? 1 : 0);

  const menu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [post.pinned ? 'Unpin from profile' : 'Pin to profile', 'Hide from profile', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      i => (i === 0 ? onPin?.(post.id) : i === 1 ? onHide?.(post.id) : undefined),
    );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Avatar person={author} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.author} numberOfLines={1}>{author.displayName || author.username}</Text>
          <View style={styles.metaRow}>
            <Ionicons name={kind.icon as any} size={12} color={kind.color} />
            <Text style={[styles.kind, { color: kind.color }]}>{kind.label}</Text>
            <Text style={styles.time}>· {ago(post.at)}</Text>
          </View>
        </View>
        {post.pinned ? (
          <View style={styles.pinned}><Ionicons name="pin" size={12} color="#A8A8A8" /><Text style={styles.pinnedText}>Pinned</Text></View>
        ) : null}
        {mine ? (
          <Pressable onPress={menu} hitSlop={10} accessibilityRole="button" accessibilityLabel="Post options">
            <Ionicons name="ellipsis-horizontal" size={18} color="#8A8A8A" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}><Body post={post} /></View>

      <View style={styles.foot}>
        <Pressable
          onPress={() => setPropped(v => !v)}
          style={styles.props}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={propped ? 'Remove props' : 'Give props'}
        >
          <Ionicons name={propped ? 'hand-left' : 'hand-left-outline'} size={17} color={propped ? '#F2B544' : '#A8A8A8'} />
          <Text style={[styles.propsText, propped && { color: '#F2B544' }]}>{props} props</Text>
        </Pressable>
        {post.xp ? <View style={styles.xp}><Text style={styles.xpText}>+{post.xp} XP</Text></View> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, backgroundColor: '#141414', borderWidth: 1, borderColor: '#232323', padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { color: '#F2F2F2', fontSize: 14, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  kind: { fontSize: 12, fontWeight: '600' },
  time: { color: '#777', fontSize: 12 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#222', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  pinnedText: { color: '#A8A8A8', fontSize: 11, fontWeight: '600' },
  body: { marginTop: 12 },
  title: { color: '#F5F5F5', fontSize: 18, fontWeight: '800' },
  sub: { color: '#8A8A8A', fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', marginTop: 12, gap: 18 },
  stat: {},
  statValue: { color: '#F2F2F2', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#777', fontSize: 11, marginTop: 1 },
  list: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#262626', paddingTop: 8, gap: 6 },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exName: { flex: 1, color: '#D8D8D8', fontSize: 14 },
  exDetail: { color: '#8A8A8A', fontSize: 13, fontVariant: ['tabular-nums'] },
  parts: { marginTop: 12, gap: 8 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#242424', overflow: 'hidden' },
  partFill: { height: 6, borderRadius: 3, backgroundColor: '#F2B544' },
  partLabel: { width: 72, color: '#A8A8A8', fontSize: 12 },
  partCount: { width: 30, textAlign: 'right', color: '#D8D8D8', fontSize: 12, fontVariant: ['tabular-nums'] },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: '#F5F5F5', fontSize: 20, fontWeight: '800', marginTop: 1 },
  heroNote: { color: '#8A8A8A', fontSize: 13, marginTop: 3 },
  ringText: { color: '#F2F2F2', fontSize: 14, fontWeight: '700' },
  levelBadge: { width: 50, height: 50, marginHorizontal: 7, borderRadius: 13, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  levelNum: { fontSize: 20, fontWeight: '800', transform: [{ rotate: '-45deg' }] },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#262626' },
  props: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  propsText: { color: '#A8A8A8', fontSize: 13, fontWeight: '600' },
  xp: { backgroundColor: 'rgba(93,202,165,0.12)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  xpText: { color: GREEN, fontSize: 12, fontWeight: '700' },
});

export default PostCard;
