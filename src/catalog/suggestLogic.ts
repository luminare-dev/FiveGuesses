import type { Song } from '../game';

// Limits of the live search, per browser session: Apple allows about 20 requests a minute per
// player, so typing stays under that with the debounce, the cache and the page's one iTunes limit
// (appleLimiter in itunes.ts, shared with the lookups and the matching of imported lists).
export const LIVE_MIN_CHARS = 2;
export const DEBOUNCE_MS = 250;
export const SEARCH_TIMEOUT_MS = 5_000;
export const CACHE_SIZE = 50;
// After a failed search the built-in list answers for this long.
export const FALLBACK_MS = 60_000;

export type LiveSession = {
  cache: Map<string, Song[]>;
  fallbackUntil: number;
};

export function createSession(): LiveSession {
  return { cache: new Map(), fallbackUntil: 0 };
}

export function cached(session: LiveSession, key: string): Song[] | undefined {
  const items = session.cache.get(key);
  if (items !== undefined) {
    // Most recently used last, so the oldest is the first to go.
    session.cache.delete(key);
    session.cache.set(key, items);
  }
  return items;
}

export function remember(session: LiveSession, key: string, items: Song[]): void {
  session.cache.delete(key);
  session.cache.set(key, items);
  while (session.cache.size > CACHE_SIZE) {
    const oldest = session.cache.keys().next();
    if (oldest.done) break;
    session.cache.delete(oldest.value);
  }
}

export function inFallback(session: LiveSession, now: number): boolean {
  return now < session.fallbackUntil;
}

export function markFailed(session: LiveSession, now: number): void {
  session.fallbackUntil = now + FALLBACK_MS;
}
