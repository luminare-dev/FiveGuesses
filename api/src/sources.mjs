// Song sources: the curated categories and playlist imports. Nothing here calls itunes.apple.com:
// the browser looks the ids up and matches the entries itself. The charts live in the client.
import { ApiError, fetchPlaylistPage, parsePlaylistUrl } from './apple.mjs';
import { CATEGORY_TRACKS } from './categories.mjs';
import { fetchSpotifyPlaylist, parsePlaylistUrl as parseSpotifyUrl } from './spotify.mjs';
import { fetchPlaylist, parsePlaylistUrl as parseYouTubeUrl } from './youtube.mjs';

const S = (id, group, label) => ({ id, group, label });
export const SOURCES = [
  S('70s', 'Decades', '1970s'),
  S('80s', 'Decades', '1980s'),
  S('90s', 'Decades', '1990s'),
  S('2000s', 'Decades', '2000s'),
  S('2010s', 'Decades', '2010s'),
  S('2020s', 'Decades', '2020s'),
  S('pop', 'Genres', 'Pop'),
  S('rock', 'Genres', 'Rock'),
  S('hiphop', 'Genres', 'Hip-Hop/Rap'),
  S('electronic', 'Genres', 'Electronic/Dance'),
  S('deutschpop', 'German-language', 'Deutschpop'),
  S('austropop', 'German-language', 'Austropop'),
  S('schlager', 'German-language', 'Schlager'),
  S('soundtracks', 'More', 'Soundtracks (movies and TV)'),
  S('videogames', 'More', 'Video game music'),
  S('onehits', 'More', 'One-hit wonders'),
  S('christmas', 'More', 'Christmas'),
];
const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

export const publicSources = () => SOURCES.map(({ id, group, label }) => ({ id, group, label }));
export const findSource = (id) => BY_ID.get(id) ?? null;

// Every entry of a category from the resolved seed data: { source, label, entries }.
export function categoryPool(sourceId) {
  const src = findSource(sourceId);
  if (!src) throw new ApiError(404, 'source_unknown');
  const entries = (CATEGORY_TRACKS[src.id] || []).map(([id, country, artist, title]) => ({ id, artist, title, country }));
  return { source: src.id, label: src.label, entries };
}

// A YouTube, Apple Music or Spotify playlist link ->
//   { kind: 'ids', label, country, total, items: [{ id, title }] } (Apple Music) or
//   { kind: 'entries', label, total, entries: [{ artist, title }] } (YouTube, Spotify).
// SPOTIFY_IMPORT=off turns the Spotify import off (503 spotify_unavailable).
export async function importPlaylist(url, deps, env) {
  const apple = parsePlaylistUrl(url);
  if (apple) {
    const page = await fetchPlaylistPage(apple, deps);
    return { kind: 'ids', label: page.label, country: apple.cc.toUpperCase(), total: page.items.length, items: page.items };
  }
  const list = parseYouTubeUrl(url);
  if (list) {
    const pl = await fetchPlaylist(list, env.YOUTUBE_API_KEY, deps);
    return { kind: 'entries', label: pl.label, total: pl.entries.length, entries: pl.entries };
  }
  const spotify = parseSpotifyUrl(url);
  if (spotify) {
    if (String(env.SPOTIFY_IMPORT ?? '').trim().toLowerCase() === 'off') throw new ApiError(503, 'spotify_unavailable');
    const pl = await fetchSpotifyPlaylist(spotify, deps);
    return { kind: 'entries', label: pl.label, total: pl.entries.length, entries: pl.entries };
  }
  throw new ApiError(400, 'playlist_unsupported');
}
