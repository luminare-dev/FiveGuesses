import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BASE_POINTS,
  DISCONNECT_GRACE,
  EMPTY_TTL,
  FINISHED_TTL,
  IDLE_TTL,
  PLACE_BONUS,
  REVEAL_MS,
  SEAT_TTL,
  beginGame,
  createRoom,
  disconnect,
  handle,
  nextAlarm,
  roundPoints,
  standings,
  startFailed,
  tick,
  view,
} from '../src/rules.mjs';

const T0 = 1_800_000_000_000;
const track = (n) => ({
  id: 1000 + n,
  artist: `Band ${n}`,
  title: `Song ${n}`,
  year: null,
  matchedTrack: `Song ${n}`,
  matchedArtist: `Band ${n}`,
  previewUrl: `https://audio-ssl.itunes.apple.com/p${n}.m4a`,
  artworkUrl: '',
  appleMusicUrl: null,
  country: 'AT',
});
const TRACKS = [1, 2, 3, 4, 5].map(track);

let ids = 0;
const newId = () => `p${String(++ids).padStart(7, '0')}`;
const tok = (c) => c.repeat(22);

// A room with seated players: { room, s: { Name: sock } }.
function setup(names, now = T0) {
  let room = createRoom('ABC234', now);
  const s = {};
  names.forEach((name, i) => {
    const sock = { pid: null, token: tok(String.fromCharCode(97 + i)) };
    const res = handle(room, sock, { t: 'hello', token: sock.token, name }, now, newId);
    assert.ok(res.seat, `join ${name}`);
    sock.pid = res.seat;
    room = res.room;
    s[name] = sock;
  });
  return { room, s };
}

const send = (room, sock, msg, now = T0) => handle(room, sock, msg, now, newId);

function startGame(ctx, rounds = 3, now = T0) {
  const host = Object.values(ctx.s).find((x) => x.pid === ctx.room.hostId);
  const res = send(ctx.room, host, { t: 'start', rounds, source: { kind: 'category', id: '80s' } }, now);
  assert.equal(res.room.phase, 'starting');
  assert.deepEqual(res.start, { rounds, source: { kind: 'category', id: '80s' } });
  ctx.room = beginGame(res.room, { label: '1980s', tracks: TRACKS, rounds }, now).room;
  return ctx;
}

const answer = (room) => room.game.tracks[room.game.round - 1];
function right(ctx, name, now = T0) {
  const a = answer(ctx.room);
  ctx.room = send(ctx.room, ctx.s[name], { t: 'guess', round: ctx.room.game.round, id: a.id, artist: a.artist, title: a.title }, now).room;
}
function wrong(ctx, name, now = T0) {
  ctx.room = send(ctx.room, ctx.s[name], { t: 'guess', round: ctx.room.game.round, id: 9, artist: 'Nobody', title: 'Nothing' }, now).room;
}
function skip(ctx, name, times = 1, now = T0) {
  for (let i = 0; i < times; i++) ctx.room = send(ctx.room, ctx.s[name], { t: 'skip', round: ctx.room.game.round }, now).room;
}
const board = (ctx, name) => ctx.room.game.board[ctx.s[name].pid];
const host = (ctx, name) => ctx.s[name].pid === ctx.room.hostId;
function as(ctx, name, msg, now = T0) {
  const res = send(ctx.room, ctx.s[name], msg, now);
  ctx.room = res.room;
  return res;
}

test('hello joins, resumes and asks for a name', () => {
  const room = createRoom('ABC234', T0);
  const a = { pid: null };
  assert.deepEqual(send(room, a, { t: 'hello', token: tok('a') }).reply, { t: 'need_name' });
  const joined = send(room, a, { t: 'hello', token: tok('a'), name: '  Anna  ' });
  assert.equal(joined.room.players[joined.seat].name, 'Anna');
  const again = send(joined.room, { pid: null }, { t: 'hello', token: tok('a'), name: 'ignored' });
  assert.equal(again.seat, joined.seat);
  assert.equal(again.room.players[joined.seat].name, 'Anna');
  assert.deepEqual(again.close, [{ id: joined.seat, code: 4002 }]);
  assert.deepEqual(send(room, a, { t: 'hello', token: 'short' }).reply, { t: 'error', code: 'bad_request' });
});

test('messages before hello and on a missing room', () => {
  const room = createRoom('ABC234', T0);
  assert.deepEqual(send(room, { pid: null }, { t: 'skip', round: 1 }).reply, { t: 'error', code: 'hello_first' });
  assert.deepEqual(send(null, { pid: null }, { t: 'hello', token: tok('a') }), {
    room: null,
    reply: { t: 'error', code: 'not_found' },
    closeSelf: 4404,
  });
  const ctx = setup(['Anna']);
  assert.deepEqual(as(ctx, 'Anna', { t: 'dance' }).reply, { t: 'error', code: 'bad_request' });
});

test('names: trimmed, 20 code points, case-insensitive duplicates', () => {
  const ctx = setup(['Anna']);
  const b = { pid: null };
  assert.equal(send(ctx.room, b, { t: 'hello', token: tok('b'), name: ' aNNa ' }).reply.code, 'name_taken');
  assert.equal(send(ctx.room, b, { t: 'hello', token: tok('b'), name: 'x'.repeat(21) }).reply.code, 'name_invalid');
  assert.equal(send(ctx.room, b, { t: 'hello', token: tok('b'), name: '   ' }).reply.code, 'name_invalid');
  const ok = send(ctx.room, b, { t: 'hello', token: tok('b'), name: 'Ben\u0007  der   Große' });
  assert.equal(ok.room.players[ok.seat].name, 'Ben der Große');
  assert.equal(send(ctx.room, b, { t: 'hello', token: tok('b'), name: '😀'.repeat(20) }).seat !== undefined, true);
});

test('host is the first seat and moves on leave, kick and after 30 s away', () => {
  let ctx = setup(['Anna', 'Ben', 'Cara']);
  assert.ok(host(ctx, 'Anna'));
  const left = as(ctx, 'Anna', { t: 'leave' });
  assert.deepEqual(left.close, [{ id: ctx.s.Anna.pid, code: 4003 }]);
  assert.ok(host(ctx, 'Ben'));

  ctx = setup(['Anna', 'Ben', 'Cara']);
  assert.equal(as(ctx, 'Ben', { t: 'kick', player: ctx.s.Cara.pid }).reply.code, 'not_host');
  const kicked = as(ctx, 'Anna', { t: 'kick', player: ctx.s.Ben.pid });
  assert.deepEqual(kicked.close, [{ id: ctx.s.Ben.pid, code: 4001 }]);
  assert.equal(ctx.room.players[ctx.s.Ben.pid], undefined);
  const back = send(ctx.room, { pid: null }, { t: 'hello', token: ctx.s.Ben.token, name: 'Ben' });
  assert.deepEqual([back.reply, back.closeSelf], [{ t: 'error', code: 'kicked' }, 4001]);

  ctx = setup(['Anna', 'Ben']);
  ctx.room = disconnect(ctx.room, ctx.s.Anna.pid, T0).room;
  assert.ok(host(ctx, 'Anna'));
  ctx.room = tick(ctx.room, T0 + DISCONNECT_GRACE - 1).room;
  assert.ok(host(ctx, 'Anna'));
  ctx.room = tick(ctx.room, T0 + DISCONNECT_GRACE).room;
  assert.ok(host(ctx, 'Ben'));
  const resumed = send(ctx.room, { pid: null }, { t: 'hello', token: ctx.s.Anna.token }, T0 + DISCONNECT_GRACE + 1);
  assert.equal(resumed.seat, ctx.s.Anna.pid);
  assert.equal(resumed.room.hostId, ctx.s.Ben.pid);
});

test('round start: sitters-out are out, late joiners wait', () => {
  const ctx = setup(['Anna', 'Ben']);
  as(ctx, 'Ben', { t: 'sitOut', on: true });
  startGame(ctx);
  assert.equal(board(ctx, 'Anna').status, 'playing');
  assert.equal(board(ctx, 'Ben').status, 'out');
  const c = { pid: null };
  const late = send(ctx.room, c, { t: 'hello', token: tok('c'), name: 'Cara' });
  assert.equal(late.room.game.board[late.seat].status, 'waiting');
});

test('start needs the host, a valid source and an active player; failures go back', () => {
  const ctx = setup(['Anna', 'Ben']);
  assert.equal(as(ctx, 'Ben', { t: 'start', rounds: 3, source: { kind: 'category', id: '80s' } }).reply.code, 'not_host');
  assert.equal(as(ctx, 'Anna', { t: 'start', rounds: 0, source: { kind: 'category', id: '80s' } }).reply.code, 'bad_request');
  assert.equal(as(ctx, 'Anna', { t: 'start', rounds: 3, source: { kind: 'ids', label: 'x', ids: [] } }).reply.code, 'bad_request');
  const res = as(ctx, 'Anna', { t: 'start', rounds: 3, source: { kind: 'ids', label: 'Mine', ids: [{ id: 5, country: 'AT' }] } });
  assert.equal(res.start.source.kind, 'ids');
  const empty = beginGame(ctx.room, { label: 'Mine', tracks: [], rounds: 3 }, T0);
  assert.equal(empty.room.phase, 'lobby');
  assert.deepEqual(empty.send, [{ id: ctx.s.Anna.pid, msg: { t: 'error', code: 'source_empty' } }]);
  assert.equal(startFailed(ctx.room, 'source_failed').room.phase, 'lobby');
  const short = beginGame(ctx.room, { label: 'Mine', tracks: TRACKS.slice(0, 2), rounds: 10 }, T0).room;
  assert.equal(short.game.rounds, 2);
});

test('guesses: partial, stage doubling, five misses lose', () => {
  const ctx = startGame(setup(['Anna', 'Ben']));
  const a = answer(ctx.room);
  as(ctx, 'Anna', { t: 'guess', round: 1, id: 7, artist: a.artist, title: 'Other' });
  assert.deepEqual(board(ctx, 'Anna').entries, [{ kind: 'partial', text: `${a.artist} – Other` }]);
  wrong(ctx, 'Anna');
  skip(ctx, 'Anna');
  assert.equal(view(ctx.room, ctx.s.Anna.pid).game.me.stage, 3);
  as(ctx, 'Anna', { t: 'guess', round: 2, id: a.id, artist: a.artist, title: a.title });
  assert.equal(board(ctx, 'Anna').status, 'playing', 'stale round ignored');
  skip(ctx, 'Anna', 2);
  assert.equal(board(ctx, 'Anna').status, 'lost');
  assert.equal(view(ctx.room, ctx.s.Anna.pid).game.me.stage, 4);
  right(ctx, 'Anna');
  assert.equal(board(ctx, 'Anna').status, 'lost');
});

test('scoring examples', () => {
  assert.deepEqual(BASE_POINTS, { 1: 100, 2: 80, 4: 60, 8: 40, 16: 20 });
  assert.deepEqual(PLACE_BONUS, [30, 20, 10]);
  const ctx = startGame(setup(['Anna', 'Ben', 'Cara', 'Dan', 'Eva', 'Finn']), 2);
  skip(ctx, 'Anna');
  right(ctx, 'Anna');
  right(ctx, 'Ben');
  skip(ctx, 'Cara', 3);
  right(ctx, 'Cara');
  skip(ctx, 'Dan', 4);
  right(ctx, 'Dan');
  skip(ctx, 'Eva', 5);
  as(ctx, 'Anna', { t: 'skipPlayer', player: ctx.s.Finn.pid });
  const pts = (n) => [board(ctx, n).seconds, board(ctx, n).place, board(ctx, n).points];
  assert.deepEqual(pts('Anna'), [2, 1, 110]);
  assert.deepEqual(pts('Ben'), [1, 2, 120]);
  assert.deepEqual(pts('Cara'), [8, 3, 50]);
  assert.deepEqual(pts('Dan'), [16, 4, 20]);
  assert.equal(board(ctx, 'Eva').points, 0);
  assert.equal(board(ctx, 'Finn').status, 'skipped');
  assert.equal(ctx.room.phase, 'reveal');
  assert.equal(ctx.room.players[ctx.s.Ben.pid].total, 120);
  assert.equal(roundPoints(1, 4), 100);
  assert.equal(roundPoints(2, 2), 100);
});

test('standings: two rounds, ties and shared ranks', () => {
  const room = createRoom('ABC234', T0);
  const p = (id, joined, total, correct, secondsSum) => {
    room.players[id] = { id, name: id, joined, total, correct, secondsSum };
  };
  p('anna', 1, 110 + 100, 2, 3);
  p('ben', 2, 120, 1, 1);
  p('gil', 3, 80 + 20, 1, 2);
  p('hana', 4, 100, 1, 1);
  assert.deepEqual(
    standings(room).map((x) => [x.id, x.rank]),
    [['anna', 1], ['ben', 2], ['hana', 3], ['gil', 4]],
  );
  const tie = createRoom('ABC234', T0);
  for (const [id, j, total] of [['x', 1, 50], ['y', 2, 50], ['z', 3, 20]]) {
    tie.players[id] = { id, name: id, joined: j, total, correct: 1, secondsSum: 4 };
  }
  assert.deepEqual(standings(tie).map((x) => x.rank), [1, 1, 3]);
});

test('the round waits for awaited players only', () => {
  const ctx = startGame(setup(['Anna', 'Ben', 'Cara', 'Dan']));
  as(ctx, 'Dan', { t: 'sitOut', on: true });
  assert.equal(board(ctx, 'Dan').status, 'out');
  ctx.room = disconnect(ctx.room, ctx.s.Cara.pid, T0).room;
  right(ctx, 'Anna');
  assert.equal(ctx.room.phase, 'playing', 'Ben still plays');
  right(ctx, 'Ben');
  assert.equal(ctx.room.phase, 'playing', 'Cara away for less than 30 s');
  ctx.room = tick(ctx.room, T0 + DISCONNECT_GRACE).room;
  assert.equal(ctx.room.phase, 'reveal');
  assert.equal(board(ctx, 'Cara').status, 'lost');
  as(ctx, 'Dan', { t: 'sitOut', on: false });
  assert.equal(board(ctx, 'Dan').status, 'out', 'back from the next round');
});

test('host controls: endRound, next, endGame', () => {
  const ctx = startGame(setup(['Anna', 'Ben']), 3);
  right(ctx, 'Ben');
  as(ctx, 'Anna', { t: 'endRound' });
  assert.equal(ctx.room.phase, 'reveal');
  assert.equal(ctx.room.game.board[ctx.s.Anna.pid].status, 'lost');
  assert.equal(ctx.room.game.revealUntil, T0 + REVEAL_MS);
  as(ctx, 'Anna', { t: 'next' });
  assert.equal(ctx.room.phase, 'playing');
  assert.equal(ctx.room.game.round, 2);
  as(ctx, 'Anna', { t: 'endGame' });
  assert.equal(ctx.room.phase, 'finished');
  assert.equal(ctx.room.finishedAt, T0);
  const v = view(ctx.room, ctx.s.Ben.pid);
  assert.deepEqual(v.standings.map((x) => [x.name, x.total, x.rank]), [['Ben', 130, 1], ['Anna', 0, 2]]);
});

test('reveal moves on by itself only with an active player', () => {
  const ctx = startGame(setup(['Anna', 'Ben']), 3);
  as(ctx, 'Anna', { t: 'endRound' });
  ctx.room = tick(ctx.room, T0 + REVEAL_MS).room;
  assert.equal(ctx.room.game.round, 2);
  as(ctx, 'Anna', { t: 'endRound' }, T0 + REVEAL_MS);
  as(ctx, 'Anna', { t: 'sitOut', on: true }, T0 + REVEAL_MS);
  as(ctx, 'Ben', { t: 'sitOut', on: true }, T0 + REVEAL_MS);
  ctx.room = tick(ctx.room, T0 + 2 * REVEAL_MS).room;
  assert.equal(ctx.room.phase, 'reveal');
  assert.equal(ctx.room.game.revealUntil, null);
  as(ctx, 'Anna', { t: 'next' }, T0 + 2 * REVEAL_MS);
  assert.equal(ctx.room.game.round, 3);
});

test('last round finishes with standings; play again resets totals', () => {
  const ctx = startGame(setup(['Anna', 'Ben']), 1);
  right(ctx, 'Anna');
  right(ctx, 'Ben');
  assert.equal(ctx.room.phase, 'finished');
  const v = view(ctx.room, ctx.s.Anna.pid);
  assert.deepEqual(v.standings.map((x) => [x.name, x.total, x.correct, x.rank]), [['Anna', 130, 1, 1], ['Ben', 120, 1, 2]]);
  startGame(ctx, 1, T0 + 1000);
  assert.equal(ctx.room.players[ctx.s.Anna.pid].total, 0);
  assert.equal(ctx.room.finishedAt, null);
});

test('views never leak tokens, the kicked list or other tracks; the answer waits', () => {
  const ctx = startGame(setup(['Anna', 'Ben', 'Cara']), 3);
  as(ctx, 'Anna', { t: 'kick', player: ctx.s.Cara.pid });
  const a = answer(ctx.room);
  let json = JSON.stringify(view(ctx.room, ctx.s.Anna.pid));
  for (const t of [tok('a'), tok('b'), tok('c'), TRACKS[1].title, TRACKS[2].previewUrl]) assert.ok(!json.includes(t), t);
  assert.ok(!json.includes(a.title));
  assert.ok(json.includes(a.previewUrl));
  right(ctx, 'Anna');
  assert.equal(view(ctx.room, ctx.s.Anna.pid).game.answer.id, a.id);
  assert.equal(view(ctx.room, ctx.s.Ben.pid).game.answer, null);
  json = JSON.stringify(view(ctx.room, null));
  assert.ok(!json.includes(a.title));
  assert.equal(view(ctx.room, null).you, null);
});

test('seats: kept within 5 minutes, removed after', () => {
  const ctx = startGame(setup(['Anna', 'Ben']), 3);
  right(ctx, 'Ben');
  ctx.room = disconnect(ctx.room, ctx.s.Ben.pid, T0).room;
  ctx.room = tick(ctx.room, T0 + SEAT_TTL - 1).room;
  const back = send(ctx.room, { pid: null }, { t: 'hello', token: ctx.s.Ben.token }, T0 + SEAT_TTL - 1);
  assert.equal(back.room.game.board[ctx.s.Ben.pid].status, 'won');
  ctx.room = tick(ctx.room, T0 + SEAT_TTL).room;
  assert.equal(ctx.room.players[ctx.s.Ben.pid], undefined);
});

test('nextAlarm and wipes for every TTL', () => {
  const fresh = createRoom('ABC234', T0);
  assert.equal(nextAlarm(fresh, T0), T0 + EMPTY_TTL);
  assert.equal(tick(fresh, T0 + EMPTY_TTL - 1).wipe, undefined);
  assert.deepEqual(tick(fresh, T0 + EMPTY_TTL), { room: null, wipe: true });

  const ctx = setup(['Anna', 'Ben']);
  assert.equal(ctx.room.emptySince, null);
  assert.equal(nextAlarm(ctx.room, T0), T0 + IDLE_TTL);
  assert.deepEqual(tick(ctx.room, T0 + IDLE_TTL), { room: null, wipe: true });

  ctx.room = disconnect(ctx.room, ctx.s.Anna.pid, T0 + 1000).room;
  assert.equal(nextAlarm(ctx.room, T0 + 1000), T0 + 1000 + DISCONNECT_GRACE);
  assert.equal(nextAlarm(ctx.room, T0 + 1000 + DISCONNECT_GRACE), T0 + 1000 + SEAT_TTL);
  ctx.room = disconnect(ctx.room, ctx.s.Ben.pid, T0 + 2000).room;
  assert.equal(ctx.room.emptySince, T0 + 2000);
  assert.deepEqual(tick(ctx.room, T0 + 2000 + EMPTY_TTL), { room: null, wipe: true });

  const done = startGame(setup(['Anna']), 1);
  right(done, 'Anna');
  assert.equal(nextAlarm(done.room, T0), T0 + FINISHED_TTL);
  assert.deepEqual(tick(done.room, T0 + FINISHED_TTL), { room: null, wipe: true });

  const rev = startGame(setup(['Anna']), 2);
  right(rev, 'Anna');
  assert.equal(nextAlarm(rev.room, T0), T0 + REVEAL_MS);
});
