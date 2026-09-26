// Username rules — a copy of backend/src/lib/usernames.ts for the live check
// while typing. The server (and the database) have the final say.
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
