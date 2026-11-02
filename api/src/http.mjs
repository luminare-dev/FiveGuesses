// Router, CORS and request validation. No cloudflare:workers import, so node --test can load it.
// deps = { fetch, now, random, rooms, cache?, getRandomValues? }
import { ApiError, budget } from './apple.mjs';
import { importPlaylist, publicSources, resolveEntries, sampleTracks } from './sources.mjs';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const LOCALHOST = /^http:\/\/localhost(:\d{1,5})?$/;
const SOURCE_ID = /^[a-z0-9-]{1,40}$/;
const IMPORT_MAX = 2 * 1024;
const RESOLVE_MAX = 16 * 1024;
const CODE_TRIES = 3;

export const allowedOrigin = (o) => o === 'https://fiveguesses.app' || LOCALHOST.test(o);

function respond(status, body, origin, headers = {}) {
  const h = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers,
  });
  if (body !== null) h.set('Content-Type', 'application/json; charset=utf-8');
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.append('Vary', 'Origin');
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: h });
}

const fail = (status, code, origin, headers) => respond(status, { error: code }, origin, headers);

// 6 characters, unbiased (bytes >= 248 are dropped).
export function newCode(getRandomValues = (a) => crypto.getRandomValues(a)) {
  let code = '';
  while (code.length < 6) {
    for (const b of getRandomValues(new Uint8Array(12))) {
      if (b < 248 && code.length < 6) code += CODE_ALPHABET[b % 31];
    }
  }
  return code;
}

async function readJson(request, max) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) throw new ApiError(400, 'bad_request');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > max) throw new ApiError(400, 'bad_request');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'bad_request');
  }
}

const str = (s, max) => typeof s === 'string' && s.trim().length >= 1 && s.length <= max;

function parseTracksQuery(params) {
  const source = params.get('source') || '';
  if (!SOURCE_ID.test(source)) return null;
  const nRaw = params.get('n');
  const n = nRaw == null ? 20 : Number(nRaw);
  if (!Number.isInteger(n) || n < 1 || n > 30) return null;
  const exRaw = params.get('exclude') || '';
  const exclude = exRaw ? exRaw.split(',') : [];
  if (exclude.length > 100 || !exclude.every((x) => /^\d{1,15}$/.test(x))) return null;
  return { source, n, exclude: exclude.map(Number) };
}

async function createRoom(deps) {
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = newCode(deps.getRandomValues);
    const stub = deps.rooms.get(deps.rooms.idFromName(code));
    const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code }) });
    if (res.status === 201) return code;
  }
  return null;
}

const ROUTES = {
  '/api/health': 'GET',
  '/api/sources': 'GET',
  '/api/tracks': 'GET',
  '/api/import': 'POST',
  '/api/resolve': 'POST',
  '/api/rooms': 'POST',
};

export async function handle(request, env, deps) {
  const url = new URL(request.url);
  const originHeader = request.headers.get('Origin');
  const origin = originHeader && allowedOrigin(originHeader) ? originHeader : null;
  if (originHeader && !origin) return fail(403, 'origin_forbidden', null);

  const ws = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  const method = ws ? 'GET' : ROUTES[url.pathname];
  if (!method) return fail(404, 'not_found', origin);

  if (request.method === 'OPTIONS') {
    return respond(204, null, origin, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
  }
  if (request.method !== method && !(method === 'GET' && request.method === 'HEAD')) {
    return fail(405, 'method_not_allowed', origin, { Allow: `${method}, OPTIONS` });
  }
  if ((method === 'POST' || ws) && !origin) return fail(403, 'origin_forbidden', null);

  const d = { ...deps, budget: budget() };
  try {
    if (ws) {
      const code = decodeURIComponent(ws[1]).toUpperCase();
      if (!CODE_RE.test(code)) return fail(400, 'bad_request', origin);
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return fail(426, 'upgrade_required', origin, { Upgrade: 'websocket' });
      }
      return deps.rooms.get(deps.rooms.idFromName(code)).fetch(request);
    }
    switch (url.pathname) {
      case '/api/health':
        return respond(200, { ok: true }, origin);
      case '/api/sources':
        return respond(200, { sources: publicSources() }, origin, { 'Cache-Control': 'public, max-age=3600' });
      case '/api/tracks': {
        const q = parseTracksQuery(url.searchParams);
        if (!q) return fail(400, 'bad_request', origin);
        return respond(200, await sampleTracks(q.source, q.n, q.exclude, d), origin);
      }
      case '/api/import': {
        const body = await readJson(request, IMPORT_MAX);
        if (!body || !str(body.url, 1000)) return fail(400, 'bad_request', origin);
        return respond(200, await importPlaylist(body.url.trim(), d, env), origin);
      }
      case '/api/resolve': {
        const body = await readJson(request, RESOLVE_MAX);
        const entries = body?.entries;
        if (
          !Array.isArray(entries) ||
          entries.length < 1 ||
          entries.length > 30 ||
          !entries.every((e) => e && str(e.artist, 200) && str(e.title, 200))
        ) {
          return fail(400, 'bad_request', origin);
        }
        const clean = entries.map((e) => ({ artist: e.artist.trim(), title: e.title.trim() }));
        return respond(200, await resolveEntries(clean, d), origin);
      }
      case '/api/rooms': {
        const code = await createRoom(deps);
        return code ? respond(201, { code }, origin) : fail(503, 'room_unavailable', origin);
      }
    }
  } catch (e) {
    if (e instanceof ApiError) {
      const code = e.code === 'budget' ? 'apple_unavailable' : e.code;
      return fail(e.status, code, origin);
    }
    return fail(500, 'internal', origin);
  }
  return fail(404, 'not_found', origin);
}
