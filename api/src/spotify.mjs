// Spotify playlist import from the public embed page (server side), without the Web API.
// Nothing from Spotify is cached or stored.
import { ApiError, MAX_ITEMS, get } from './apple.mjs';

const ID = /^[A-Za-z0-9]{22}$/;
const HOSTS = new Set(['open.spotify.com', 'play.spotify.com']);
// The embed page is served to browsers; a bot User-Agent gets refused.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// open.spotify.com/[intl-xx/][embed/]playlist/<id>[?si=...] or spotify:playlist:<id> -> id or null
export function parsePlaylistUrl(input) {
  const s = String(input).trim();
  if (s.startsWith('spotify:')) {
    const m = s.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
    return m && ID.test(m[1]) ? m[1] : null;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !HOSTS.has(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] && /^intl-[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0])) parts.shift();
  if (parts[0] === 'embed') parts.shift();
  if (parts.length !== 2 || parts[0] !== 'playlist' || !ID.test(parts[1])) return null;
  return parts[1];
}

// The __NEXT_DATA__ block of the embed page, found with indexOf (10 ms CPU limit).
// -> { label, entries: [{ artist, title }] } or null without the block.
export function parseEmbedHtml(html) {
  const at = html.indexOf('id="__NEXT_DATA__"');
  if (at < 0) return null;
  const start = html.indexOf('>', at);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) return null;
  let data;
  try {
    data = JSON.parse(html.slice(start + 1, end));
  } catch {
    return null;
  }
  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) return null;
  const entries = [];
  for (const t of entity.trackList) {
    const title = typeof t?.title === 'string' ? t.title.trim() : '';
    const artist = typeof t?.subtitle === 'string' ? t.subtitle.split(',')[0].trim() : '';
    if (!title || !artist) continue;
    entries.push({ artist: artist.slice(0, 200), title: title.slice(0, 200) });
    if (entries.length === MAX_ITEMS) break;
  }
  const name = typeof entity.name === 'string' ? entity.name.trim().slice(0, 60) : '';
  return { label: name || 'Spotify playlist', entries };
}

// 404 or an empty page is 'playlist_not_found'; a refused or failed fetch is 'spotify_blocked'.
export async function fetchSpotifyPlaylist(id, deps) {
  let res;
  try {
    res = await get(`https://open.spotify.com/embed/playlist/${id}`, deps, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html', 'Accept-Language': 'en' },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'spotify_blocked');
  }
  if (res.status === 404) throw new ApiError(404, 'playlist_not_found');
  if (!res.ok) throw new ApiError(502, 'spotify_blocked');
  let html;
  try {
    html = await res.text();
  } catch {
    throw new ApiError(502, 'spotify_blocked');
  }
  const parsed = parseEmbedHtml(html);
  if (!parsed || !parsed.entries.length) throw new ApiError(404, 'playlist_not_found');
  return parsed;
}
