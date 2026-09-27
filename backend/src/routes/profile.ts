import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSupabase } from '../services/supabase';
import { ensureProfile, followCounts } from '../lib/profiles';
import { decodeAvatar, removeAvatar, setAvatar } from '../lib/avatars';
import { cleanDisplayName, normalizeUsername, usernameProblem } from '../lib/usernames';

// The signed-in user's own profile: username, display name, photo, follow counts.
// needsUsername = they haven't chosen one yet (new accounts), so the app shows
// its required "Choose your username" screen.

const router = Router();
router.use(authenticateToken);

async function readProfile(userId: string, email?: string) {
  const sb = getSupabase().schema('mercia');
  const select = () => sb.from('user_profiles').select('username, display_name, username_chosen_at, avatar_url, created_at').eq('id', userId).maybeSingle();
  let { data, error } = await select();
  if (error) throw error;
  if (!data) {
    // A profile that somehow never got created: create it now.
    await ensureProfile(userId, { email });
    ({ data, error } = await select());
    if (error) throw error;
  }
  return {
    username: data!.username as string,
    displayName: (data!.display_name as string | null) ?? null,
    needsUsername: !data!.username_chosen_at,
    avatarUrl: (data!.avatar_url as string | null) ?? null,
    memberSince: data!.created_at as string,
    ...(await followCounts(userId)),
  };
}

// GET /api/profile/me
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await readProfile(req.user!.id, req.user!.email) });
  } catch (error: any) {
    console.error('[Profile] me failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load profile' });
  }
});

// GET /api/profile/username-available?u=
router.get('/username-available', async (req: Request, res: Response): Promise<void> => {
  try {
    const u = normalizeUsername(String(req.query.u ?? ''));
    const problem = usernameProblem(u);
    if (problem) {
      res.json({ success: true, data: { username: u, available: false, problem } });
      return;
    }
    const { data, error } = await getSupabase().schema('mercia').from('user_profiles').select('id').eq('username', u).maybeSingle();
    if (error) throw error;
    const available = !data || data.id === req.user!.id;
    res.json({ success: true, data: { username: u, available, problem: available ? null : 'That username is taken' } });
  } catch (error: any) {
    console.error('[Profile] availability failed:', error);
    res.status(500).json({ success: false, error: 'Failed to check username' });
  }
});

// PUT /api/profile  { username?, displayName? }
router.put('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (req.body?.username !== undefined) {
    const u = normalizeUsername(String(req.body.username));
    const problem = usernameProblem(u);
    if (problem) {
      res.status(400).json({ success: false, error: problem, problem });
      return;
    }
    update.username = u;
    update.username_chosen_at = new Date().toISOString();
  }
  if (req.body?.displayName !== undefined) update.display_name = cleanDisplayName(req.body.displayName);

  try {
    await readProfile(userId, req.user!.email); // makes sure the row exists
    const { error } = await getSupabase().schema('mercia').from('user_profiles').update(update).eq('id', userId);
    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'That username is taken', problem: 'That username is taken' });
        return;
      }
      throw error;
    }
    res.json({ success: true, data: await readProfile(userId, req.user!.email) });
  } catch (error: any) {
    console.error('[Profile] update failed:', error);
    res.status(500).json({ success: false, error: 'Failed to save profile' });
  }
});

// POST /api/profile/avatar  { image: base64 JPEG } — the app sends it already
// cropped square and shrunk.
router.post('/avatar', async (req: Request, res: Response): Promise<void> => {
  const decoded = decodeAvatar(req.body?.image);
  if ('problem' in decoded) {
    res.status(400).json({ success: false, error: decoded.problem, problem: decoded.problem });
    return;
  }
  try {
    await readProfile(req.user!.id, req.user!.email); // makes sure the row exists
    await setAvatar(req.user!.id, decoded.bytes);
    res.json({ success: true, data: await readProfile(req.user!.id, req.user!.email) });
  } catch (error: any) {
    console.error('[Profile] avatar upload failed:', error);
    res.status(500).json({ success: false, error: "Couldn't save your photo" });
  }
});

// DELETE /api/profile/avatar
router.delete('/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    await removeAvatar(req.user!.id);
    res.json({ success: true, data: await readProfile(req.user!.id, req.user!.email) });
  } catch (error: any) {
    console.error('[Profile] avatar remove failed:', error);
    res.status(500).json({ success: false, error: "Couldn't remove your photo" });
  }
});

export default router;
