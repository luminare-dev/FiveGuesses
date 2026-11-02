// Smoke test of the live API (Node 22: global fetch and WebSocket, no dependencies).
// node api/scripts/smoke.mjs [--base https://api.fiveguesses.app] [--youtube <playlist url>] [--expire]
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

const audio = (t) => typeof t.previewUrl === 'string' && t.previewUrl.startsWith('https://audio-ssl.itunes.apple.com/');

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
  ok(sources.body?.sources?.length === 21, `GET /api/sources: ${sources.body?.sources?.length} sources`);

  for (const source of ['80s', 'chart-at']) {
    const r = await api(`/api/tracks?source=${source}&n=3`);
    ok(r.status === 200 && r.body.tracks.length === 3 && r.body.tracks.every(audio), `GET /api/tracks ${source}: ${r.status} ${r.body?.tracks?.length ?? r.body?.error}`);
  }

  const apple = await api('/api/import', { method: 'POST', body: JSON.stringify({ url: APPLE_PLAYLIST }) });
  ok(apple.status === 200 && apple.body.tracks.length >= 20, `POST /api/import Apple Music: ${apple.status} ${apple.body?.tracks?.length ?? apple.body?.error} of ${apple.body?.total}`);

  const yt = await api('/api/import', { method: 'POST', body: JSON.stringify({ url: YOUTUBE_PLAYLIST }) });
  console.log(`info POST /api/import YouTube: ${yt.status} ${yt.status === 200 ? `${yt.body.tracks.length} tracks of ${yt.body.total}, ${yt.body.unresolved} unresolved` : yt.body?.error}`);
  ok(yt.status === 200 || (yt.status === 503 && yt.body?.error === 'youtube_unavailable'), 'YouTube import answers 200 or 503 youtube_unavailable');

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

  a.put({ t: 'start', rounds: 1, source: { kind: 'category', id: '80s' } });
  const playing = (r) => r.phase === 'playing' && r.game?.previewUrl;
  const [va, vb] = await Promise.all([a.next(isRoom(playing), 20000), b.next(isRoom(playing), 20000)]);
  ok(audio(va.room.game) && va.room.game.answer === null && vb.room.game.answer === null, 'both playing, preview set, answer hidden');

  a.put({ t: 'guess', round: 1, id: 1, artist: 'Nobody', title: 'Nothing at all' });
  const ga = await a.next(isRoom((r) => r.game?.me?.entries?.length === 1));
  ok(ga.room.game.me.entries[0].kind === 'wrong' && ga.room.game.me.stage === 1, 'a wrong guess doubles the snippet');

  for (let i = 0; i < 5; i++) b.put({ t: 'skip', round: 1 });
  const lost = await b.next(isRoom((r) => r.game?.me?.status === 'lost'));
  ok(Boolean(lost.room.game.answer?.title), `B lost and sees the answer: ${lost.room.game.answer?.artist} - ${lost.room.game.answer?.title}`);

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
