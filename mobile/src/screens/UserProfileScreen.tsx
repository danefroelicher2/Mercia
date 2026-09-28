import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/people/Avatar';
import FollowButton from '../components/people/FollowButton';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { PublicProfile, ReportReason, fetchPerson, reportPerson, setBlocked } from '../services/people';
import Ring from '../components/profile/Ring';
import LevelCard from '../components/profile/LevelCard';
import LevelSheet from '../components/profile/LevelSheet';
import PostCard from '../components/profile/PostCard';
import ProfileStatsTab from '../components/profile/ProfileStatsTab';
import ProfileRecordsTab from '../components/profile/ProfileRecordsTab';
import { levelFromXp, tierOf } from '../utils/levels';
import type { ProfileExtras, ProfilePost } from '../types/profileFeed';
import { PROFILE_MOCK, PROFILE_MOCK_ENABLED, PROFILE_MOCK_FILL } from './profile/profileMock';

// A profile page, Instagram-style: photo (with level ring) beside Posts /
// Followers / Following, name and bio, then Edit profile (yours) or Follow
// (theirs), then level + Whoop-style dials, then Posts | Stats | Records.
// The same screen shows your own profile (from the side drawer) and anyone
// else's. On someone else's, "⋯" has Report and Block.

const GREEN = '#5DCAA5';

const REPORT_OPTIONS: { label: string; reason: ReportReason }[] = [
  { label: 'Inappropriate photo', reason: 'inappropriate_photo' },
  { label: 'Inappropriate name', reason: 'inappropriate_name' },
  { label: 'Spam', reason: 'spam' },
  { label: 'Pretending to be someone', reason: 'impersonation' },
  { label: 'Something else', reason: 'other' },
];

type Tab = 'posts' | 'stats' | 'records';

const TAB_ICONS: Record<Tab, [string, string, string]> = {
  posts: ['albums', 'albums-outline', 'Posts'],
  stats: ['stats-chart', 'stats-chart-outline', 'Stats'],
  records: ['trophy', 'trophy-outline', 'Records'],
};

const joined = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const count = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` :
  n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` :
  n.toLocaleString('en-US');

const Dial: React.FC<{ value: string; label: string; progress: number; color: string }> = ({ value, label, progress, color }) => (
  <View style={styles.dial}>
    <Ring size={84} stroke={7} progress={progress} color={color}>
      <Text style={styles.dialValue}>{value}</Text>
    </Ring>
    <Text style={styles.dialLabel}>{label}</Text>
  </View>
);

const UserProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { userId, username } = useRoute<any>().params as { userId: string; username?: string };
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('posts');
  const [levelInfo, setLevelInfo] = useState(false);
  // Pins/hides are local until real posts exist.
  const [posts, setPosts] = useState<ProfilePost[]>(PROFILE_MOCK.posts);

  const load = useCallback(async () => {
    try {
      setP(await fetchPerson(userId));
      setError(null);
    } catch (e: any) {
      setError({ message: e.message, notFound: !!e.notFound });
    }
  }, [userId]);

  // Reload whenever the screen comes back into view (after Edit profile, a list…).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { changePhoto, busy: photoBusy } = useProfilePhoto(load);

  const block = () => {
    if (!p) return;
    Alert.alert(
      `Block @${p.username}?`,
      "They won't be able to find your profile or follow you, and you'll unfollow each other. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await setBlocked(p.id, true);
              Alert.alert(`@${p.username} is blocked`, 'You can unblock them from Settings → Blocked accounts.');
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(e.message);
            }
          },
        },
      ],
    );
  };

  const report = () => {
    if (!p) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Report @${p.username}`, message: 'Why are you reporting this account?', options: [...REPORT_OPTIONS.map(o => o.label), 'Cancel'], cancelButtonIndex: REPORT_OPTIONS.length },
      async i => {
        if (i >= REPORT_OPTIONS.length) return;
        try {
          await reportPerson(p.id, REPORT_OPTIONS[i].reason);
          Alert.alert('Thanks for letting us know', "We'll take a look. Do you also want to block this account?", [
            { text: 'Not now', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: block },
          ]);
        } catch (e: any) {
          Alert.alert(e.message);
        }
      },
    );
  };

  const menu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Report', 'Block', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      i => (i === 0 ? report() : i === 1 ? block() : undefined),
    );

  // The header button calls through a ref, so the header is only rebuilt when
  // what it shows changes (rebuilding it on every render drops taps).
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const title = p ? p.username : username ?? '';
  const showMenu = !!p && !p.isMe;
  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: showMenu
        ? () => (
            <TouchableOpacity
              onPress={() => menuRef.current()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.menuButton}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, title, showMenu]);

  if (error && !p) {
    return (
      <View style={[styles.root, styles.center]}>
        <Ionicons name={error.notFound ? 'person-remove-outline' : 'cloud-offline-outline'} size={36} color="#555" />
        <Text style={styles.emptyTitle}>{error.notFound ? "This account isn't available" : error.message}</Text>
        {!error.notFound ? (
          <Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
        ) : null}
      </View>
    );
  }
  if (!p) {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color="#777" /></View>;
  }

  // Level, posts, stats and records: sample data on your own profile in the
  // dev app until the real feed exists (see profile/profileMock.ts).
  const extras: ProfileExtras | null = p.isMe && PROFILE_MOCK_ENABLED ? PROFILE_MOCK : null;
  const level = extras ? (() => {
    const l = levelFromXp(extras.totalXp);
    return { ...l, color: tierOf(l.level).color };
  })() : null;
  const visiblePosts = [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.at) - Date.parse(a.at));
  const followers = extras && !p.followers ? PROFILE_MOCK_FILL.followers : p.followers;
  const following = extras && !p.following ? PROFILE_MOCK_FILL.following : p.following;
  const bio = p.bio || (extras ? PROFILE_MOCK_FILL.bio : null);
  const currentStreak = extras ? PROFILE_MOCK_FILL.currentStreak : p.currentStreak;
  const bestStreak = extras ? PROFILE_MOCK_FILL.bestStreak : p.bestStreak;
  const tabs: Tab[] = extras ? ['posts', 'stats', 'records'] : ['posts', 'stats'];

  const openList = (kind: 'followers' | 'following') =>
    navigation.push('FollowList', { userId: p.id, username: p.username, kind });

  const stat = (value: number, label: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.stat} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={styles.statNum}>{count(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#777" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.top}>
        <Pressable
          onPress={p.isMe ? changePhoto : undefined}
          disabled={!p.isMe}
          accessibilityRole={p.isMe ? 'button' : 'image'}
          accessibilityLabel={p.isMe ? 'Change profile photo' : `${p.displayName || p.username}'s photo`}
        >
          {level ? (
            <View style={styles.levelWrap}>
              <Ring size={100} stroke={3.5} progress={level.progress} color={level.color} track="#262626">
                <Avatar person={p} size={86} />
              </Ring>
              <View style={[styles.levelPill, { backgroundColor: level.color }]}>
                <Text style={styles.levelPillText}>LV {level.level}</Text>
              </View>
            </View>
          ) : (
            <Avatar person={p} size={86} />
          )}
          {p.isMe ? (
            <View style={[styles.photoBadge, level && styles.photoBadgeRing]}>
              {photoBusy ? <ActivityIndicator size="small" color="#0B1F18" /> : <Ionicons name="add" size={16} color="#0B1F18" />}
            </View>
          ) : null}
        </Pressable>
        <View style={styles.stats}>
          {stat(extras ? visiblePosts.length : 0, 'posts')}
          {stat(followers, 'followers', () => openList('followers'))}
          {stat(following, 'following', () => openList('following'))}
        </View>
      </View>

      <View style={[styles.bio, level && { marginTop: 18 }]}>
        <Text style={styles.name} numberOfLines={1}>{p.displayName || p.username}</Text>
        {bio ? <Text style={styles.bioText}>{bio}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Joined {joined(p.memberSince)}</Text>
          {p.followsYou ? <View style={styles.tag}><Text style={styles.tagText}>Follows you</Text></View> : null}
        </View>
      </View>

      <View style={styles.actions}>
        {p.isMe ? (
          <Pressable onPress={() => navigation.navigate('EditProfile')} style={({ pressed }) => [styles.grayButton, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Text style={styles.grayButtonText}>Edit profile</Text>
          </Pressable>
        ) : (
          <FollowButton
            userId={p.id}
            initial={p.isFollowing}
            wide
            onChange={(isFollowing, followers) =>
              setP(cur => cur && {
                ...cur,
                isFollowing,
                followers: followers ?? Math.max(0, cur.followers + (isFollowing === cur.isFollowing ? 0 : isFollowing ? 1 : -1)),
              })}
          />
        )}
      </View>

      {extras ? (
        <>
          <LevelCard totalXp={extras.totalXp} onPress={() => setLevelInfo(true)} />
          <View style={styles.dials}>
            <Dial value={`${extras.year.consistency}%`} label="Consistency" progress={extras.year.consistency / 100} color="#5DCAA5" />
            <Dial value={String(currentStreak)} label="Day streak" progress={bestStreak ? currentStreak / bestStreak : 0} color="#F2705B" />
            <Dial value={String(extras.year.gymSessions)} label="Gym sessions" progress={0.82} color="#4FA3F7" />
          </View>
          <LevelSheet visible={levelInfo} totalXp={extras.totalXp} onClose={() => setLevelInfo(false)} />
        </>
      ) : null}

      <View style={styles.tabs}>
        {tabs.map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={TAB_ICONS[t][2]}>
            <Ionicons name={(tab === t ? TAB_ICONS[t][0] : TAB_ICONS[t][1]) as any} size={22} color={tab === t ? '#FFFFFF' : '#6A6A6A'} />
            <View style={[styles.tabLine, tab === t && styles.tabLineOn]} />
          </Pressable>
        ))}
      </View>

      {tab === 'posts' ? (
        extras && visiblePosts.length ? (
          visiblePosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              author={p}
              mine={p.isMe}
              onPin={id => setPosts(cur => cur.map(x => (x.id === id ? { ...x, pinned: !x.pinned } : x)))}
              onHide={id => setPosts(cur => cur.filter(x => x.id !== id))}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyRing}><Ionicons name="albums-outline" size={32} color="#E8E8E8" /></View>
            <Text style={styles.emptyHeading}>No posts yet</Text>
            {p.isMe ? <Text style={styles.emptySub}>Workouts, perfect days, PRs and milestones post here on their own.</Text> : null}
          </View>
        )
      ) : tab === 'stats' && extras ? (
        <ProfileStatsTab year={extras.year} currentStreak={currentStreak} bestStreak={bestStreak} />
      ) : tab === 'records' && extras ? (
        <ProfileRecordsTab lifts={extras.lifts} bests={extras.bests} />
      ) : (
        <View style={styles.streaks}>
          <View style={styles.streakBox}>
            <View style={styles.streakIcon}><Ionicons name="flame" size={20} color={p.currentStreak > 0 ? GREEN : '#555'} /></View>
            <Text style={[styles.streakNum, p.currentStreak > 0 && { color: GREEN }]}>{days(p.currentStreak)}</Text>
            <Text style={styles.streakLabel}>Current streak</Text>
          </View>
          <View style={styles.streakBox}>
            <View style={styles.streakIcon}><Ionicons name="trophy" size={18} color="#C9A45C" /></View>
            <Text style={styles.streakNum}>{days(p.bestStreak)}</Text>
            <Text style={styles.streakLabel}>Best streak</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  menuButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  photoBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN,
    borderWidth: 3, borderColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center',
  },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 12 },
  levelWrap: { alignItems: 'center' },
  levelPill: { position: 'absolute', bottom: -8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: '#0D0D0D' },
  levelPillText: { color: '#0D0D0D', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  photoBadgeRing: { right: 2, bottom: 6 },
  bioText: { color: '#E0E0E0', fontSize: 14, lineHeight: 19, marginTop: 3 },
  dials: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginTop: 12, paddingVertical: 14, borderRadius: 16, backgroundColor: '#141414', borderWidth: 1, borderColor: '#232323' },
  dial: { alignItems: 'center', width: '31%' },
  dialValue: { color: '#F5F5F5', fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dialLabel: { color: '#8A8A8A', fontSize: 12, marginTop: 6 },
  stat: { alignItems: 'center', minWidth: 64 },
  statNum: { color: '#F5F5F5', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#A8A8A8', fontSize: 13, marginTop: 1 },
  bio: { paddingHorizontal: 16, marginTop: 12 },
  name: { color: '#F5F5F5', fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  meta: { color: '#8A8A8A', fontSize: 13 },
  tag: { backgroundColor: '#242424', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#A8A8A8', fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 },
  grayButton: { flex: 1, height: 34, borderRadius: 8, backgroundColor: '#262626', alignItems: 'center', justifyContent: 'center' },
  grayButtonText: { color: '#F5F5F5', fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabLine: { height: 1.5, alignSelf: 'stretch', marginTop: 10, backgroundColor: 'transparent' },
  tabLineOn: { backgroundColor: '#FFFFFF' },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 40 },
  emptyRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center' },
  emptyHeading: { color: '#F5F5F5', fontSize: 22, fontWeight: '800', marginTop: 14 },
  emptySub: { color: '#8A8A8A', fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  streaks: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  streakBox: { width: '48.5%', backgroundColor: '#161616', borderRadius: 14, borderWidth: 1, borderColor: '#232323', paddingVertical: 16, alignItems: 'center', gap: 4 },
  streakIcon: { height: 22, justifyContent: 'center' },
  streakNum: { color: '#F2F2F2', fontSize: 20, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  streakLabel: { color: '#8A8A8A', fontSize: 12 },
  emptyTitle: { color: '#BBBBBB', fontSize: 16, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#333', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  retryText: { color: '#E8E8E8', fontWeight: '600' },
});

export default UserProfileScreen;
