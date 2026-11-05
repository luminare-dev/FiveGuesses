// A room server for the browser tests: the real rules of api/src/rules.mjs behind
// page.routeWebSocket, with the I/O of api/src/room.mjs reduced to what a test needs, plus the
// category and iTunes answers the host's browser needs to build a game. Nothing leaves the
// machine. Bots are seats without a socket that a test moves itself.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, WebSocketRoute } from '@playwright/test';
import { API_HOST, AUDIO_HOST, ARTWORK_HOST, CORS, ORIGIN, SEARCH_HOST } from './fixtures';

export const ROOM_CODE = 'ABC234';
export const ROOM_WS = 'wss://api.fiveguesses.app/api/rooms/*/ws';

export type Track = {
  id: number;
  artist: string;
  title: string;
  year: null;
  matchedTrack: string;
  matchedArtist: string;
  previewUrl: string;
  artworkUrl: string;
  appleMusicUrl: string | null;
  country: string;
};

export function track(id: number, artist: string, title: string): Track {
  return {
    id,
    artist,
    title,
    year: null,
    matchedTrack: title,
    matchedArtist: artist,
    previewUrl: `https://${AUDIO_HOST}/itunes-assets/test/${id}.m4a`,
    artworkUrl: `https://${ARTWORK_HOST}/image/thumb/test/${id}/512x512bb.jpg`,
    appleMusicUrl: `https://music.apple.com/at/album/test/${id}?i=${id}`,
    country: 'AT',
  };
}

export const TAKE_ON_ME = track(1440783625, 'a-ha', 'Take On Me');
export const WONDERWALL = track(1440842449, 'Oasis', 'Wonderwall');

// Eight live suggestions as Apple returns them for a short query: long titles and artists, one
// unbroken word, and a cover on every row. For the guess box on a narrow phone.
export const LONG_SUGGESTIONS: readonly Track[] = [
  TAKE_ON_ME,
  track(1440650711, 'Florence + The Machine', 'Dog Days Are Over (Live at the Royal Albert Hall, 2012 Remaster)'),
  track(1440650712, 'Howard Shore, London Philharmonic Orchestra & The London Voices', 'Concerning Hobbits'),
  track(1440650713, 'Julie Andrews & Dick Van Dyke', 'Supercalifragilisticexpialidocious'),
  WONDERWALL,
  track(1440650714, 'Queen', 'Bohemian Rhapsody - Remastered 2011'),
  track(1440650715, 'Earth, Wind & Fire', "Let's Groove (Single Version) [feat. The Emotions]"),
  track(1440650716, 'ABBA', 'Dancing Queen'),
];

// The answer of iTunes search for these tracks, as the browser gets it.
export function searchAnswer(tracks: readonly Track[]): string {
  return JSON.stringify({
    resultCount: tracks.length,
    results: tracks.map((t) => ({
      wrapperType: 'track',
      trackId: t.id,
      artistName: t.artist,
      trackName: t.title,
      previewUrl: t.previewUrl,
      artworkUrl100: t.artworkUrl.replace('512x512bb', '100x100bb'),
      trackViewUrl: t.appleMusicUrl,
    })),
  });
}

// The answer of iTunes lookup for the asked ids among these tracks, as the browser gets it.
export function lookupAnswer(tracks: readonly Track[], ids: readonly string[]): string {
  const results = tracks
    .filter((t) => ids.includes(String(t.id)))
    .map((t) => ({
      wrapperType: 'track',
      kind: 'song',
      trackId: t.id,
      artistName: t.artist,
      trackName: t.title,
      previewUrl: t.previewUrl,
      artworkUrl100: t.artworkUrl.replace('512x512bb', '100x100bb'),
      trackViewUrl: t.appleMusicUrl,
    }));
  return JSON.stringify({ resultCount: results.length, results });
}

// The iTunes top-songs feed (legacy RSS as JSON) with these tracks.
export function chartAnswer(tracks: readonly Track[]): string {
  return JSON.stringify({
    feed: {
      entry: tracks.map((t) => ({
        'im:name': { label: t.title },
        'im:artist': { label: t.artist },
        'im:image': [{ label: t.artworkUrl.replace('512x512bb', '170x170bb'), attributes: { height: '170' } }],
        id: { label: t.appleMusicUrl, attributes: { 'im:id': String(t.id) } },
        link: [
          { attributes: { rel: 'alternate', type: 'text/html', href: t.appleMusicUrl } },
          { attributes: { rel: 'enclosure', type: 'audio/x-m4a', href: t.previewUrl } },
        ],
      })),
    },
  });
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

// iTunes as the browser sees it for these tracks: search, lookup and the top-songs feed.
export async function routeApple(target: { route: Page['route'] }, tracks: readonly Track[]): Promise<URL[]> {
  const seen: URL[] = [];
  await target.route(
    (url) => url.host === SEARCH_HOST,
    (route) => {
      const url = new URL(route.request().url());
      seen.push(url);
      const body = url.pathname === '/lookup'
        ? lookupAnswer(tracks, (url.searchParams.get('id') ?? '').split(','))
        : url.pathname.includes('/rss/topsongs/')
          ? chartAnswer(tracks)
          : searchAnswer(tracks);
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body });
    }
  );
  return seen;
}

// The song service's category entries for these tracks (no previews, as the service sends them).
export async function routePool(target: { route: Page['route'] }, tracks: readonly Track[], label = '1980s'): Promise<void> {
  await target.route(
    (url) => url.host === API_HOST && url.pathname === '/api/pool',
    (route) =>
      route.fulfill(
        json({
          source: new URL(route.request().url()).searchParams.get('source'),
          label,
          entries: tracks.map((t) => ({ id: t.id, artist: t.artist, title: t.title, country: t.country })),
        })
      )
  );
}

type Result = {
  room: unknown;
  reply?: unknown;
  close?: { id: string; code: number }[];
  seat?: string;
  closeSelf?: number;
  wipe?: boolean;
};

type Rules = {
  createRoom: (code: string, now: number) => unknown;
  handle: (room: unknown, sock: { pid: string | null }, msg: unknown, now: number, newId: () => string) => Result;
  disconnect: (room: unknown, pid: string, now: number) => Result;
  view: (room: unknown, pid: string | null) => unknown;
};

// Loaded by path at run time: the type checker leaves api/ out, the test runner loads the module.
const RULES_PATH = resolve(__dirname, '..', 'api', 'src', 'rules.mjs');
let rules: Rules | null = null;
async function loadRules(): Promise<Rules> {
  if (rules === null) rules = (await import(RULES_PATH)) as Rules;
  return rules;
}

type Socket = { ws: WebSocketRoute; pid: string | null };
export type Sent = { socket: number; message: Record<string, unknown> };

export class FakeRoom {
  private room: unknown;
  private readonly rules: Rules;
  private readonly sockets: Socket[] = [];
  private ids = 0;
  // Every message the page sent, pings left out, with the index of its socket.
  readonly received: Sent[] = [];

  private readonly tracks: Track[];

  private constructor(rules: Rules, room: unknown, tracks: Track[]) {
    this.rules = rules;
    this.room = room;
    this.tracks = tracks;
  }

  // An open room, or (exists false) a code the server does not know. The tracks are the songs
  // the category and iTunes stubs of attach() offer.
  static async create(tracks: Track[], exists = true): Promise<FakeRoom> {
    const r = await loadRules();
    return new FakeRoom(r, exists ? r.createRoom(ROOM_CODE, Date.now()) : null, tracks);
  }

  // The room socket plus the category and iTunes answers for the host's browser.
  async attach(page: Page): Promise<void> {
    await routePool(page, this.tracks);
    await routeApple(page, this.tracks);
    await page.routeWebSocket(ROOM_WS, (ws) => this.accept(ws));
  }

  messages(type: string): Record<string, unknown>[] {
    return this.received.filter((m) => m.message.t === type).map((m) => m.message);
  }

  // A seat without a socket; returns its player id.
  join(name: string): string {
    const token = `bot${String(++this.ids).padStart(19, '0')}`;
    const sock = { pid: null as string | null };
    const res = this.rules.handle(this.room, sock, { t: 'hello', token, name }, Date.now(), () => this.newId());
    this.apply(res, null);
    if (res.seat === undefined) throw new Error(`the bot ${name} could not join`);
    return res.seat;
  }

  // A move of a bot.
  act(pid: string, message: Record<string, unknown>): void {
    this.apply(this.rules.handle(this.room, { pid }, message, Date.now(), () => this.newId()), null);
  }

  // Closes every socket of the page with this code, as the server does on a kick or a wipe.
  closeAll(code: number): void {
    for (const s of [...this.sockets]) this.close(s, code);
  }

  private close(socket: Socket, code: number): void {
    socket.pid = null;
    this.sockets.splice(this.sockets.indexOf(socket), 1);
    void socket.ws.close({ code, reason: 'closed' }).catch(() => undefined);
  }

  private static send(socket: Socket, message: unknown): void {
    try {
      socket.ws.send(JSON.stringify(message));
    } catch {
      // A page that went away.
    }
  }

  private newId(): string {
    return `p${String(++this.ids).padStart(7, '0')}`;
  }

  private accept(ws: WebSocketRoute): void {
    const socket: Socket = { ws, pid: null };
    const index = this.sockets.push(socket) - 1;
    if (this.room === null) {
      FakeRoom.send(socket, { t: 'error', code: 'not_found' });
      this.close(socket, 4404);
      return;
    }
    ws.onMessage((data) => {
      if (data === '{"t":"ping"}') {
        FakeRoom.send(socket, { t: 'pong' });
        return;
      }
      const message = JSON.parse(String(data)) as Record<string, unknown>;
      this.received.push({ socket: index, message });
      const res = this.rules.handle(this.room, { pid: socket.pid }, this.inOrder(message), Date.now(), () => this.newId());
      this.apply(res, socket);
    });
    ws.onClose(() => {
      const pid = socket.pid;
      socket.pid = null;
      if (this.sockets.includes(socket)) this.sockets.splice(this.sockets.indexOf(socket), 1);
      if (pid !== null && this.room !== null && !this.sockets.some((s) => s.pid === pid)) {
        this.apply(this.rules.disconnect(this.room, pid, Date.now()), null);
      }
    });
  }

  // The host's browser shuffles the songs; the fake puts them back in the order of create(), so
  // a test knows the answer of every round.
  private inOrder(message: Record<string, unknown>): Record<string, unknown> {
    if (message.t !== 'start' || !Array.isArray(message.tracks)) return message;
    const rank = (t: { id?: unknown }) => {
      const at = this.tracks.findIndex((x) => x.id === t.id);
      return at === -1 ? this.tracks.length : at;
    };
    const tracks = [...(message.tracks as { id?: unknown }[])].sort((a, b) => rank(a) - rank(b));
    return { ...message, tracks };
  }

  private apply(res: Result, socket: Socket | null): void {
    if (socket !== null && res.seat !== undefined) socket.pid = res.seat;
    for (const c of res.close ?? []) {
      for (const s of [...this.sockets]) {
        if (s.pid === c.id && !(c.code === 4002 && s === socket)) this.close(s, c.code);
      }
    }
    if (socket !== null && res.reply !== undefined) FakeRoom.send(socket, res.reply);
    if (socket !== null && res.closeSelf !== undefined) this.close(socket, res.closeSelf);
    this.room = res.room;
    if (res.wipe || this.room === null) return;
    for (const s of this.sockets) FakeRoom.send(s, { t: 'room', room: this.rules.view(this.room, s.pid) });
  }
}

// The static test server has no single-page fallback: /r/<CODE> gets the shell, as Apache and
// the service worker give it. On the context, so a navigation through the worker is answered too.
const SHELL = resolve(__dirname, '..', 'web-build', 'index.html');
export async function serveRoomPages(target: { route: Page['route'] }, headers: Record<string, string> = {}): Promise<void> {
  await target.route(`${ORIGIN}/r/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers, body: readFileSync(SHELL, 'utf8') })
  );
}
