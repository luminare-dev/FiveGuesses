// Song sources: curated categories, Apple charts, playlist imports and free-text resolution.
import { ApiError, chartIds, fetchPlaylistPage, lookup, parsePlaylistUrl, search, toTrack } from './apple.mjs';
import { CATEGORY_TRACKS } from './categories.mjs';
import { normalize, pickMatch } from './match.mjs';
import { fetchPlaylist, parsePlaylistUrl as parseYouTubeUrl } from './youtube.mjs';

export const MAX_SAMPLE = 30;

const S = (id, group, label, extra = {}) => ({ id, group, label, ...extra });
export const SOURCES = [
  S('chart-at', 'Charts', 'Charts Austria', { chart: 'at' }),
  S('chart-de', 'Charts', 'Charts Germany', { chart: 'de' }),
  S('chart-us', 'Charts', 'Charts US', { chart: 'us' }),
  S('chart-gb', 'Charts', 'Charts UK', { chart: 'gb' }),
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

export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// [{ id, country, seed? }] -> tracks in the same order, one lookup per country.
export async function lookupTracks(items, deps) {
  const byCountry = new Map();
  for (const it of items) {
    if (!byCountry.has(it.country)) byCountry.set(it.country, []);
    byCountry.get(it.country).push(it.id);
  }
  const found = new Map();
  for (const [country, ids] of byCountry) {
    for (const r of await lookup(ids, country, deps)) found.set(`${country}:${r.trackId}`, r);
  }
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const t = toTrack(found.get(`${it.country}:${it.id}`), it.country, it.seed);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

// Up to n tracks with previews from a category or chart, without the excluded ids.
export async function sampleTracks(sourceId, n, exclude, deps) {
  const src = findSource(sourceId);
  if (!src) throw new ApiError(404, 'source_unknown');
  const skip = new Set(exclude);
  let pool;
  if (src.chart) {
    const country = src.chart.toUpperCase();
    pool = (await chartIds(src.chart, deps)).map((id) => ({ id, country }));
  } else {
    pool = (CATEGORY_TRACKS[src.id] || []).map(([id, country, artist, title]) => ({
      id,
      country,
      seed: { artist, title },
    }));
  }
  const picked = shuffle(
    pool.filter((x) => !skip.has(x.id)),
    deps.random,
  ).slice(0, n + 5);
  const tracks = await lookupTracks(picked, deps);
  return { source: src.id, label: src.label, tracks: tracks.slice(0, n) };
}

async function pool(items, size, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

// Free-text entries -> Apple tracks. AT first, then DE while the subrequest budget lasts.
export async function resolveEntries(entries, deps) {
  const unique = new Map();
  for (const e of entries) {
    const key = `${normalize(e.artist)}|${normalize(e.title)}`;
    if (!unique.has(key) && key !== '|') unique.set(key, e);
  }
  const todo = shuffle([...unique.values()], deps.random).slice(0, MAX_SAMPLE);
  const hits = new Map();
  let stopped = false;
  const attempt = (country) => async (e) => {
    if (stopped || hits.has(e) || (deps.budget && deps.budget.left() <= 0)) return;
    try {
      const m = pickMatch(await search(`${e.artist} ${e.title}`, country, deps), e.artist, e.title);
      const t = m && toTrack(m, country);
      if (t) hits.set(e, t);
    } catch (err) {
      if (err instanceof ApiError && (err.throttled || err.code === 'budget')) stopped = true;
    }
  };
  await pool(todo, 3, attempt('AT'));
  await pool(
    todo.filter((e) => !hits.has(e)),
    3,
    attempt('DE'),
  );
  const tracks = [];
  const seen = new Set();
  for (const e of todo) {
    const t = hits.get(e);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      tracks.push(t);
    }
  }
  return { tracks, unresolved: todo.length - hits.size };
}

// A YouTube or Apple Music playlist link -> { label, total, tracks, unresolved }.
export async function importPlaylist(url, deps, env) {
  const apple = parsePlaylistUrl(url);
  if (apple) {
    const page = await fetchPlaylistPage(apple, deps);
    const country = apple.cc.toUpperCase();
    const ids = [...new Set(page.ids)];
    const picked = shuffle(ids, deps.random).slice(0, MAX_SAMPLE);
    const tracks = await lookupTracks(
      picked.map((id) => ({ id, country })),
      deps,
    );
    return { label: page.label, total: ids.length, tracks, unresolved: picked.length - tracks.length };
  }
  const list = parseYouTubeUrl(url);
  if (list) {
    const pl = await fetchPlaylist(list, env.YOUTUBE_API_KEY, deps);
    const { tracks, unresolved } = await resolveEntries(pl.entries, deps);
    return { label: pl.label, total: pl.entries.length, tracks, unresolved };
  }
  throw new ApiError(400, 'playlist_unsupported');
}
