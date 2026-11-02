// Room state machine, scoring and the per-player view. Pure: every function takes the room and
// returns { room, reply?, close?, seat?, closeSelf?, send?, start?, wipe? }; the glue does the I/O.
import { classify } from './match.mjs';

export const SNIPPET_SECONDS = [1, 2, 4, 8, 16];
export const MAX_GUESSES = 5;
export const BASE_POINTS = { 1: 100, 2: 80, 4: 60, 8: 40, 16: 20 };
export const PLACE_BONUS = [30, 20, 10];
export const MAX_ROUNDS = 20;

export const DISCONNECT_GRACE = 30_000;
export const SEAT_TTL = 5 * 60_000;
export const REVEAL_MS = 10_000;
export const IDLE_TTL = 15 * 60_000;
export const EMPTY_TTL = 5 * 60_000;
export const FINISHED_TTL = 10 * 60_000;
export const START_TIMEOUT = 30_000;
// Anyone may skip a host who has not moved for this long in a round.
export const HOST_IDLE = 60_000;
// One storage value holds the room (2 MB at most), so seats need a cap.
export const MAX_SEATS = 200;
const KICKED_CAP = 200;

const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const HOST_ONLY = new Set(['start', 'kick', 'skipPlayer', 'endRound', 'endGame', 'next']);
const KNOWN = new Set(['hello', 'guess', 'skip', 'sitOut', 'leave', ...HOST_ONLY]);

export function roundPoints(seconds, place) {
  return (BASE_POINTS[seconds] ?? 0) + (PLACE_BONUS[place - 1] ?? 0);
}

export function createRoom(code, now) {
  return {
    v: 1,
    code,
    createdAt: now,
    lastActivity: now,
    phase: 'lobby',
    seq: 0,
    hostId: null,
    kicked: [],
    emptySince: now,
    finishedAt: null,
    pendingStart: null,
    players: {},
    game: null,
  };
}

const err = (code) => ({ t: 'error', code });
const clone = (room) => structuredClone(room);
const seats = (room) => Object.values(room.players).sort((a, b) => a.joined - b.joined);
const missesOf = (b) => (b ? b.entries.filter((e) => e.kind !== 'correct').length : 0);
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const isStr = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max;
const away = (p, now) => !p.connected && p.awaySince != null && now - p.awaySince >= DISCONNECT_GRACE;
const active = (room) => seats(room).some((p) => p.connected && !p.sittingOut);

// NFC, no control characters, trimmed, single spaces, 1..20 code points, no Latin mixed with
// Cyrillic or Greek (look-alikes).
export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const s = name
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\p{Script=Latin}/u.test(s) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(s)) return null;
  const n = [...s].length;
  return n >= 1 && n <= 20 ? s : null;
}

const LOOKALIKE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ο: 'o', α: 'a' };

// Compatibility folding (fullwidth, math letters), no accents, Cyrillic/Greek look-alikes as Latin.
export function nameKey(name) {
  const k = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/['‘’ʼ`´.]/g, '')
    .replace(/[аеорсухіοα]/g, (c) => LOOKALIKE[c])
    .replace(/[^\p{L}\p{N}]/gu, '');
  return k || name.toLowerCase();
}

// Host = earliest-joined seat; moves to the earliest connected seat when the host is gone or away.
function ensureHost(r, now) {
  const list = seats(r);
  if (!list.length) {
    r.hostId = null;
    return;
  }
  const host = r.players[r.hostId];
  const firstConnected = list.find((p) => p.connected);
  if (!host) r.hostId = (firstConnected ?? list[0]).id;
  else if (away(host, now) && firstConnected) r.hostId = firstConnected.id;
}

function startRound(r, now) {
  const g = r.game;
  g.round += 1;
  g.solved = 0;
  g.revealUntil = null;
  g.board = {};
  for (const p of seats(r)) {
    g.board[p.id] = { status: p.sittingOut ? 'out' : 'playing', entries: [], seconds: null, place: null, points: 0, lastAt: now };
  }
  r.phase = 'playing';
}

function endRound(r, now, last = false) {
  const g = r.game;
  for (const p of seats(r)) {
    const b = g.board[p.id];
    if (!b) continue;
    if (b.status === 'playing') b.status = 'lost';
    p.total += b.points;
    if (b.status === 'won') {
      p.correct += 1;
      p.secondsSum += b.seconds;
    }
  }
  if (last || g.round >= g.rounds) {
    r.phase = 'finished';
    r.finishedAt = now;
    g.revealUntil = null;
  } else {
    r.phase = 'reveal';
    g.revealUntil = now + REVEAL_MS;
  }
}

// The round waits for every seat still playing that is connected or away for less than 30 s.
function checkRoundEnd(r, now) {
  if (r.phase !== 'playing') return;
  const waiting = seats(r).some((p) => r.game.board[p.id]?.status === 'playing' && !away(p, now));
  if (!waiting) endRound(r, now);
}

function settle(res, now) {
  const r = res.room;
  if (!r) return res;
  const anyConnected = seats(r).some((p) => p.connected);
  if (anyConnected) r.emptySince = null;
  else if (r.emptySince == null) r.emptySince = now;
  ensureHost(r, now);
  checkRoundEnd(r, now);
  // A reveal that stopped because nobody was playing goes on once someone is back.
  if (r.phase === 'reveal' && r.game.revealUntil == null && active(r)) r.game.revealUntil = now + REVEAL_MS;
  return res;
}

function removeSeat(r, id) {
  delete r.players[id];
}

function hello(r, sock, msg, now, newId) {
  if (sock.pid && r.players[sock.pid]) return { room: r };
  if (!TOKEN.test(msg.token ?? '')) return { room: r, reply: err('bad_request') };
  if (r.kicked.some((k) => k.token === msg.token)) return { room: r, reply: err('kicked'), closeSelf: 4001 };
  const seat = Object.values(r.players).find((p) => p.token === msg.token);
  if (seat) {
    const close = seat.connected ? [{ id: seat.id, code: 4002 }] : [];
    seat.connected = true;
    seat.awaySince = null;
    return { room: r, close, seat: seat.id };
  }
  if (msg.name == null) return { room: r, reply: { t: 'need_name' } };
  const name = cleanName(msg.name);
  if (!name) return { room: r, reply: err('name_invalid') };
  const key = nameKey(name);
  if (Object.values(r.players).some((p) => p.key === key) || r.kicked.some((k) => k.key === key)) {
    return { room: r, reply: err('name_taken') };
  }
  if (Object.keys(r.players).length >= MAX_SEATS) return { room: r, reply: err('room_full') };
  const id = newId();
  r.seq += 1;
  r.players[id] = {
    id,
    name,
    key,
    token: msg.token,
    joined: r.seq,
    connected: true,
    awaySince: null,
    sittingOut: false,
    total: 0,
    correct: 0,
    secondsSum: 0,
  };
  if (r.game && (r.phase === 'playing' || r.phase === 'reveal')) {
    r.game.board[id] = { status: 'waiting', entries: [], seconds: null, place: null, points: 0, lastAt: now };
  }
  return { room: r, seat: id };
}

function validSource(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.kind === 'category') return isStr(s.id, 1, 40);
  if (s.kind !== 'ids' || !isStr(s.label, 1, 60) || !Array.isArray(s.ids)) return false;
  if (s.ids.length < 1 || s.ids.length > 30) return false;
  return s.ids.every((x) => x && isInt(x.id, 1, Number.MAX_SAFE_INTEGER) && /^[A-Z]{2}$/.test(x.country ?? ''));
}

function start(r, msg, now) {
  if (r.phase !== 'lobby' && r.phase !== 'finished') return { room: r };
  if (!isInt(msg.rounds, 1, MAX_ROUNDS) || !validSource(msg.source)) return { room: r, reply: err('bad_request') };
  if (!active(r)) return { room: r, reply: err('bad_request') };
  const source =
    msg.source.kind === 'category'
      ? { kind: 'category', id: msg.source.id }
      : { kind: 'ids', label: msg.source.label, ids: msg.source.ids.map((x) => ({ id: x.id, country: x.country })) };
  r.pendingStart = { from: r.phase, at: now };
  r.phase = 'starting';
  return { room: r, start: { rounds: msg.rounds, source } };
}

function answerText(guess) {
  const text = guess.artist ? `${guess.artist} – ${guess.title}` : guess.title;
  return text.slice(0, 200);
}

function play(r, pid, msg, now) {
  const g = r.game;
  if (r.phase !== 'playing' || msg.round !== g.round) return { room: r };
  const b = g.board[pid];
  if (!b || b.status !== 'playing') return { room: r };
  b.lastAt = now;
  const answer = g.tracks[g.round - 1];
  if (msg.t === 'skip') {
    b.entries.push({ kind: 'skip' });
  } else {
    const guess = { id: msg.id, artist: msg.artist, title: msg.title };
    const kind = classify(guess, answer);
    if (kind === 'correct') {
      const misses = missesOf(b);
      b.entries.push({ kind, text: `${answer.artist} – ${answer.title}`.slice(0, 200) });
      b.status = 'won';
      b.seconds = SNIPPET_SECONDS[misses];
      g.solved += 1;
      b.place = g.solved;
      b.points = roundPoints(b.seconds, b.place);
      return { room: r };
    }
    b.entries.push({ kind, text: answerText(guess) });
  }
  if (missesOf(b) >= MAX_GUESSES) b.status = 'lost';
  return { room: r };
}

function validGuess(msg) {
  return (
    isInt(msg.round, 1, MAX_ROUNDS) &&
    isInt(msg.id, 0, Number.MAX_SAFE_INTEGER) &&
    isStr(msg.artist, 0, 200) &&
    isStr(msg.title, 1, 200)
  );
}

function hostAction(r, msg, now) {
  const target = typeof msg.player === 'string' ? r.players[msg.player] : null;
  switch (msg.t) {
    case 'kick':
      if (!target || target.id === r.hostId) return { room: r };
      removeSeat(r, target.id);
      r.kicked.push({ token: target.token, key: target.key });
      if (r.kicked.length > KICKED_CAP) r.kicked.splice(0, r.kicked.length - KICKED_CAP);
      return { room: r, close: [{ id: target.id, code: 4001 }] };
    case 'skipPlayer': {
      const b = target && r.phase === 'playing' ? r.game.board[target.id] : null;
      if (b && b.status === 'playing') b.status = 'skipped';
      return { room: r };
    }
    case 'endRound':
      if (r.phase === 'playing') endRound(r, now);
      return { room: r };
    case 'endGame':
      if (r.phase === 'playing') endRound(r, now, true);
      else if (r.phase === 'reveal') {
        r.phase = 'finished';
        r.finishedAt = now;
        r.game.revealUntil = null;
      }
      return { room: r };
    case 'next':
      if (r.phase !== 'reveal') return { room: r };
      if (!active(r)) return { room: r, reply: err('bad_request') };
      startRound(r, now);
      return { room: r };
    default:
      return start(r, msg, now);
  }
}

// skipPlayer on the host from anyone else: allowed once the host has not moved for HOST_IDLE.
function idleHost(r, msg, now) {
  if (msg.t !== 'skipPlayer' || msg.player !== r.hostId || r.phase !== 'playing') return false;
  const b = r.game.board[r.hostId];
  return Boolean(b && b.status === 'playing' && now - (b.lastAt ?? 0) >= HOST_IDLE);
}

// One client message. sock = { pid } (null before a seated hello). newId() makes a player id.
export function handle(room, sock, msg, now, newId) {
  if (!room) return { room, reply: err('not_found'), closeSelf: 4404 };
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return { room, reply: err('bad_request') };
  const r = clone(room);
  r.lastActivity = now;
  if (msg.t === 'hello') return settle(hello(r, sock, msg, now, newId), now);
  const pid = sock.pid && r.players[sock.pid] ? sock.pid : null;
  if (!pid) return { room: r, reply: err('hello_first') };
  if (!KNOWN.has(msg.t)) return { room: r, reply: err('bad_request') };
  if (HOST_ONLY.has(msg.t) && pid !== r.hostId && !idleHost(r, msg, now)) return { room: r, reply: err('not_host') };
  switch (msg.t) {
    case 'guess':
      if (!validGuess(msg)) return { room: r, reply: err('bad_request') };
      return settle(play(r, pid, msg, now), now);
    case 'skip':
      if (!isInt(msg.round, 1, MAX_ROUNDS)) return { room: r, reply: err('bad_request') };
      return settle(play(r, pid, msg, now), now);
    case 'sitOut': {
      if (typeof msg.on !== 'boolean') return { room: r, reply: err('bad_request') };
      const p = r.players[pid];
      p.sittingOut = msg.on;
      const b = r.phase === 'playing' ? r.game.board[pid] : null;
      if (msg.on && b && b.status === 'playing') b.status = 'out';
      return settle({ room: r }, now);
    }
    case 'leave':
      removeSeat(r, pid);
      return settle({ room: r, close: [{ id: pid, code: 4003 }] }, now);
    default:
      return settle(hostAction(r, msg, now), now);
  }
}

// The last socket of a seat closed.
export function disconnect(room, pid, now) {
  if (!room || !room.players[pid]) return { room };
  const r = clone(room);
  const p = r.players[pid];
  p.connected = false;
  p.awaySince = now;
  return settle({ room: r }, now);
}

// Tracks arrived for a pending start. label: shown in the game; rounds: as asked.
export function beginGame(room, { label, tracks, rounds }, now) {
  if (!room || room.phase !== 'starting') return { room };
  if (!tracks.length) return startFailed(room, 'source_empty');
  const r = clone(room);
  if (r.pendingStart?.from === 'finished') {
    for (const p of Object.values(r.players)) {
      p.total = 0;
      p.correct = 0;
      p.secondsSum = 0;
    }
  }
  const n = Math.min(rounds, tracks.length);
  r.game = { rounds: n, label, tracks: tracks.slice(0, n), round: 0, revealUntil: null, solved: 0, board: {} };
  r.finishedAt = null;
  r.pendingStart = null;
  startRound(r, now);
  return settle({ room: r }, now);
}

export function startFailed(room, code) {
  if (!room || room.phase !== 'starting') return { room };
  const r = clone(room);
  r.phase = r.pendingStart?.from ?? 'lobby';
  r.pendingStart = null;
  return { room: r, send: r.hostId ? [{ id: r.hostId, msg: err(code) }] : [] };
}

// Applies everything that is due: wipe, seat removal, host transfer, round end, next round.
export function tick(room, now) {
  if (!room) return { room };
  if (
    now >= room.lastActivity + IDLE_TTL ||
    (room.emptySince != null && now >= room.emptySince + EMPTY_TTL) ||
    (room.finishedAt != null && now >= room.finishedAt + FINISHED_TTL)
  ) {
    return { room: null, wipe: true };
  }
  const r = clone(room);
  for (const p of seats(r)) {
    if (!p.connected && p.awaySince != null && now - p.awaySince >= SEAT_TTL) removeSeat(r, p.id);
  }
  let send;
  if (r.phase === 'starting' && now - (r.pendingStart?.at ?? 0) >= START_TIMEOUT) {
    const failed = startFailed(r, 'source_failed');
    Object.assign(r, failed.room);
    send = failed.send;
  }
  settle({ room: r }, now);
  if (r.phase === 'reveal' && r.game.revealUntil != null && now >= r.game.revealUntil) {
    if (active(r)) startRound(r, now);
    else r.game.revealUntil = null;
    settle({ room: r }, now);
  }
  return send ? { room: r, send } : { room: r };
}

export function nextAlarm(room, now) {
  if (!room) return null;
  const t = [room.lastActivity + IDLE_TTL];
  if (room.emptySince != null) t.push(room.emptySince + EMPTY_TTL);
  if (room.finishedAt != null) t.push(room.finishedAt + FINISHED_TTL);
  if (room.phase === 'reveal' && room.game?.revealUntil != null) t.push(room.game.revealUntil);
  if (room.phase === 'starting' && room.pendingStart) t.push(room.pendingStart.at + START_TIMEOUT);
  for (const p of Object.values(room.players)) {
    if (p.connected || p.awaySince == null) continue;
    if (p.awaySince + DISCONNECT_GRACE > now) t.push(p.awaySince + DISCONNECT_GRACE);
    t.push(p.awaySince + SEAT_TTL);
  }
  return Math.max(Math.min(...t), now + 1);
}

// total desc, rounds won desc, seconds over won rounds asc, join order; equal scores share a rank.
export function standings(room) {
  const list = seats(room).sort(
    (a, b) => b.total - a.total || b.correct - a.correct || a.secondsSum - b.secondsSum || a.joined - b.joined,
  );
  let rank = 0;
  return list.map((p, i) => {
    const prev = list[i - 1];
    if (!prev || prev.total !== p.total || prev.correct !== p.correct || prev.secondsSum !== p.secondsSum) {
      rank = i + 1;
    }
    return { id: p.id, name: p.name, total: p.total, correct: p.correct, rank };
  });
}

// The parts of the view that are the same for every socket.
function shared(room) {
  const g = room.game;
  const live = Boolean(g) && room.phase !== 'lobby' && room.phase !== 'starting';
  const over = room.phase === 'reveal' || room.phase === 'finished';
  const players = seats(room).map((p) => {
    const b = live ? g.board[p.id] : null;
    return {
      id: p.id,
      name: p.name,
      host: p.id === room.hostId,
      connected: p.connected,
      sittingOut: p.sittingOut,
      total: p.total,
      status: b ? b.status : null,
      misses: missesOf(b),
    };
  });
  const results =
    live && over
      ? seats(room)
          .filter((p) => g.board[p.id])
          .map((p) => {
            const x = g.board[p.id];
            return { id: p.id, status: x.status, seconds: x.seconds, place: x.place, points: x.points };
          })
      : null;
  return { live, over, players, results, standings: room.phase === 'finished' ? standings(room) : null };
}

// The rest: the answer only after the round or to a seat that named it, never to one that only
// watches (waiting, sitting out, skipped, out of guesses).
function own(room, pid, sh) {
  const you = pid && room.players[pid] ? pid : null;
  const g = room.game;
  let game = null;
  if (sh.live) {
    const track = g.tracks[g.round - 1] ?? null;
    const b = you ? g.board[you] : null;
    game = {
      rounds: g.rounds,
      label: g.label,
      round: g.round,
      previewUrl: track ? track.previewUrl : null,
      revealUntil: g.revealUntil,
      answer: sh.over || (b && b.status === 'won') ? track : null,
      me: b ? { status: b.status, entries: b.entries, stage: Math.min(missesOf(b), MAX_GUESSES - 1) } : null,
    };
  }
  return { code: room.code, phase: room.phase, you, hostId: room.hostId, game };
}

// What one socket sees. Never tokens, the kicked list, other rounds' tracks or a hidden answer.
export function view(room, pid) {
  const sh = shared(room);
  const v = own(room, pid, sh);
  if (v.game) v.game.results = sh.results;
  return { ...v, players: sh.players, standings: sh.standings };
}

// pid -> the 'room' message as JSON; the shared parts are serialized once for all sockets.
export function roomMessages(room) {
  const sh = shared(room);
  const players = JSON.stringify(sh.players);
  const results = JSON.stringify(sh.results);
  const standing = JSON.stringify(sh.standings);
  return (pid) => {
    const { game, ...v } = own(room, pid, sh);
    const g = game ? `${JSON.stringify(game).slice(0, -1)},"results":${results}}` : 'null';
    return `{"t":"room","room":{${JSON.stringify(v).slice(1, -1)},"players":${players},"game":${g},"standings":${standing}}}`;
  };
}
