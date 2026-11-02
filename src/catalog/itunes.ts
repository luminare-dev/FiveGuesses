// The browser's own requests to iTunes (every answer allows any origin): id lookups, the top-songs
// feed and the searches that match imported entries. The song service never calls iTunes: Apple
// refuses its servers, so each player asks Apple directly, under the player's own limit.
import type { Entry, Track } from '../api';
import { pickMatch } from './match';
import type { SearchResult } from './match';

export const ITUNES = 'https://itunes.apple.com';
export const AUDIO_PREFIX = 'https://audio-ssl.itunes.apple.com/';
// Apple answers about 20 requests a minute per player; we stay at 18 in any 60 s.
export const APPLE_PER_MINUTE = 18;
export const APPLE_WINDOW_MS = 60_000;
const LOOKUP_MAX = 200;
const TIMEOUT_MS = 10_000;
// The room checks these lengths again (api/src/rules.mjs).
const TEXT_MAX = 200;
const URL_MAX = 500;
// Imported entries are matched in the Austrian catalogue, as the guess box searches.
export const MATCH_COUNTRY = 'AT';

// status: Apple's answer, or 0 when none came or it was not JSON.
export class AppleError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`iTunes request failed: ${status}`);
    this.name = 'AppleError';
    this.status = status;
  }
}

// 403 and 429 are Apple asking to slow down.
export const isThrottled = (error: unknown): boolean =>
  error instanceof AppleError && (error.status === 403 || error.status === 429);

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// At most `limit` requests in any window of `windowMs`.
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly stamps: number[] = [];

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  // Counts a request that did not wait for a slot (the guess box's suggestions).
  note(): void {
    this.prune();
    this.stamps.push(this.now());
  }

  // Milliseconds until a slot is free; 0 when one is free now.
  wait(): number {
    this.prune();
    if (this.stamps.length < this.limit) return 0;
    return Math.max(1, this.stamps[0] + this.windowMs - this.now());
  }

  // Waits for a free slot and takes it.
  async take(signal?: AbortSignal): Promise<void> {
    for (let ms = this.wait(); ms > 0; ms = this.wait()) await sleep(ms, signal);
    if (signal?.aborted) throw abortError();
    this.stamps.push(this.now());
  }

  private prune(): void {
    const cut = this.now() - this.windowMs;
    while (this.stamps.length > 0 && this.stamps[0] <= cut) this.stamps.shift();
  }
}

// One limit for every iTunes request of this page.
export const appleLimiter = new RateLimiter(APPLE_PER_MINUTE, APPLE_WINDOW_MS);

// A JSON answer from iTunes after a free slot; Apple labels it text/javascript, so it is parsed
// from the text.
async function appleJson(url: string, signal?: AbortSignal): Promise<unknown> {
  await appleLimiter.take(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      if (signal?.aborted) throw abortError();
      throw new AppleError(0);
    }
    if (!response.ok) throw new AppleError(response.status);
    try {
      return JSON.parse(await response.text()) as unknown;
    } catch {
      if (signal?.aborted) throw abortError();
      throw new AppleError(0);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function resultsOf(body: { results?: unknown } | null): SearchResult[] {
  const results = body?.results;
  return Array.isArray(results) ? (results as SearchResult[]).filter((r) => r !== null && typeof r === 'object') : [];
}

function httpsUrl(url: string): URL | null {
  if (url.length > URL_MAX || !url.startsWith('https://')) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// A cover from Apple's image hosts in 512 px, or '' for anything else.
export function safeArtwork(url: string): string {
  const u = httpsUrl(url);
  if (u === null || !u.hostname.endsWith('.mzstatic.com')) return '';
  return url.replace(/\d+x\d+bb(?=\.\w+$)/, '512x512bb');
}

function safeLink(url: string): string | null {
  const u = httpsUrl(url);
  return u !== null && u.hostname === 'music.apple.com' ? url : null;
}

// A search or lookup result as a track, or null without a usable preview. A seed keeps the
// curated names.
export function toTrack(r: SearchResult | undefined, country: string, seed?: Entry): Track | null {
  if (r === undefined) return null;
  const previewUrl = str(r.previewUrl);
  if (!previewUrl.startsWith(AUDIO_PREFIX) || httpsUrl(previewUrl) === null) return null;
  const id = r.trackId;
  const matchedTrack = str(r.trackName).slice(0, TEXT_MAX);
  const matchedArtist = str(r.artistName).slice(0, TEXT_MAX);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || matchedTrack === '' || matchedArtist === '') {
    return null;
  }
  return {
    id,
    artist: seed !== undefined ? seed.artist.slice(0, TEXT_MAX) : matchedArtist,
    title: seed !== undefined ? seed.title.slice(0, TEXT_MAX) : matchedTrack,
    year: null,
    matchedTrack,
    matchedArtist,
    previewUrl,
    artworkUrl: safeArtwork(str(r.artworkUrl100)),
    appleMusicUrl: safeLink(str(r.trackViewUrl)),
    country: country.toUpperCase(),
  };
}

export type LookupItem = { id: number; country: string; seed?: Entry };

// Tracks for ids, in the order asked, each once: one lookup per country and 200 ids.
export async function lookupTracks(items: readonly LookupItem[], signal?: AbortSignal): Promise<Track[]> {
  const byCountry = new Map<string, number[]>();
  for (const item of items) {
    const country = item.country.toUpperCase();
    const ids = byCountry.get(country) ?? [];
    if (!ids.includes(item.id)) ids.push(item.id);
    byCountry.set(country, ids);
  }
  const found = new Map<string, SearchResult>();
  for (const [country, ids] of byCountry) {
    for (let at = 0; at < ids.length; at += LOOKUP_MAX) {
      const params = new URLSearchParams({ id: ids.slice(at, at + LOOKUP_MAX).join(','), country });
      const body = (await appleJson(`${ITUNES}/lookup?${params.toString()}`, signal)) as { results?: unknown } | null;
      for (const r of resultsOf(body)) {
        if (r.wrapperType === 'track' && typeof r.trackId === 'number') found.set(`${country}:${r.trackId}`, r);
      }
    }
  }
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const track = toTrack(found.get(`${item.country.toUpperCase()}:${item.id}`), item.country, item.seed);
    if (track !== null && !seen.has(track.id)) {
      seen.add(track.id);
      out.push(track);
    }
  }
  return out;
}

export const CHART_COUNTRIES = ['at', 'de', 'us', 'gb'] as const;
export type ChartCountry = (typeof CHART_COUNTRIES)[number];

type Labelled = { label?: unknown; attributes?: Record<string, unknown> };
type FeedEntry = {
  id?: Labelled;
  'im:name'?: Labelled;
  'im:artist'?: Labelled;
  'im:image'?: Labelled[] | Labelled;
  link?: Labelled[] | Labelled;
};

const list = <T>(value: T[] | T | undefined): T[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

// The iTunes top-songs feed (legacy RSS as JSON) -> tracks with previews, in chart order.
export function parseChart(body: unknown, country: string): Track[] {
  const feed = (body as { feed?: { entry?: FeedEntry[] | FeedEntry } } | null)?.feed;
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const entry of list(feed?.entry)) {
    const links = list(entry.link);
    const preview = links.find((l) => str(l.attributes?.type) === 'audio/x-m4a');
    const page = links.find((l) => str(l.attributes?.rel) === 'alternate');
    const images = list(entry['im:image']);
    const track = toTrack(
      {
        trackId: Number(str(entry.id?.attributes?.['im:id'])),
        trackName: str(entry['im:name']?.label),
        artistName: str(entry['im:artist']?.label),
        previewUrl: str(preview?.attributes?.href),
        artworkUrl100: str(images[images.length - 1]?.label),
        trackViewUrl: str(page?.attributes?.href),
      },
      country
    );
    if (track !== null && !seen.has(track.id)) {
      seen.add(track.id);
      out.push(track);
    }
  }
  return out;
}

export async function chartTracks(cc: ChartCountry, signal?: AbortSignal): Promise<Track[]> {
  return parseChart(await appleJson(`${ITUNES}/${cc}/rss/topsongs/limit=100/json`, signal), cc.toUpperCase());
}

async function searchSongs(term: string, country: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '10', country });
  return resultsOf((await appleJson(`${ITUNES}/search?${params.toString()}`, signal)) as { results?: unknown } | null);
}

export type MatchProgress = { done: number; total: number; found: number };
export type MatchResult = { tracks: Track[]; unresolved: number; throttled: boolean };

// Imported entries -> tracks, one search each, one at a time under the limit. An abort or Apple
// asking to slow down stops the run and keeps what was found.
export async function matchEntries(
  entries: readonly Entry[],
  onProgress?: (progress: MatchProgress) => void,
  signal?: AbortSignal
): Promise<MatchResult> {
  const tracks: Track[] = [];
  const seen = new Set<number>();
  let done = 0;
  let throttled = false;
  for (const entry of entries) {
    if (signal?.aborted) break;
    try {
      const match = pickMatch(await searchSongs(`${entry.artist} ${entry.title}`, MATCH_COUNTRY, signal), entry.artist, entry.title);
      const track = match !== null ? toTrack(match, MATCH_COUNTRY) : null;
      if (track !== null && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    } catch (error) {
      if (signal?.aborted) break;
      if (isThrottled(error)) {
        throttled = true;
        break;
      }
    }
    done += 1;
    onProgress?.({ done, total: entries.length, found: tracks.length });
  }
  return { tracks, unresolved: entries.length - tracks.length, throttled };
}
