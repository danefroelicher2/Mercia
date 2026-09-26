import api from './api';

export interface MyProfile {
  username: string;
  displayName: string | null;
  needsUsername: boolean;
}

export async function fetchMyProfile(): Promise<MyProfile> {
  const res = await api.get('/api/profile/me');
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
