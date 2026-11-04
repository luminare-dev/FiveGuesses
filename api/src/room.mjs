// One room per Durable Object: WebSocket Hibernation API, state under the storage key 'room'.
// The rules live in rules.mjs; this file only does I/O. No setTimeout (hibernation).
import { DurableObject } from 'cloudflare:workers';
import { MAX_SEATS, createRoom, disconnect, handle, nextAlarm, roomMessages, tick } from './rules.mjs';

const MAX_FRAME = 4096;
// The host's start message carries up to 50 songs.
const MAX_HOST_FRAME = 128 * 1024;
const RATE_WINDOW = 10_000;
const RATE_MAX = 30;
const OPEN = 1; // WebSocket readyState
const UNSEATED_MS = 5 * 60_000; // a socket without a seat is closed after this

const attachment = (ws) => {
  try {
    return ws.deserializeAttachment() || { pid: null, w: 0, n: 0, at: 0 };
  } catch {
    return { pid: null, w: 0, n: 0, at: 0 };
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

function frameSize(message, max) {
  if (typeof message !== 'string') return message.byteLength;
  if (message.length > max) return message.length;
  return message.length * 3 <= max ? message.length : new TextEncoder().encode(message).length;
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
    if (this.ctx.getWebSockets().length >= 2 * MAX_SEATS) return new Response(null, { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    server.serializeAttachment({ pid: null, w: 0, n: 0, at: now });
    if (!this.room) {
      send(server, { t: 'error', code: 'not_found' });
      close(server, 4404, 'not found');
    } else {
      const due = await this.ctx.storage.getAlarm();
      if (due == null || due > now + UNSEATED_MS) await this.ctx.storage.setAlarm(now + UNSEATED_MS);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const att = attachment(ws);
    const max = att.pid && att.pid === this.room?.hostId ? MAX_HOST_FRAME : MAX_FRAME;
    if (frameSize(message, max) > max) return close(ws, 1009, 'too big');
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
  }

  async webSocketClose(ws, code) {
    close(ws, code >= 3000 && code < 5000 ? code : 1000);
    await this.gone(ws);
  }

  async webSocketError(ws) {
    await this.gone(ws);
  }

  async alarm() {
    const now = Date.now();
    for (const s of this.ctx.getWebSockets()) {
      const a = attachment(s);
      if (!a.pid && now - a.at >= UNSEATED_MS) close(s, 4008, 'no seat');
    }
    await this.apply(tick(this.room, now), null);
  }

  // The room's next deadline, or the time the oldest socket without a seat runs out.
  nextAlarm(now) {
    let t = nextAlarm(this.room, now);
    for (const s of this.ctx.getWebSockets()) {
      const a = attachment(s);
      if (!a.pid && s.readyState === OPEN) t = Math.min(t, Math.max(a.at + UNSEATED_MS, now + 1));
    }
    return t;
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
      .some((s) => s !== ws && s.readyState === OPEN && attachment(s).pid === pid);
    if (!others) await this.apply(disconnect(this.room, pid, Date.now()), null);
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
    const before = this.room;
    this.room = res.room;
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(this.nextAlarm(Date.now()));
    if (before && !res.seat && !res.close && same(before, this.room)) return;
    const message = roomMessages(this.room);
    let watcher = null;
    for (const s of this.ctx.getWebSockets()) {
      if (s.readyState !== OPEN) continue;
      const { pid } = attachment(s);
      try {
        s.send(pid ? message(pid) : (watcher ??= message(null)));
      } catch {}
    }
  }
}

// Equal apart from lastActivity: nothing to broadcast.
function same(a, b) {
  return JSON.stringify({ ...a, lastActivity: 0 }) === JSON.stringify({ ...b, lastActivity: 0 });
}
