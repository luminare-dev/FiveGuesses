// Public Apple Music playlist pages (server side). The Worker never calls itunes.apple.com:
// Apple refuses Workers there, so the browser asks iTunes itself.

const UA = 'FiveGuesses/1.0 (+https://fiveguesses.app)';
const TIMEOUT_MS = 8000;
export const SUBREQUEST_LIMIT = 45;
// A playlist page lists at most this many songs to the client.
export const MAX_ITEMS = 300;

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
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
// -> { label, items: [{ id, title }] } or null without the block.
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
  const items = [];
  const seen = new Set();
  for (const t of Array.isArray(data.track) ? data.track : []) {
    const m = typeof t?.url === 'string' ? t.url.match(/\/song\/(?:[^/]+\/)?(\d{1,15})(?:[/?#]|$)/) : null;
    const id = m ? Number(m[1]) : 0;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title: typeof t.name === 'string' ? t.name.slice(0, 200) : '' });
    if (items.length === MAX_ITEMS) break;
  }
  return { label: typeof data.name === 'string' ? data.name.slice(0, 60) : 'Apple Music playlist', items };
}

// A refused or failed page fetch is 'apple_blocked': the client asks for the song list instead.
export async function fetchPlaylistPage(p, deps) {
  let res;
  try {
    res = await get(`https://music.apple.com/${p.cc}/playlist/${p.slug}/${p.id}`, deps, {
      headers: { Accept: 'text/html' },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'apple_blocked');
  }
  if (res.status === 404) throw new ApiError(404, 'playlist_not_found');
  if (!res.ok) throw new ApiError(502, 'apple_blocked');
  const parsed = parsePlaylistHtml(await res.text());
  if (!parsed) throw new ApiError(502, 'apple_blocked');
  if (!parsed.items.length) throw new ApiError(404, 'playlist_not_found');
  return parsed;
}
