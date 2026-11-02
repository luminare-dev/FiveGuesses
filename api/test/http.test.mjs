import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_RE, handle, newCode } from '../src/http.mjs';

const BASE = 'https://api.fiveguesses.app';
const OK = 'https://fiveguesses.app';

function rooms(statuses = []) {
  const calls = [];
  return {
    calls,
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (req, init) => {
        calls.push({ id, req, init });
        if (req instanceof Request) return new Response('upgraded', { status: 200 });
        return new Response(null, { status: statuses.shift() ?? 201 });
      },
    }),
  };
}

const deps = (extra = {}) => ({
  fetch: async () => {
    throw new Error('no network in tests');
  },
  now: () => 0,
  random: () => 0.5,
  rooms: rooms(),
  ...extra,
});

const call = (path, { method = 'GET', origin, body, headers = {} } = {}, d = deps()) => {
  const h = new Headers(headers);
  if (origin) h.set('Origin', origin);
  return handle(new Request(BASE + path, { method, headers: h, body }), {}, d);
};

test('health without Origin has no CORS headers', async () => {
  const res = await call('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('allowed origins get CORS headers', async () => {
  for (const o of [OK, 'http://localhost', 'http://localhost:8081']) {
    const res = await call('/api/sources', { origin: o });
    assert.equal(res.headers.get('access-control-allow-origin'), o);
    assert.equal(res.headers.get('vary'), 'Origin');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal((await res.json()).sources.length, 21);
  }
});

test('forbidden origins get 403 on every route', async () => {
  for (const o of ['https://evil.example', 'http://localhost.evil.example', 'https://fiveguesses.app.evil']) {
    for (const [path, method] of [['/api/health', 'GET'], ['/api/rooms', 'POST'], ['/nope', 'GET'], ['/api/sources', 'OPTIONS']]) {
      const res = await call(path, { method, origin: o });
      assert.equal(res.status, 403, `${o} ${method} ${path}`);
      assert.deepEqual(await res.json(), { error: 'origin_forbidden' });
    }
  }
});

test('POST and WebSocket need an Origin', async () => {
  assert.equal((await call('/api/rooms', { method: 'POST' })).status, 403);
  assert.equal((await call('/api/rooms/ABC234/ws', { headers: { Upgrade: 'websocket' } })).status, 403);
});

test('OPTIONS preflight', async () => {
  const res = await call('/api/import', { method: 'OPTIONS', origin: OK });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(res.headers.get('access-control-max-age'), '86400');
});

test('unknown routes 404, wrong methods 405', async () => {
  assert.equal((await call('/')).status, 404);
  assert.deepEqual(await (await call('/api/nope')).json(), { error: 'not_found' });
  const res = await call('/api/health', { method: 'POST', origin: OK });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, OPTIONS');
  assert.equal((await call('/api/rooms')).status, 405);
});

test('tracks query validation', async () => {
  for (const q of ['', '?source=../x', '?source=80s&n=0', '?source=80s&n=31', '?source=80s&n=2.5', '?source=80s&exclude=1,a']) {
    assert.equal((await call(`/api/tracks${q}`)).status, 400, q);
  }
  const many = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
  assert.equal((await call(`/api/tracks?source=80s&exclude=${many}`)).status, 400);
  const res = await call('/api/tracks?source=nope');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'source_unknown' });
});

test('tracks upstream failure -> 502 apple_unavailable', async () => {
  const res = await call('/api/tracks?source=80s&n=3');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'apple_unavailable' });
});

test('body limits and shapes', async () => {
  const post = (path, body) => call(path, { method: 'POST', origin: OK, body, headers: { 'Content-Type': 'application/json' } });
  assert.equal((await post('/api/import', JSON.stringify({ url: 'x'.repeat(2100) }))).status, 400);
  assert.equal((await post('/api/import', '{')).status, 400);
  const unsupported = await post('/api/import', JSON.stringify({ url: 'https://example.com/list' }));
  assert.equal(unsupported.status, 400);
  assert.deepEqual(await unsupported.json(), { error: 'playlist_unsupported' });
  const entry = { artist: 'a-ha', title: 'Take On Me' };
  assert.equal((await post('/api/resolve', JSON.stringify({ entries: [] }))).status, 400);
  assert.equal((await post('/api/resolve', JSON.stringify({ entries: Array(31).fill(entry) }))).status, 400);
  assert.equal((await post('/api/resolve', JSON.stringify({ entries: [{ artist: '', title: 'x' }] }))).status, 400);
  assert.equal((await post('/api/resolve', JSON.stringify({ entries: [{ artist: 'a'.repeat(201), title: 'x' }] }))).status, 400);
  const big = JSON.stringify({ entries: [entry], pad: 'x'.repeat(17 * 1024) });
  assert.equal((await post('/api/resolve', big)).status, 400);
});

test('room codes', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), CODE_RE);
  assert.equal(newCode((a) => a.fill(0)), 'AAAAAA');
  assert.equal(newCode((a) => a.fill(30)), '999999');
});

test('POST /api/rooms retries on 409 and gives up after 3', async () => {
  let d = deps({ rooms: rooms([409, 201]) });
  let res = await call('/api/rooms', { method: 'POST', origin: OK }, d);
  assert.equal(res.status, 201);
  assert.match((await res.json()).code, CODE_RE);
  assert.equal(d.rooms.calls.length, 2);
  assert.equal(d.rooms.calls[0].req, 'https://room/init');
  assert.equal(JSON.parse(d.rooms.calls[1].init.body).code, d.rooms.calls[1].id);
  d = deps({ rooms: rooms([409, 409, 409, 201]) });
  res = await call('/api/rooms', { method: 'POST', origin: OK }, d);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'room_unavailable' });
});

test('WebSocket upgrade is forwarded to the room of the code', async () => {
  const d = deps();
  assert.equal((await call('/api/rooms/abc234/ws', { origin: OK, headers: { Upgrade: 'websocket' } }, d)).status, 200);
  assert.equal(d.rooms.calls[0].id, 'ABC234');
  assert.equal((await call('/api/rooms/ABC23I/ws', { origin: OK, headers: { Upgrade: 'websocket' } }, d)).status, 400);
  assert.equal((await call('/api/rooms/ABC2345/ws', { origin: OK, headers: { Upgrade: 'websocket' } }, d)).status, 400);
  assert.equal((await call('/api/rooms/ABC234/ws', { origin: OK }, d)).status, 426);
});
