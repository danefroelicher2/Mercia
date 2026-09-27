import api from './api';

// Other people: search, public profiles, follow, block, report.

export interface Person {
  id: string;
  username: string;
  displayName: string | null;
  isFollowing?: boolean;
}

export interface PublicProfile extends Person {
  memberSince: string;
  followers: number;
  following: number;
  isMe: boolean;
  isFollowing: boolean;
  followsYou: boolean;
  currentStreak: number;
  bestStreak: number;
}

export type ReportReason = 'inappropriate_name' | 'spam' | 'impersonation' | 'other';

// Readable message from a failed request.
const reason = (e: any, fallback: string) => new Error(e?.response?.data?.error ?? fallback);

export async function searchPeople(q: string): Promise<Person[]> {
  const res = await api.get('/api/people/search', { params: { q } });
  return res.data.data;
}

/** Throws an Error with `notFound = true` when the person doesn't exist or is blocked. */
export async function fetchPerson(id: string): Promise<PublicProfile> {
  try {
    const res = await api.get(`/api/people/${id}`);
    return res.data.data;
  } catch (e: any) {
    const err: any = reason(e, "Couldn't load this profile");
    err.notFound = e?.response?.status === 404;
    throw err;
  }
}

export async function setFollowing(id: string, follow: boolean): Promise<{ isFollowing: boolean; followers: number }> {
  try {
    const res = follow ? await api.post(`/api/people/${id}/follow`) : await api.delete(`/api/people/${id}/follow`);
    return res.data.data;
  } catch (e) {
    throw reason(e, follow ? "Couldn't follow. Try again." : "Couldn't unfollow. Try again.");
  }
}

export async function fetchFollowList(
  id: string,
  kind: 'followers' | 'following',
  before?: string | null,
): Promise<{ people: (Person & { followedAt: string })[]; nextBefore: string | null }> {
  const res = await api.get(`/api/people/${id}/${kind}`, { params: before ? { before } : undefined });
  return { people: res.data.data, nextBefore: res.data.nextBefore ?? null };
}

export async function setBlocked(id: string, block: boolean): Promise<void> {
  try {
    if (block) await api.post(`/api/people/${id}/block`);
    else await api.delete(`/api/people/${id}/block`);
  } catch (e) {
    throw reason(e, block ? "Couldn't block. Try again." : "Couldn't unblock. Try again.");
  }
}

export async function fetchBlocked(): Promise<Person[]> {
  const res = await api.get('/api/people/blocked');
  return res.data.data;
}

export async function reportPerson(id: string, r: ReportReason, note?: string): Promise<void> {
  try {
    await api.post(`/api/people/${id}/report`, { reason: r, note });
  } catch (e) {
    throw reason(e, "Couldn't send the report. Try again.");
  }
}
