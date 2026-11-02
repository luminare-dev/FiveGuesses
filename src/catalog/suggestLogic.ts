import type { Song } from '../game';

// Limits of the live search, per browser session: Apple allows about 20 searches a minute per
// player, so typing stays under that with the debounce, the cache and this budget.
export const LIVE_MIN_CHARS = 2;
export const DEBOUNCE_MS = 250;
export const SEARCH_TIMEOUT_MS = 5_000;
export const BUDGET = 20;
export const BUDGET_WINDOW_MS = 60_000;
export const CACHE_SIZE = 50;
// After a failed search the built-in list answers for this long.
export const FALLBACK_MS = 60_000;

export type LiveSession = {
  cache: Map<string, Song[]>;
  // Start times of the searches inside the budget window.
  requests: number[];
  fallbackUntil: number;
};

export function createSession(): LiveSession {
  return { cache: new Map(), requests: [], fallbackUntil: 0 };
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

// True, and the search is counted, when one more fits into the rolling window.
export function takeBudget(session: LiveSession, now: number): boolean {
  session.requests = session.requests.filter((at) => now - at < BUDGET_WINDOW_MS);
  if (session.requests.length >= BUDGET) return false;
  session.requests.push(now);
  return true;
}

export function inFallback(session: LiveSession, now: number): boolean {
  return now < session.fallbackUntil;
}

export function markFailed(session: LiveSession, now: number): void {
  session.fallbackUntil = now + FALLBACK_MS;
}
