// People search and reports: the pure parts (no database), so they can be
// tested on their own. Used by routes/people.ts.

export const SEARCH_LIMIT = 20;
export const LIST_LIMIT = 50;

export const REPORT_REASONS = ['inappropriate_name', 'spam', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUserId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

// What the user typed, reduced to something safe to search with: lowercased,
// spaces collapsed, a leading @ dropped, and only characters a username or
// name can contain (letters in any language, digits, space, _ . ' -).
// Returns '' when nothing searchable is left.
export function cleanSearchQuery(input: unknown): string {
  if (typeof input !== 'string') return '';
  return Array.from(
    input
      .normalize('NFC')
      .toLowerCase()
      .replace(/^\s*@/, '')
      .replace(/[^\p{L}\p{N}\s_.'-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, 40)
    .join('')
    .trim();
}

// A LIKE pattern matching `q` literally (\ % _ escaped), as a prefix or anywhere.
export function likePattern(q: string, where: 'prefix' | 'contains'): string {
  const lit = q.replace(/[\\%_]/g, c => `\\${c}`);
  return where === 'prefix' ? `${lit}%` : `%${lit}%`;
}

export interface SearchCandidate {
  id: string;
  username: string;
  displayName: string | null;
}

// Best first: exact username, then people you follow, then username
// prefix matches, then name matches; ties by username.
export function rankSearch<T extends SearchCandidate>(q: string, people: T[], following: Set<string>): T[] {
  const score = (p: T) =>
    p.username === q ? 0 : following.has(p.id) ? 1 : p.username.startsWith(q) ? 2 : 3;
  const seen = new Set<string>();
  return people
    .filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => score(a) - score(b) || a.username.localeCompare(b.username))
    .slice(0, SEARCH_LIMIT);
}

export function cleanReport(body: any): { reason: ReportReason; note: string | null } | null {
  const reason = body?.reason;
  if (!REPORT_REASONS.includes(reason)) return null;
  const note = typeof body?.note === 'string' ? Array.from(body.note.trim()).slice(0, 500).join('').trim() : '';
  return { reason, note: note || null };
}
