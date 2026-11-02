// iTunes Search/Lookup, Apple's chart feed and public Apple Music playlist pages (server side).

const UA = 'FiveGuesses/1.0 (+https://fiveguesses.app)';
const TIMEOUT_MS = 8000;
export const SUBREQUEST_LIMIT = 45;
const CHART_TTL = 3600;

export class ApiError extends Error {
  constructor(status, code, throttled = false) {
    super(code);
    this.status = status;
    this.code = code;
    this.throttled = throttled;
  }
}

// Workers Free allows 50 subrequests per invocation; we stop at 45.
export function budget(limit = SUBREQUEST_LIMIT) {
  return { used: 0, limit, left() { return this.limit - this.used; } };
}

export async function get(url, deps, opts = {}) {
  const b = deps.budget;
  if (b) {
    if (b.used >= b.limit) throw new ApiError(502, 'budget');
    b.used += 1;
  }
  return deps.fetch(url, {
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: opts.redirect || 'follow',
  });
}

async function appleJson(url, deps) {
  let res;
  try {
    res = await get(url, deps);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'apple_unavailable');
  }
  if (res.status === 403 || res.status === 429) throw new ApiError(502, 'apple_unavailable', true);
  if (!res.ok) throw new ApiError(502, 'apple_unavailable');
  try {
    return JSON.parse(await res.text());
  } catch {
    throw new ApiError(502, 'apple_unavailable');
  }
}

export async function search(term, country, deps, limit = 10) {
  const q = new URLSearchParams({ term, media: 'music', entity: 'song', limit: String(limit), country });
  const data = await appleJson(`https://itunes.apple.com/search?${q}`, deps);
  return Array.isArray(data.results) ? data.results : [];
}

export async function lookup(ids, country, deps) {
  if (!ids.length) return [];
  const q = new URLSearchParams({ id: ids.slice(0, 200).join(','), country });
  const data = await appleJson(`https://itunes.apple.com/lookup?${q}`, deps);
  return Array.isArray(data.results) ? data.results.filter((r) => r.wrapperType === 'track') : [];
}

function safeArtwork(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname.endsWith('.mzstatic.com')) return url.replace('100x100bb', '512x512bb');
  } catch {}
  return '';
}

function safeLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'music.apple.com') return url;
  } catch {}
  return null;
}

// A search/lookup result as a Song-compatible track, or null without a usable preview.
export function toTrack(r, country, seed) {
  if (!r || typeof r.previewUrl !== 'string' || !r.previewUrl.startsWith('https://audio-ssl.itunes.apple.com/')) {
    return null;
  }
  if (!Number.isSafeInteger(r.trackId) || !r.trackName || !r.artistName) return null;
  return {
    id: r.trackId,
    artist: seed ? seed.artist : r.artistName,
    title: seed ? seed.title : r.trackName,
    year: null,
    matchedTrack: r.trackName,
    matchedArtist: r.artistName,
    previewUrl: r.previewUrl,
    artworkUrl: safeArtwork(r.artworkUrl100 || ''),
    appleMusicUrl: safeLink(r.trackViewUrl || ''),
    country,
  };
}

// Track ids of Apple's most-played chart for one country, cached for an hour.
export async function chartIds(cc, deps) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/100/songs.json`;
  const key = `https://api.fiveguesses.app/_cache/chart/${cc}`;
  const cache = deps.cache;
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return await hit.json();
    } catch {}
  }
  const data = await appleJson(url, deps);
  const ids = (data?.feed?.results || []).map((r) => Number(r.id)).filter((n) => Number.isSafeInteger(n) && n > 0);
  if (cache && ids.length) {
    try {
      const body = JSON.stringify(ids);
      await cache.put(key, new Response(body, { headers: { 'Cache-Control': `max-age=${CHART_TTL}` } }));
    } catch {}
  }
  return ids;
}

const PLAYLIST_ID = /^pl\.[A-Za-z0-9._-]+$/;

// https://music.apple.com/<cc>/playlist/<slug>/<pl.id> -> { cc, slug, id } or null
export function parsePlaylistUrl(input) {
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'music.apple.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length !== 4 || !/^[a-z]{2}$/.test(parts[0]) || parts[1] !== 'playlist') return null;
  if (!/^[A-Za-z0-9%._-]{1,200}$/.test(parts[2]) || !PLAYLIST_ID.test(parts[3])) return null;
  return { cc: parts[0], slug: parts[2], id: parts[3] };
}

// The JSON-LD block of the page, found with indexOf (no full HTML parse: 10 ms CPU limit).
export function parsePlaylistHtml(html) {
  const at = html.indexOf('schema:music-playlist');
  if (at < 0) return null;
  const open = html.lastIndexOf('<script', at);
  const start = html.indexOf('>', at);
  const end = html.indexOf('</script>', start);
  if (open < 0 || start < 0 || end < 0) return null;
  let data;
  try {
    data = JSON.parse(html.slice(start + 1, end));
  } catch {
    return null;
  }
  const ids = [];
  for (const t of Array.isArray(data.track) ? data.track : []) {
    const m = typeof t?.url === 'string' ? t.url.match(/\/song\/(?:[^/]+\/)?(\d+)/) : null;
    if (m) ids.push(Number(m[1]));
  }
  return { label: typeof data.name === 'string' ? data.name.slice(0, 60) : 'Apple Music playlist', ids };
}

export async function fetchPlaylistPage(p, deps) {
  let res;
  try {
    res = await get(`https://music.apple.com/${p.cc}/playlist/${p.slug}/${p.id}`, deps, {
      headers: { Accept: 'text/html' },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'apple_unavailable');
  }
  if (res.status === 404) throw new ApiError(404, 'playlist_not_found');
  if (!res.ok) throw new ApiError(502, 'apple_unavailable');
  const parsed = parsePlaylistHtml(await res.text());
  if (!parsed || !parsed.ids.length) throw new ApiError(404, 'playlist_not_found');
  return parsed;
}
