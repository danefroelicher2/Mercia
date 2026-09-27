import { getSupabase } from '../services/supabase';
import { cleanDisplayName, suggestUsername, suggestionSeed } from './usernames';

// Creating a user's profile, whatever way they signed up (email, Google,
// Apple). A new profile gets a valid, free suggested username and
// username_chosen_at = null, so the app asks them to choose one before
// anything else. An existing profile is never touched here — returning
// sign-ins keep whatever username the user chose.

export async function ensureProfile(
  userId: string,
  info: { email?: string | null; displayName?: string | null; usernameSeed?: string | null },
): Promise<void> {
  const sb = getSupabase().schema('mercia');
  const { data: existing, error } = await sb.from('user_profiles').select('id').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (existing) return;

  const displayName = cleanDisplayName(info.displayName);
  const seed = info.usernameSeed?.trim() || suggestionSeed({ displayName, email: info.email });
  for (let attempt = 0; attempt < 4; attempt++) {
    const first = suggestUsername(seed, () => false);
    const prefix = first.replace(/\d+$/, '');
    const { data: similar, error: likeErr } = await sb
      .from('user_profiles')
      .select('username')
      .like('username', `${prefix.replace(/[\\%_]/g, c => `\\${c}`)}%`)
      .limit(5000);
    if (likeErr) throw likeErr;
    const taken = new Set((similar ?? []).map((r: any) => r.username as string));
    const username = suggestUsername(seed, u => taken.has(u));
    const { error: insErr } = await sb
      .from('user_profiles')
      .insert({ id: userId, username, display_name: displayName, username_chosen_at: null });
    if (!insErr) return;
    if (insErr.code !== '23505') throw insErr;
    // Someone took that name (or the profile was just created) — re-check and retry.
    const { data: nowThere } = await sb.from('user_profiles').select('id').eq('id', userId).maybeSingle();
    if (nowThere) return;
  }
  throw new Error('Could not create a profile');
}

// How many people follow the user, and how many they follow.
export async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    getSupabase().schema('mercia').from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
    getSupabase().schema('mercia').from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}
