// Smoke test of the live API (Node 22: global fetch and WebSocket, no dependencies).
// node api/scripts/smoke.mjs [--base https://api.fiveguesses.app] [--youtube <playlist url>] [--expire]
// The Worker never calls itunes.apple.com; this script plays the browser's part (the iTunes lookup
// of a category's ids) and sends the room the host's songs, as the app does.
import { randomBytes } from 'node:crypto';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg('--base', 'https://api.fiveguesses.app');
const ORIGIN = 'https://fiveguesses.app';
const APPLE_PLAYLIST = 'https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31';
// A public YouTube playlist (YouTube Music "Top 100 Songs Global").
const YOUTUBE_PLAYLIST = arg('--youtube', 'https://www.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i');

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failed += 1;
};

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...init.headers } });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

const AUDIO = 'https://audio-ssl.itunes.apple.com/';
const audio = (t) => typeof t.previewUrl === 'string' && t.previewUrl.startsWith(AUDIO);

// The browser's part: category entries -> tracks with previews, one iTunes lookup per country.
async function lookupTracks(entries) {
  const byCountry = new Map();
  for (const e of entries) byCountry.set(e.country, [...(byCountry.get(e.country) ?? []), e]);
  const tracks = [];
  for (const [country, list] of byCountry) {
    const q = new URLSearchParams({ id: list.map((e) => e.id).join(','), country });
    const res = await fetch(`https://itunes.apple.com/lookup?${q}`);
    if (!res.ok) throw new Error(`iTunes lookup ${res.status}`);
    const found = new Map(JSON.parse(await res.text()).results.map((r) => [r.trackId, r]));
    for (const e of list) {
      const r = found.get(e.id);
      if (!r || !audio(r)) continue;
      const art = /^https:\/\/[^/]+\.mzstatic\.com\//.test(r.artworkUrl100 ?? '') ? r.artworkUrl100.replace('100x100bb', '512x512bb') : '';
      const link = (r.trackViewUrl ?? '').startsWith('https://music.apple.com/') ? r.trackViewUrl : null;
      tracks.push({ id: e.id, artist: e.artist, title: e.title, year: null, matchedTrack: r.trackName, matchedArtist: r.artistName, previewUrl: r.previewUrl, artworkUrl: art, appleMusicUrl: link, country });
    }
  }
  return tracks;
}

// Stand-ins with well-formed links, for a runner that iTunes does not answer (the room never
// fetches them).
const standIns = (entries) =>
  entries.map((e) => ({ id: e.id, artist: e.artist, title: e.title, year: null, matchedTrack: e.title, matchedArtist: e.artist, previewUrl: `${AUDIO}itunes-assets/smoke/${e.id}.m4a`, artworkUrl: '', appleMusicUrl: null, country: e.country }));

// A socket with a message queue: next(pred) resolves with the first matching message.
function open(code) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/rooms/${code}/ws`, { headers: { Origin: ORIGIN } });
  const queue = [];
  const waiters = [];
  ws.closed = new Promise((resolve) => ws.addEventListener('close', (e) => resolve(e.code)));
  ws.addEventListener('message', (e) => {
    const msg = e.data === '{"t":"pong"}' ? { t: 'pong' } : JSON.parse(e.data);
    const w = waiters.findIndex((x) => x.pred(msg));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  ws.next = (pred, ms = 10000) => {
    const i = queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  };
  ws.put = (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  ws.ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  return ws;
}

const token = () => randomBytes(16).toString('base64url');
const isRoom = (pred = () => true) => (m) => m.t === 'room' && pred(m.room);
const isError = (code) => (m) => m.t === 'error' && m.code === code;

async function join(code, name) {
  const ws = open(code);
  await ws.ready;
  const t = token();
  ws.put({ t: 'hello', token: t });
  await ws.next((m) => m.t === 'need_name');
  ws.put({ t: 'hello', token: t, name });
  const m = await ws.next(isRoom((r) => r.you));
  ws.pid = m.room.you;
  return ws;
}

async function main() {
  const health = await api('/api/health');
  ok(health.status === 200 && health.body?.ok === true, 'GET /api/health');

  const sources = await api('/api/sources');
  const ids = sources.body?.sources?.map((x) => x.id) ?? [];
  ok(ids.length === 17 && !ids.some((id) => id.startsWith('chart-')), `GET /api/sources: ${ids.length} categories, no charts`);

  const pool = await api('/api/pool?source=80s');
  const entries = pool.body?.entries ?? [];
  const shape = (e) => Number.isSafeInteger(e.id) && e.artist && e.title && /^[A-Z]{2}$/.test(e.country) && !('previewUrl' in e);
  ok(pool.status === 200 && entries.length >= 60 && entries.every(shape), `GET /api/pool 80s: ${pool.status} ${entries.length} entries { id, artist, title, country }`);
  ok((await api('/api/pool?source=chart-at')).status === 404, 'GET /api/pool chart-at -> 404 (charts are read by the browser)');

  const gone = await Promise.all([api('/api/tracks?source=80s&n=3'), api('/api/resolve', { method: 'POST', body: '{}' })]);
  ok(gone.every((r) => r.status === 404), `old routes gone (no iTunes call from the Worker): /api/tracks ${gone[0].status}, /api/resolve ${gone[1].status}`);

  const apple = await api('/api/import', { method: 'POST', body: JSON.stringify({ url: APPLE_PLAYLIST }) });
  console.log(`info POST /api/import Apple Music: ${apple.status} ${apple.status === 200 ? `${apple.body.items.length} ids of ${apple.body.total}, ${apple.body.country}` : apple.body?.error}`);
  ok(
    (apple.status === 200 && apple.body.kind === 'ids' && apple.body.items.length >= 20 && apple.body.items.every((i) => Number.isSafeInteger(i.id)) && !('tracks' in apple.body)) ||
      (apple.status === 502 && apple.body?.error === 'apple_blocked'),
    'Apple Music import answers ids (no lookup) or 502 apple_blocked',
  );

  const yt = await api('/api/import', { method: 'POST', body: JSON.stringify({ url: YOUTUBE_PLAYLIST }) });
  console.log(`info POST /api/import YouTube: ${yt.status} ${yt.status === 200 ? `${yt.body.entries.length} entries of ${yt.body.total}` : yt.body?.error}`);
  ok((yt.status === 200 && yt.body.kind === 'entries') || (yt.status === 503 && yt.body?.error === 'youtube_unavailable'), 'YouTube import answers entries or 503 youtube_unavailable');

  // The host's songs, built here as the browser does.
  const picked = entries.slice(0, 25);
  let tracks;
  try {
    tracks = (await lookupTracks(picked)).slice(0, 20);
    console.log(`info iTunes lookup from this runner: ${tracks.length} of ${picked.length} with previews`);
  } catch (e) {
    console.log(`info iTunes lookup from this runner failed (${e.message}); stand-in links instead`);
    tracks = standIns(picked).slice(0, 20);
  }
  ok(tracks.length >= 2 && tracks.every(audio), `host pool: ${tracks.length} tracks`);

  const forbidden = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  ok(forbidden.status === 403, `POST /api/rooms from another origin: ${forbidden.status}`);

  const created = await api('/api/rooms', { method: 'POST' });
  ok(created.status === 201 && /^[A-Z2-9]{6}$/.test(created.body?.code ?? ''), `POST /api/rooms: ${created.status} ${created.body?.code}`);
  const code = created.body.code;

  const a = await join(code, 'Smoke A');
  const b = await join(code, 'Smoke B');
  ok(Boolean(a.pid && b.pid), 'two players joined');
  a.put('{"t":"ping"}');
  ok((await a.next((m) => m.t === 'pong')).t === 'pong', 'ping answered');

  const c = open(code);
  await c.ready;
  c.put({ t: 'hello', token: token(), name: 'smoke a' });
  ok(Boolean(await c.next(isError('name_taken'))), 'same name again -> name_taken');
  c.close();

  b.put({ t: 'start', rounds: 1, label: '1980s', tracks: tracks.slice(0, 1) }); // guests may only send 4 KiB frames
  ok(Boolean(await b.next(isError('not_host'))), 'start from a guest -> not_host');
  a.put({ t: 'start', rounds: 1, label: '1980s', tracks: [{ ...tracks[0], previewUrl: 'https://evil.example/a.m4a' }, ...tracks.slice(1)] });
  ok(Boolean(await a.next(isError('bad_request'))), 'a pool with a foreign preview link -> bad_request');
  a.put({ t: 'start', rounds: 1, label: '1980s', tracks: standIns(entries.slice(0, 51)) });
  ok(Boolean(await a.next(isError('bad_request'))), 'a pool of 51 songs -> bad_request');

  const start = JSON.stringify({ t: 'start', rounds: 1, label: '1980s', tracks });
  a.put(start);
  const playing = (r) => r.phase === 'playing' && r.game?.previewUrl;
  const [va, vb] = await Promise.all([a.next(isRoom(playing), 20000), b.next(isRoom(playing), 20000)]);
  ok(audio(va.room.game) && va.room.game.answer === null && vb.room.game.answer === null, `both playing after a ${start.length}-byte host start, preview set, answer hidden`);
  ok(tracks.some((t) => t.previewUrl === va.room.game.previewUrl), 'the round plays a song the host sent');

  a.put({ t: 'guess', round: 1, id: 1, artist: 'Nobody', title: 'Nothing at all' });
  const ga = await a.next(isRoom((r) => r.game?.me?.entries?.length === 1));
  ok(ga.room.game.me.entries[0].kind === 'wrong' && ga.room.game.me.stage === 1, 'a wrong guess doubles the snippet');

  for (let i = 0; i < 5; i++) b.put({ t: 'skip', round: 1 });
  const lost = await b.next(isRoom((r) => r.game?.me?.status === 'lost'));
  ok(lost.room.game.answer === null, 'B is out of guesses; the answer stays hidden while A still plays');

  a.put({ t: 'endRound' });
  const reveal = await b.next(isRoom((r) => r.game?.answer?.title));
  ok(Boolean(reveal.room.game.answer.title), `round ended, B sees the answer: ${reveal.room.game.answer.artist} - ${reveal.room.game.answer.title}`);

  a.put({ t: 'endGame' });
  const fin = await a.next(isRoom((r) => r.phase === 'finished'));
  ok(fin.room.standings?.length === 2, `finished with standings: ${JSON.stringify(fin.room.standings?.map((s) => [s.name, s.total, s.rank]))}`);

  a.put({ t: 'leave' });
  b.put({ t: 'leave' });
  ok((await a.closed) === 4003 && (await b.closed) === 4003, 'both left (4003)');

  const d = open(code);
  await d.ready;
  d.put({ t: 'hello', token: token() });
  const after = await d.next(() => true);
  console.log(`info a new socket right after: ${after.t}${after.code ? ` ${after.code}` : ''} (room is wiped 5 min after everyone left)`);
  d.close();

  if (process.argv.includes('--expire')) {
    await new Promise((r) => setTimeout(r, 5.5 * 60_000));
    const e = open(code);
    await e.ready;
    const [msg, closed] = await Promise.all([e.next(() => true), e.closed]);
    ok(msg.code === 'not_found' && closed === 4404, `after the empty TTL: ${msg.code} ${closed}`);
  }

  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`smoke failed: ${e.message}`);
  process.exit(1);
});
