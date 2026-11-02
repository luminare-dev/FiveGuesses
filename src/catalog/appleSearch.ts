import { artistNames, compact, coreTitle } from '../game';
import type { Song } from '../game';
import { appleLimiter } from './itunes';

export const SEARCH_URL = 'https://itunes.apple.com/search';
const MAX_ITEMS = 8;

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
  for (const r of results) {
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

// The browser asks Apple directly (the answer allows any origin), under the player's own limit.
export async function searchApple(query: string, signal?: AbortSignal): Promise<Song[]> {
  const params = new URLSearchParams({ term: query, media: 'music', entity: 'song', limit: '20', country: 'AT' });
  // Counted against the page's iTunes limit, so matching a list never pushes the page over it.
  appleLimiter.note();
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) throw new SearchError(response.status);
  // Apple labels the JSON text/javascript, so it is parsed from the text.
  const body = JSON.parse(await response.text()) as { results?: unknown };
  return toSuggestions(Array.isArray(body.results) ? (body.results as Result[]) : []);
}
