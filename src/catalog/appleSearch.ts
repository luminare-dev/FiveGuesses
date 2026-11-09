import { artistNames, compact, coreTitle } from '../game';
import type { Song } from '../game';
import { appleLimiter } from './itunes';

export const SEARCH_URL = 'https://itunes.apple.com/search';
const MAX_ITEMS = 8;
// Apple's Austrian search misses some big international hits that the US catalogue ranks
// first, so the US store is asked first and the Austrian one too while the limit has room.
const COUNTRIES = ['US', 'AT'] as const;
const SECOND_STORE_MIN_FREE = 6;
// Karaoke, tribute and similar versions go below the originals.
const ALTERNATE =
  /karaoke|tribute|originally performed|as made famous|made famous by|in the style of|8-bit|lullaby|instrumental|\bpiano\b|\bacoustic\b/i;

// Thrown for an answer that says to back off (403, 429) or any other failed request.
export class SearchError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`search failed: ${status}`);
    this.name = 'SearchError';
    this.status = status;
  }
}

type Result = {
  trackId?: unknown;
  artistName?: unknown;
  trackName?: unknown;
  artworkUrl100?: unknown;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function artwork(url: string): string {
  if (!url.startsWith('https://')) return '';
  try {
    if (!new URL(url).hostname.endsWith('.mzstatic.com')) return '';
  } catch {
    return '';
  }
  return url.replace('100x100bb', '60x60bb');
}

// Apple results -> at most 8 suggestions, one per song: versions of a title by the same first
// artist (the single, the album cut, a remaster) collapse into the first one.
export function toSuggestions(results: readonly Result[]): Song[] {
  const seen = new Set<string>();
  const items: Song[] = [];
  const ordered = [
    ...results.filter((r) => !ALTERNATE.test(`${str(r.trackName)} ${str(r.artistName)}`)),
    ...results.filter((r) => ALTERNATE.test(`${str(r.trackName)} ${str(r.artistName)}`)),
  ];
  for (const r of ordered) {
    const id = r.trackId;
    const artist = str(r.artistName);
    const title = str(r.trackName);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || artist === '' || title === '') continue;
    const key = `${compact(coreTitle(title))}|${artistNames(artist)[0] ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id,
      artist,
      title,
      year: null,
      matchedTrack: title,
      matchedArtist: artist,
      previewUrl: '',
      artworkUrl: artwork(str(r.artworkUrl100)),
      appleMusicUrl: null,
    });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

async function searchStore(query: string, country: string, signal?: AbortSignal): Promise<Result[]> {
  const params = new URLSearchParams({ term: query, media: 'music', entity: 'song', limit: '20', country });
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new SearchError(response.status);
  // Apple labels the JSON text/javascript, so it is parsed from the text.
  const body = JSON.parse(await response.text()) as { results?: unknown };
  return Array.isArray(body.results) ? (body.results as Result[]) : [];
}

// The browser asks Apple directly (the answer allows any origin), under the page's one iTunes
// limit: null, and no request, while matching a list or earlier typing has used it up. The
// second store is asked only while the limit has room; one store answering is enough.
export async function searchApple(query: string, signal?: AbortSignal): Promise<Song[] | null> {
  if (!appleLimiter.tryTake()) return null;
  const stores: string[] = [COUNTRIES[0]];
  if (appleLimiter.free() >= SECOND_STORE_MIN_FREE && appleLimiter.tryTake()) stores.push(COUNTRIES[1]);
  const answers = await Promise.allSettled(stores.map((country) => searchStore(query, country, signal)));
  const results: Result[] = [];
  for (const answer of answers) if (answer.status === 'fulfilled') results.push(...answer.value);
  if (answers.every((a) => a.status === 'rejected')) throw (answers[0] as PromiseRejectedResult).reason;
  return toSuggestions(results);
}
