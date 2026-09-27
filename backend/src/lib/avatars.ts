import { randomBytes } from 'crypto';
import { getSupabase } from '../services/supabase';

// Profile photos: square JPEGs (the app crops and shrinks them first) in the
// public `avatars` bucket at <userId>/<random>.jpg. A new file name per
// upload means phones never show a cached old photo. Only the backend writes.

const BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 700 * 1024;

// A real JPEG starts FF D8 FF and ends FF D9.
export function isJpeg(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}

// base64 (optionally a data: URL) → bytes, or a reason it's unusable.
export function decodeAvatar(input: unknown): { bytes: Buffer } | { problem: string } {
  if (typeof input !== 'string' || !input) return { problem: 'No photo received' };
  const b64 = input.replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { problem: "That photo couldn't be read" };
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > AVATAR_MAX_BYTES) return { problem: 'That photo is too large' };
  if (!isJpeg(bytes)) return { problem: "That photo couldn't be read" };
  return { bytes };
}

// The storage path inside the bucket, from a public URL we issued.
function pathFromUrl(url: string | null | undefined): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i >= 0 ? decodeURIComponent(url!.slice(i + marker.length).split('?')[0]) : null;
}

async function currentUrl(userId: string): Promise<string | null> {
  const { data, error } = await getSupabase().schema('mercia').from('user_profiles').select('avatar_url').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.avatar_url ?? null;
}

// Stores the photo, points the profile at it, then deletes the old file.
export async function setAvatar(userId: string, bytes: Buffer): Promise<string> {
  const sb = getSupabase();
  const old = await currentUrl(userId);
  const path = `${userId}/${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (upErr) throw upErr;
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await sb.schema('mercia').from('user_profiles').update({ avatar_url: url }).eq('id', userId);
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw error;
  }
  const oldPath = pathFromUrl(old);
  if (oldPath) await sb.storage.from(BUCKET).remove([oldPath]); // best effort
  return url;
}

export async function removeAvatar(userId: string): Promise<void> {
  const sb = getSupabase();
  const old = await currentUrl(userId);
  const { error } = await sb.schema('mercia').from('user_profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw error;
  const oldPath = pathFromUrl(old);
  if (oldPath) await sb.storage.from(BUCKET).remove([oldPath]);
}

// Account deletion: every file in the user's folder.
export async function removeAllAvatars(userId: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.storage.from(BUCKET).list(userId, { limit: 100 });
  const paths = (data ?? []).map(f => `${userId}/${f.name}`);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}
