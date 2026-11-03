import { useEffect, useMemo, useRef, useState } from 'react';
import { searchApple } from './catalog/appleSearch';
import {
  cached,
  createSession,
  DEBOUNCE_MS,
  inFallback,
  LIVE_MIN_CHARS,
  markFailed,
  remember,
  SEARCH_TIMEOUT_MS,
} from './catalog/suggestLogic';
import { normalize, searchSongs } from './game';
import type { Song } from './game';
import { useOnline } from './useOnline';

export const MAX_SUGGESTIONS = 8;

export type Suggestions = {
  items: Song[];
  // A live search for the current text is still on its way; items are the previous ones.
  pending: boolean;
  // The built-in list answers instead of Apple (offline, a failed search, the iTunes limit used up).
  fallbackMode: boolean;
};

type Answer = { key: string; items: Song[]; fallback: boolean };

// Shared by every guess box of the tab, forgotten on reload.
const session = createSession();

// Suggestions for the guess box. Not live (the daily round): the built-in list, synchronously.
// Live: Apple's catalogue, debounced, the stale request cancelled, cached per text.
export function useSuggestions(query: string, { live, fallback }: { live: boolean; fallback: readonly Song[] }): Suggestions {
  const online = useOnline();
  const key = normalize(query);
  const local = useMemo(() => searchSongs(fallback, query, MAX_SUGGESTIONS), [fallback, query]);
  const queryRef = useRef(query);
  queryRef.current = query;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!live || key.length < LIVE_MIN_CHARS) return undefined;
    const answerLocally = () =>
      setAnswer({ key, items: searchSongs(fallbackRef.current, queryRef.current, MAX_SUGGESTIONS), fallback: true });
    if (!online || inFallback(session, Date.now())) {
      answerLocally();
      return undefined;
    }
    const hit = cached(session, key);
    if (hit !== undefined) {
      setAnswer({ key, items: hit, fallback: false });
      return undefined;
    }
    let stale = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounce = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      searchApple(queryRef.current.trim(), controller.signal)
        .then((items) => {
          // The page's iTunes limit is used up: the built-in list answers, nothing is cached.
          if (items === null) {
            if (!stale) answerLocally();
            return;
          }
          remember(session, key, items);
          if (!stale) setAnswer({ key, items, fallback: false });
        })
        .catch(() => {
          if (stale) return;
          markFailed(session, Date.now());
          answerLocally();
        })
        .finally(() => clearTimeout(timeout));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(debounce);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [live, key, online]);

  if (!live) return { items: local, pending: false, fallbackMode: false };
  if (key.length < LIVE_MIN_CHARS) return { items: [], pending: false, fallbackMode: false };
  if (answer !== null && answer.key === key) return { items: answer.items, pending: false, fallbackMode: answer.fallback };
  return { items: answer?.items ?? [], pending: true, fallbackMode: answer?.fallback ?? false };
}
