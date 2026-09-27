import api from './api';

export interface MyProfile {
  username: string;
  displayName: string | null;
  needsUsername: boolean;
  followers?: number;
  following?: number;
  avatarUrl?: string | null;
  memberSince?: string;
}

export async function fetchMyProfile(timeoutMs?: number): Promise<MyProfile> {
  const res = await api.get('/api/profile/me', timeoutMs ? { timeout: timeoutMs } : undefined);
  return res.data.data;
}

export async function checkUsername(u: string): Promise<{ available: boolean; problem: string | null }> {
  const res = await api.get('/api/profile/username-available', { params: { u } });
  return res.data.data;
}

/** Saves; throws an Error whose message is the reason to show (e.g. "That username is taken"). */
export async function saveMyProfile(changes: { username?: string; displayName?: string }): Promise<MyProfile> {
  try {
    const res = await api.put('/api/profile', changes);
    return res.data.data;
  } catch (e: any) {
    throw new Error(e?.response?.data?.problem ?? e?.response?.data?.error ?? "Couldn't save. Try again.");
  }
}

/** Sets the profile photo from a base64 JPEG (already cropped square and shrunk). */
export async function uploadAvatar(base64: string): Promise<MyProfile> {
  try {
    const res = await api.post('/api/profile/avatar', { image: base64 }, { timeout: 60000 });
    return res.data.data;
  } catch (e: any) {
    throw new Error(e?.response?.data?.problem ?? e?.response?.data?.error ?? "Couldn't save your photo. Try again.");
  }
}

export async function deleteAvatar(): Promise<MyProfile> {
  try {
    const res = await api.delete('/api/profile/avatar');
    return res.data.data;
  } catch (e: any) {
    throw new Error(e?.response?.data?.error ?? "Couldn't remove your photo. Try again.");
  }
}
