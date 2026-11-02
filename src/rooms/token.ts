// The seat token of a room: 16 random bytes as base64url (22 characters), one per tab in
// sessionStorage, so a reload keeps the seat and a closed tab forgets it. Memory stands in where
// sessionStorage is blocked.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const memory = new Map<string, string>();

export const tokenKey = (code: string) => `fg:room:${code}`;
export const isToken = (value: string | null): value is string => value !== null && /^[A-Za-z0-9_-]{22}$/.test(value);

export function newToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(value >> bits) & 63];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (6 - bits)) & 63];
  return out;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function seatToken(code: string): string {
  const key = tokenKey(code);
  let stored: string | null = memory.get(key) ?? null;
  try {
    stored = storage()?.getItem(key) ?? stored;
  } catch {
    // Blocked storage: the in-memory copy holds the seat for this page.
  }
  if (isToken(stored)) {
    memory.set(key, stored);
    return stored;
  }
  const token = newToken();
  memory.set(key, token);
  try {
    storage()?.setItem(key, token);
  } catch {
    // As above.
  }
  return token;
}

export function forgetToken(code: string): void {
  const key = tokenKey(code);
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing stored.
  }
}
