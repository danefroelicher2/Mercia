import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSupabase } from '../services/supabase';
import { loadDayStreaks } from '../lib/activityStreaks';
import { followCounts } from '../lib/profiles';
import { validZone } from '../lib/routineYear';
import {
  LIST_LIMIT, SEARCH_LIMIT, cleanReport, cleanSearchQuery, isUserId, likePattern, rankSearch,
} from '../lib/people';

// Other people: search, public profiles, follow, block, report.
// A public profile shows only identity, follow counts and activity streaks —
// nothing about anyone's routine, gym or chats. A block (either direction)
// makes the two people invisible to each other: no search, no lists, no
// profile (404), no follow.

const router = Router();
router.use(authenticateToken);

const db = () => getSupabase().schema('mercia');

interface Person {
  id: string;
  username: string;
  displayName: string | null;
}

const toPerson = (r: any): Person => ({ id: r.id, username: r.username, displayName: r.display_name ?? null });

// Everyone the user has blocked or been blocked by.
async function blockedEither(me: string): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([
    db().from('user_blocks').select('blocked_id').eq('blocker_id', me),
    db().from('user_blocks').select('blocker_id').eq('blocked_id', me),
  ]);
  if (mine.error) throw mine.error;
  if (theirs.error) throw theirs.error;
  return new Set([...(mine.data ?? []).map((r: any) => r.blocked_id), ...(theirs.data ?? []).map((r: any) => r.blocker_id)]);
}

async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const { data, error } = await db()
    .from('user_blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Which of `ids` the user follows.
async function followingAmong(me: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await db().from('follows').select('followee_id').eq('follower_id', me).in('followee_id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.followee_id));
}

async function profileRow(id: string) {
  const { data, error } = await db()
    .from('user_profiles')
    .select('id, username, display_name, created_at, timezone')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The target of a people route: must exist and not be blocked either way.
// Sends the 404 itself and returns null when not.
async function reachable(req: Request, res: Response): Promise<string | null> {
  const id = req.params.id;
  if (!isUserId(id) || (id !== req.user!.id && (await isBlockedPair(req.user!.id, id))) || !(await profileRow(id))) {
    res.status(404).json({ success: false, error: 'User not found' });
    return null;
  }
  return id;
}

const fail = (res: Response, what: string, error: any) => {
  console.error(`[People] ${what} failed:`, error);
  res.status(500).json({ success: false, error: `Failed to ${what}` });
};

// GET /api/people/search?q=
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const q = cleanSearchQuery(req.query.q);
    if (!q) {
      res.json({ success: true, data: [] });
      return;
    }
    const cols = 'id, username, display_name';
    const [byName, byUser, blocked] = await Promise.all([
      db().from('user_profiles').select(cols).not('username_chosen_at', 'is', null)
        .ilike('display_name', likePattern(q, 'contains')).limit(SEARCH_LIMIT * 2),
      // Usernames are stored lowercase, and q is lowercase.
      db().from('user_profiles').select(cols).not('username_chosen_at', 'is', null)
        .like('username', likePattern(q, 'prefix')).order('username').limit(SEARCH_LIMIT * 2),
      blockedEither(me),
    ]);
    if (byName.error) throw byName.error;
    if (byUser.error) throw byUser.error;
    const people = [...(byUser.data ?? []), ...(byName.data ?? [])]
      .map(toPerson)
      .filter(p => p.id !== me && !blocked.has(p.id));
    const following = await followingAmong(me, people.map(p => p.id));
    const ranked = rankSearch(q, people, following);
    res.json({ success: true, data: ranked.map(p => ({ ...p, isFollowing: following.has(p.id) })) });
  } catch (error) {
    fail(res, 'search', error);
  }
});

// GET /api/people/blocked — people I've blocked (for Profile → Blocked accounts)
router.get('/blocked', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await db()
      .from('user_blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', req.user!.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (data ?? []).map((r: any) => r.blocked_id);
    const people = await peopleByIds(ids);
    res.json({ success: true, data: ids.map(id => people.get(id)).filter(Boolean) });
  } catch (error) {
    fail(res, 'load blocked accounts', error);
  }
});

async function peopleByIds(ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from('user_profiles').select('id, username, display_name').in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.id, toPerson(r)]));
}

// GET /api/people/:id — a public profile
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const id = await reachable(req, res);
    if (!id) return;
    const row = (await profileRow(id))!;
    const [counts, streaks, iFollow, theyFollow] = await Promise.all([
      followCounts(id),
      loadDayStreaks(id, validZone(row.timezone)),
      id === me ? Promise.resolve(false) : followingAmong(me, [id]).then(s => s.has(id)),
      id === me ? Promise.resolve(false) : followingAmong(id, [me]).then(s => s.has(me)),
    ]);
    res.json({
      success: true,
      data: {
        ...toPerson(row),
        memberSince: row.created_at,
        ...counts,
        isMe: id === me,
        isFollowing: iFollow,
        followsYou: theyFollow,
        currentStreak: streaks.currentStreak,
        bestStreak: streaks.longest.length,
      },
    });
  } catch (error) {
    fail(res, 'load profile', error);
  }
});

// POST /api/people/:id/follow
router.post('/:id/follow', async (req: Request, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const id = await reachable(req, res);
    if (!id) return;
    if (id === me) {
      res.status(400).json({ success: false, error: "You can't follow yourself" });
      return;
    }
    const { error } = await db()
      .from('follows')
      .upsert({ follower_id: me, followee_id: id }, { onConflict: 'follower_id,followee_id', ignoreDuplicates: true });
    if (error) throw error;
    res.json({ success: true, data: { isFollowing: true, ...(await followCounts(id)) } });
  } catch (error) {
    fail(res, 'follow', error);
  }
});

// DELETE /api/people/:id/follow — works even if a block now hides them
router.delete('/:id/follow', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!isUserId(id)) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const { error } = await db().from('follows').delete().eq('follower_id', req.user!.id).eq('followee_id', id);
    if (error) throw error;
    res.json({ success: true, data: { isFollowing: false, ...(await followCounts(id)) } });
  } catch (error) {
    fail(res, 'unfollow', error);
  }
});

// GET /api/people/:id/followers|following?before=ISO
for (const kind of ['followers', 'following'] as const) {
  router.get(`/:id/${kind}`, async (req: Request, res: Response): Promise<void> => {
    try {
      const me = req.user!.id;
      const id = await reachable(req, res);
      if (!id) return;
      const [self, other] = kind === 'followers' ? ['followee_id', 'follower_id'] : ['follower_id', 'followee_id'];
      let query = db().from('follows').select(`${other}, created_at`).eq(self, id)
        .order('created_at', { ascending: false }).limit(LIST_LIMIT);
      const before = typeof req.query.before === 'string' ? req.query.before : '';
      if (before && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before);
      const [{ data, error }, blocked] = await Promise.all([query, blockedEither(me)]);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const people = await peopleByIds(rows.map(r => r[other]));
      const following = await followingAmong(me, rows.map(r => r[other]));
      const list = rows
        .filter(r => people.has(r[other]) && !blocked.has(r[other]))
        .map(r => ({ ...people.get(r[other])!, isFollowing: following.has(r[other]), followedAt: r.created_at }));
      // nextBefore: the cursor for the next page (null when this was the last).
      const nextBefore = rows.length === LIST_LIMIT ? rows[rows.length - 1].created_at : null;
      res.json({ success: true, data: list, nextBefore });
    } catch (error) {
      fail(res, `load ${kind}`, error);
    }
  });
}

// POST /api/people/:id/block — also removes follows both ways
router.post('/:id/block', async (req: Request, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const id = req.params.id;
    if (!isUserId(id) || id === me || !(await profileRow(id))) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const { error } = await db()
      .from('user_blocks')
      .upsert({ blocker_id: me, blocked_id: id }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
    if (error) throw error;
    const { error: delErr } = await db()
      .from('follows')
      .delete()
      .or(`and(follower_id.eq.${me},followee_id.eq.${id}),and(follower_id.eq.${id},followee_id.eq.${me})`);
    if (delErr) throw delErr;
    res.json({ success: true, data: { blocked: true } });
  } catch (error) {
    fail(res, 'block', error);
  }
});

// DELETE /api/people/:id/block
router.delete('/:id/block', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!isUserId(id)) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const { error } = await db().from('user_blocks').delete().eq('blocker_id', req.user!.id).eq('blocked_id', id);
    if (error) throw error;
    res.json({ success: true, data: { blocked: false } });
  } catch (error) {
    fail(res, 'unblock', error);
  }
});

// POST /api/people/:id/report { reason, note? }
router.post('/:id/report', async (req: Request, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const id = req.params.id;
    const report = cleanReport(req.body);
    if (!report) {
      res.status(400).json({ success: false, error: 'Choose a reason' });
      return;
    }
    // Reporting someone who has blocked you still works; only existence matters.
    if (!isUserId(id) || id === me || !(await profileRow(id))) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const { error } = await db().from('user_reports').insert({ reporter_id: me, reported_id: id, ...report });
    if (error) throw error;
    res.json({ success: true, data: { reported: true } });
  } catch (error) {
    fail(res, 'report', error);
  }
});

export default router;
