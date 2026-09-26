// Username rules (Instagram-style). The app has a copy of these for its live
// check (mobile/src/utils/usernames.ts); the server and the database's CHECK
// constraint have the final say.
//
//  - 3–20 characters: a–z, 0–9, _ and .
//  - can't start or end with a period, no two periods in a row
//  - stored lowercase, unique regardless of capitals
//  - a few reserved names can't be taken

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MAX = 40;

export const RESERVED = new Set([
  'mercia', 'admin', 'administrator', 'support', 'help', 'root', 'system', 'official', 'staff', 'team',
  'moderator', 'mod', 'null', 'undefined', 'api', 'www', 'app', 'settings', 'profile', 'login', 'signup', 'oasis',
]);

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** null if valid, otherwise a short reason to show the user. */
export function usernameProblem(u: string): string | null {
  if (u.length < USERNAME_MIN) return 'At least 3 characters';
  if (u.length > USERNAME_MAX) return 'Up to 20 characters';
  if (!/^[a-z0-9._]+$/.test(u)) return 'Only letters, numbers, _ and .';
  if (u.startsWith('.') || u.endsWith('.')) return "Can't start or end with a period";
  if (u.includes('..')) return 'No two periods in a row';
  if (RESERVED.has(u)) return 'That name is reserved';
  return null;
}

/** What to build a suggestion from: the name if shared, else the email's local part (not Apple relay addresses). */
export function suggestionSeed(p: { displayName?: string | null; email?: string | null }): string {
  if (p.displayName?.trim()) return p.displayName.trim();
  const email = p.email ?? '';
  if (!email || /@privaterelay\.appleid\.com$/i.test(email)) return '';
  return email.split('@')[0];
}

/** A valid base from any text: accents folded, other characters → '.', trimmed to fit. */
function baseFrom(seed: string): string {
  let b = seed
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  b = b.slice(0, USERNAME_MAX).replace(/\.+$/g, '');
  return b;
}

/** A valid, free username built from `seed`, adding 2, 3, … on collisions. */
export function suggestUsername(seed: string, isTaken: (u: string) => boolean): string {
  let base = baseFrom(seed);
  if (base.length > 0 && base.length < USERNAME_MIN) base = (base + '123').slice(0, USERNAME_MIN);
  const candidates: string[] = [];
  if (base.length >= USERNAME_MIN) {
    candidates.push(base);
    for (let n = 2; n < 1000; n++) {
      const suffix = String(n);
      const head = base.slice(0, USERNAME_MAX - suffix.length).replace(/\.+$/g, '');
      candidates.push(head + suffix);
    }
  }
  for (const c of candidates) if (usernameProblem(c) === null && !isTaken(c)) return c;
  for (;;) {
    const c = `user${Math.floor(100000 + Math.random() * 900000)}`;
    if (!isTaken(c)) return c;
  }
}

export function cleanDisplayName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Cut by characters (code points), never through the middle of an emoji —
  // the database counts characters the same way.
  const t = Array.from(input.replace(/\s+/g, ' ').trim()).slice(0, DISPLAY_NAME_MAX).join('').trim();
  return t || null;
}
