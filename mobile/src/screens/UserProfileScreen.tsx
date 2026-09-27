import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import FollowButton from '../components/people/FollowButton';
import { initialOf } from '../components/people/PersonRow';
import { PublicProfile, ReportReason, fetchPerson, reportPerson, setBlocked } from '../services/people';

// Someone's public profile: who they are, follow counts, and their activity
// streaks. The "⋯" menu has Report and Block.

const GREEN = '#5DCAA5';

const REPORT_OPTIONS: { label: string; reason: ReportReason }[] = [
  { label: 'Inappropriate name', reason: 'inappropriate_name' },
  { label: 'Spam', reason: 'spam' },
  { label: 'Pretending to be someone', reason: 'impersonation' },
  { label: 'Something else', reason: 'other' },
];

const memberSince = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const count = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}k` : n.toLocaleString('en-US'));

const UserProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { userId, username } = useRoute<any>().params as { userId: string; username?: string };
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setP(await fetchPerson(userId));
      setError(null);
    } catch (e: any) {
      setError({ message: e.message, notFound: !!e.notFound });
    }
  }, [userId]);

  // Reload whenever the screen comes back into view (e.g. after a follow list).
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
              Alert.alert(`@${p.username} is blocked`, 'You can unblock them from Profile → Blocked accounts.');
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
  const title = p ? `@${p.username}` : username ? `@${username}` : '';
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

  const openList = (kind: 'followers' | 'following') =>
    navigation.push('FollowList', { userId: p.id, username: p.username, kind });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor="#777" onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.card}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initialOf(p)}</Text></View>
        <Text style={styles.name} numberOfLines={1}>{p.displayName || p.username}</Text>
        <View style={styles.handleRow}>
          <Text style={styles.handle} numberOfLines={1}>@{p.username}</Text>
          {p.followsYou ? <View style={styles.tag}><Text style={styles.tagText}>Follows you</Text></View> : null}
        </View>

        <View style={styles.counts}>
          <Pressable onPress={() => openList('followers')} style={styles.countBox} accessibilityRole="button">
            <Text style={styles.countNum}>{count(p.followers)}</Text>
            <Text style={styles.countLabel}>{p.followers === 1 ? 'Follower' : 'Followers'}</Text>
          </Pressable>
          <View style={styles.countDivider} />
          <Pressable onPress={() => openList('following')} style={styles.countBox} accessibilityRole="button">
            <Text style={styles.countNum}>{count(p.following)}</Text>
            <Text style={styles.countLabel}>Following</Text>
          </Pressable>
        </View>

        {p.isMe ? (
          <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.editButton}>
            <Text style={styles.editText}>Edit profile</Text>
          </Pressable>
        ) : (
          <FollowButton
            userId={p.id}
            initial={p.isFollowing}
            onChange={(isFollowing, followers) =>
              setP(cur => cur && {
                ...cur,
                isFollowing,
                followers: followers ?? Math.max(0, cur.followers + (isFollowing === cur.isFollowing ? 0 : isFollowing ? 1 : -1)),
              })}
          />
        )}
      </View>

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

      <Text style={styles.since}>Member since {memberSince(p.memberSince)}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  menuButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#161616', borderRadius: 14, borderWidth: 1, borderColor: '#232323', padding: 20, alignItems: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#1D9E75', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' },
  name: { fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 26, color: '#F2F2F2', maxWidth: '100%' },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, maxWidth: '100%' },
  handle: { color: '#8A8A8A', fontSize: 14, flexShrink: 1 },
  tag: { backgroundColor: '#242424', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#A8A8A8', fontSize: 11, fontWeight: '600' },
  counts: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  countBox: { alignItems: 'center', paddingHorizontal: 26 },
  countNum: { color: '#F2F2F2', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countLabel: { color: '#8A8A8A', fontSize: 12, marginTop: 2 },
  countDivider: { width: 1, height: 28, backgroundColor: '#2A2A2A' },
  editButton: { height: 40, minWidth: 140, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: '#3A3A3A', alignItems: 'center', justifyContent: 'center' },
  editText: { color: '#E8E8E8', fontSize: 14, fontWeight: '700' },
  streaks: { flexDirection: 'row', gap: 12, marginTop: 12 },
  streakBox: { flex: 1, backgroundColor: '#161616', borderRadius: 14, borderWidth: 1, borderColor: '#232323', paddingVertical: 16, alignItems: 'center', gap: 4 },
  streakIcon: { height: 22, justifyContent: 'center' },
  streakNum: { color: '#F2F2F2', fontSize: 20, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  streakLabel: { color: '#8A8A8A', fontSize: 12 },
  since: { color: '#6F6F6F', fontSize: 13, textAlign: 'center', marginTop: 18 },
  emptyTitle: { color: '#BBBBBB', fontSize: 16, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#333', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  retryText: { color: '#E8E8E8', fontWeight: '600' },
});

export default UserProfileScreen;
