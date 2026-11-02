// One room per Durable Object: WebSocket Hibernation API, state under the storage key 'room'.
// The rules live in rules.mjs; this file only does I/O. No setTimeout (hibernation).
import { DurableObject } from 'cloudflare:workers';
import { budget } from './apple.mjs';
import { beginGame, createRoom, disconnect, handle, nextAlarm, startFailed, tick, view } from './rules.mjs';
import { lookupTracks, sampleTracks, shuffle } from './sources.mjs';

const MAX_FRAME = 4096;
const RATE_WINDOW = 10_000;
const RATE_MAX = 30;

const attachment = (ws) => {
  try {
    return ws.deserializeAttachment() || { pid: null, w: 0, n: 0 };
  } catch {
    return { pid: null, w: 0, n: 0 };
  }
};

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}

function close(ws, code, reason = '') {
  try {
    ws.close(code, reason);
  } catch {}
}

function frameSize(message) {
  if (typeof message !== 'string') return message.byteLength;
  return message.length * 3 <= MAX_FRAME ? message.length : new TextEncoder().encode(message).length;
}

function playerId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => (x % 36).toString(36)).join('');
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get('room')) ?? null;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.room) return new Response(null, { status: 409 });
      const { code } = await request.json();
      await this.apply({ room: createRoom(code, Date.now()) }, null);
      return new Response(null, { status: 201 });
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response(null, { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: null, w: 0, n: 0 });
    if (!this.room) {
      send(server, { t: 'error', code: 'not_found' });
      close(server, 4404, 'not found');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (frameSize(message) > MAX_FRAME) return close(ws, 1009, 'too big');
    const att = attachment(ws);
    const now = Date.now();
    if (now - att.w >= RATE_WINDOW) {
      att.w = now;
      att.n = 0;
    }
    att.n += 1;
    ws.serializeAttachment(att);
    if (att.n > RATE_MAX) return send(ws, { t: 'error', code: 'slow_down' });
    let msg = null;
    if (typeof message === 'string') {
      try {
        msg = JSON.parse(message);
      } catch {}
    }
    if (!msg) return send(ws, { t: 'error', code: 'bad_request' });
    const res = handle(this.room, { pid: att.pid }, msg, now, () => this.newId());
    await this.apply(res, ws);
    if (res.start) await this.begin(res.start);
  }

  async webSocketClose(ws, code) {
    close(ws, code >= 3000 && code < 5000 ? code : 1000);
    await this.gone(ws);
  }

  async webSocketError(ws) {
    await this.gone(ws);
  }

  async alarm() {
    await this.apply(tick(this.room, Date.now()), null);
  }

  newId() {
    let id;
    do id = playerId();
    while (this.room?.players[id]);
    return id;
  }

  // The last open socket of a seat went away.
  async gone(ws) {
    const { pid } = attachment(ws);
    if (!pid || !this.room) return;
    const others = this.ctx
      .getWebSockets()
      .some((s) => s !== ws && s.readyState === WebSocket.OPEN && attachment(s).pid === pid);
    if (!others) await this.apply(disconnect(this.room, pid, Date.now()), null);
  }

  // Tracks for a pending start: a category/chart sample or a list of ids.
  async begin(start) {
    const deps = { fetch: (u, i) => fetch(u, i), random: Math.random, budget: budget() };
    try {
      deps.cache = caches.default;
    } catch {}
    let res;
    try {
      let label;
      let tracks;
      if (start.source.kind === 'category') {
        ({ label, tracks } = await sampleTracks(start.source.id, start.rounds + 5, [], deps));
      } else {
        label = start.source.label;
        tracks = shuffle(await lookupTracks(start.source.ids, deps));
      }
      res = beginGame(this.room, { label, tracks, rounds: start.rounds }, Date.now());
    } catch {
      res = startFailed(this.room, 'source_failed');
    }
    await this.apply(res, null);
  }

  async apply(res, ws) {
    const sockets = this.ctx.getWebSockets();
    if (res.wipe) {
      this.room = null;
      for (const s of sockets) close(s, 4000, 'room closed');
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    if (ws && res.seat) {
      const att = attachment(ws);
      att.pid = res.seat;
      ws.serializeAttachment(att);
    }
    for (const c of res.close || []) {
      for (const s of sockets) {
        if (attachment(s).pid !== c.id || (c.code === 4002 && s === ws)) continue;
        s.serializeAttachment({ ...attachment(s), pid: null });
        close(s, c.code, c.code === 4001 ? 'kicked' : c.code === 4002 ? 'replaced' : 'left');
      }
    }
    if (ws && res.reply) send(ws, res.reply);
    if (ws && res.closeSelf) {
      ws.serializeAttachment({ ...attachment(ws), pid: null });
      close(ws, res.closeSelf);
    }
    for (const m of res.send || []) {
      for (const s of sockets) if (attachment(s).pid === m.id) send(s, m.msg);
    }
    const before = this.room;
    this.room = res.room;
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(nextAlarm(this.room, Date.now()));
    if (before && !res.seat && !res.close && !res.start && same(before, this.room)) return;
    for (const s of this.ctx.getWebSockets()) {
      if (s.readyState !== WebSocket.OPEN) continue;
      send(s, { t: 'room', room: view(this.room, attachment(s).pid) });
    }
  }
}

// Equal apart from lastActivity: nothing to broadcast.
function same(a, b) {
  return JSON.stringify({ ...a, lastActivity: 0 }) === JSON.stringify({ ...b, lastActivity: 0 });
}
