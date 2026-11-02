// YouTube playlist import: link parsing, YouTube Data API calls (server side) and title cleanup.
// Nothing from YouTube is cached or stored.
import { ApiError, get } from './apple.mjs';

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const LIST = /^[A-Za-z0-9_-]{10,64}$/;
const API = 'https://www.googleapis.com/youtube/v3';
const PAGES = 4;

export function parsePlaylistUrl(input) {
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !HOSTS.has(u.hostname)) return null;
  const list = u.searchParams.get('list');
  return list && LIST.test(list) ? list : null;
}

const NOISE = /\s*[([][^)\]]*\b(official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|clip|offiziell\w*)\b[^)\]]*[)\]]/gi;
const DASH = [' - ', ' – ', ' — '];

// "Artist - Title (Official Video)" -> { artist, title }; null for deleted or private videos.
export function parseVideoTitle(title, channel = '') {
  if (typeof title !== 'string') return null;
  const raw = title.trim();
  if (raw === 'Deleted video' || raw === 'Private video') return null;
  let t = raw.replace(NOISE, '');
  const bar = t.indexOf(' | ');
  if (bar >= 0) t = t.slice(0, bar);
  t = t.replace(/\s+/g, ' ').trim();
  let at = -1;
  let len = 0;
  for (const d of DASH) {
    const i = t.indexOf(d);
    if (i >= 0 && (at < 0 || i < at)) {
      at = i;
      len = d.length;
    }
  }
  let artist;
  let song;
  if (at >= 0) {
    artist = t.slice(0, at).trim();
    song = t.slice(at + len).trim();
  } else {
    artist = String(channel || '')
      .replace(/ - Topic$/, '')
      .replace(/VEVO$/i, '')
      .replace(/ Official$/i, '')
      .trim();
    song = t;
  }
  if (!artist || !song) return null;
  return { artist: artist.slice(0, 200), title: song.slice(0, 200) };
}

// The key goes in a header, never in a URL that could end up in a log.
async function ytJson(url, key, deps) {
  let res;
  try {
    res = await get(url, deps, { headers: { Referer: 'https://fiveguesses.app/', 'X-Goog-Api-Key': key } });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'budget') throw e;
    throw new ApiError(503, 'youtube_unavailable');
  }
  if (res.status === 404) throw new ApiError(404, 'playlist_not_found');
  let data = null;
  try {
    data = JSON.parse(await res.text());
  } catch {}
  if (!res.ok) {
    const reasons = (data?.error?.errors || []).map((e) => e.reason);
    if (reasons.includes('playlistNotFound') || reasons.includes('notFound')) {
      throw new ApiError(404, 'playlist_not_found');
    }
    throw new ApiError(503, 'youtube_unavailable');
  }
  if (!data) throw new ApiError(503, 'youtube_unavailable');
  return data;
}

// -> { label, entries: [{ artist, title }] }, at most 4 pages of 50 items.
export async function fetchPlaylist(list, key, deps) {
  if (!key) throw new ApiError(503, 'youtube_unavailable');
  const meta = await ytJson(
    `${API}/playlists?${new URLSearchParams({ part: 'snippet', id: list, fields: 'items(snippet/title)' })}`,
    key,
    deps,
  );
  const label = meta.items?.[0]?.snippet?.title;
  if (typeof label !== 'string') throw new ApiError(404, 'playlist_not_found');
  const entries = [];
  let pageToken = '';
  for (let page = 0; page < PAGES; page++) {
    const q = new URLSearchParams({
      part: 'snippet',
      maxResults: '50',
      playlistId: list,
      fields: 'nextPageToken,items(snippet(title,videoOwnerChannelTitle))',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const data = await ytJson(`${API}/playlistItems?${q}`, key, deps);
    for (const it of data.items || []) {
      const e = parseVideoTitle(it?.snippet?.title, it?.snippet?.videoOwnerChannelTitle);
      if (e) entries.push(e);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { label: label.slice(0, 60) || 'YouTube playlist', entries };
}
