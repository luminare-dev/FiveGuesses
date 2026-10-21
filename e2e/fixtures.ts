// Shared fixtures for the browser tests: a fixed clock, stubbed Apple hosts (an in-memory WAV
// and a one-pixel PNG, so no request leaves the machine and no binary fixture is committed), an
// online state that does not depend on the host's network, a request log, the expected daily
// song from the data, and a few keyboard and pointer helpers.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dailySongIndex, songLabel } from '../src/game';
import type { Song } from '../src/game';

export { expect };

// Requests a service worker makes itself follow the context's offline state and routes only with
// this switch, which Playwright 1.56 reads when a worker starts (crServiceWorker.js). Without it
// the worker of an "offline" page still reaches the test server, and an offline test passes on
// network answers instead of the worker's cache.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export const ORIGIN = 'http://127.0.0.1:4173';
export const AUDIO_HOST = 'audio-ssl.itunes.apple.com';
export const ARTWORK_HOST = 'is1-ssl.mzstatic.com';
export const ALLOWED_THIRD_PARTY_HOSTS: readonly string[] = [AUDIO_HOST, ARTWORK_HOST];

// 2026-10-21 10:00 Europe/Vienna: puzzle #58. Every instant is written as a UTC instant.
export const DEFAULT_TIME = '2026-10-21T08:00:00Z';
// Puzzle #1 at the same time of day; every later puzzle is one day on.
const PUZZLE_ONE_MS = Date.UTC(2026, 7, 25, 8, 0, 0);
const DAY_MS = 86_400_000;

// The one page error the audio stack may log: a pause that lands before play() resolved.
const TOLERATED_PAGE_ERROR = 'play() request was interrupted';

// Every test collects page errors; anything but the tolerated message fails the test.
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors.filter((message) => !message.includes(TOLERATED_PAGE_ERROR)), 'page errors').toEqual([]);
    },
    { auto: true },
  ],
});

// A RIFF/WAVE file of PCM 16-bit mono 8000 Hz silence, built in memory.
export function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data, 40);
  return wav;
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed) >>> 0, 0);
  return Buffer.concat([length, typed, crc]);
}

// A one-pixel transparent PNG, built in memory.
function png1x1(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); // width
  header.writeUInt32BE(1, 4); // height
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // compression, filter and interlace stay 0
  const scanline = Buffer.from([0, 0, 0, 0, 0]); // filter byte + one RGBA pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanline)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export const PNG_1X1: Buffer = png1x1();

const SONGS: readonly Song[] = (
  JSON.parse(readFileSync(resolve(__dirname, '..', 'assets', 'songs.json'), 'utf8')) as { songs: Song[] }
).songs;

export const SONG_COUNT = SONGS.length;

// The song the daily pick serves for a puzzle number, read from the data like the app does.
export function expectedDaily(puzzle: number): Song {
  return SONGS[dailySongIndex(puzzle, SONGS.length)];
}

export function expectedDailyLabel(puzzle: number): string {
  return songLabel(expectedDaily(puzzle));
}

// The first puzzle number that serves the song at this index.
export function puzzleFor(index: number): number {
  for (let puzzle = 1; puzzle <= SONGS.length; puzzle++) {
    if (dailySongIndex(puzzle, SONGS.length) === index) return puzzle;
  }
  throw new Error(`no puzzle serves song index ${index}`);
}

// 08:00:00Z on the day of the puzzle (10:00 in Vienna while summer time holds).
export function clockFor(puzzle: number): string {
  return new Date(PUZZLE_ONE_MS + (puzzle - 1) * DAY_MS).toISOString();
}

export type SetupOptions = {
  time?: string;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
  // Where the Apple stubs are installed. 'context' also stubs a request that a service worker
  // makes itself, which a page route does not see (with the switch at the top of this file).
  stubScope?: 'page' | 'context';
  // Whether navigator.onLine reads true until goOffline() (the default). The app does not start
  // a preview while it reads false, and Chromium reports false on a machine without a network
  // interface although every request here stays on 127.0.0.1. With false the browser's own
  // value stands.
  pinOnline?: boolean;
};

// The page-side flag goOffline() sets; the navigator.onLine stand-in of setup() reads it.
type OfflineFlag = { __fgOffline?: boolean };

export type RequestLog = {
  requests: string[];
  // Hosts other than the test server that the page asked for, in first-seen order.
  thirdPartyHosts: () => string[];
};

// Fixes the clock, the media emulation and the online state, stubs the two Apple hosts and
// starts the request log. Call it before the first navigation.
export async function setup(page: Page, options: SetupOptions = {}): Promise<RequestLog> {
  const {
    time = DEFAULT_TIME,
    colorScheme = 'dark',
    reducedMotion = 'no-preference',
    stubScope = 'page',
    pinOnline = true,
  } = options;
  await page.clock.install({ time });
  await page.emulateMedia({ colorScheme, reducedMotion });
  if (pinOnline) {
    // navigator.onLine reads true until goOffline() marks the page, then the browser's own value.
    await page.addInitScript(() => {
      const browserValue = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(Navigator.prototype, 'onLine', {
        configurable: true,
        enumerable: true,
        get(this: Navigator): boolean {
          if ((window as unknown as OfflineFlag).__fgOffline !== true) return true;
          return browserValue?.get?.call(this) === true;
        },
      });
    });
  }
  const router = stubScope === 'context' ? page.context() : page;
  await router.route(`**/${AUDIO_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(3) })
  );
  await router.route('**/*.mzstatic.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 })
  );
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const serverHost = new URL(ORIGIN).host;
  return {
    requests,
    thirdPartyHosts: () => {
      const hosts: string[] = [];
      for (const url of requests) {
        const { host } = new URL(url);
        if (host !== serverHost && !hosts.includes(host)) hosts.push(host);
      }
      return hosts;
    },
  };
}

// Takes the page offline: every request of its context fails, the service worker's own
// included (a request to the test server that still got out is aborted as a lost connection),
// navigator.onLine reads the browser's own value (false now) in this document and in every
// later one, and the open document gets the offline event at once, also on a host whose
// browser was offline already.
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.context().route(`${ORIGIN}/**`, (route) => route.abort('internetdisconnected'));
  await page.addInitScript(() => {
    (window as unknown as OfflineFlag).__fgOffline = true;
  });
  await page.evaluate(() => {
    (window as unknown as OfflineFlag).__fgOffline = true;
    window.dispatchEvent(new Event('offline'));
  });
}

export const playButton = (page: Page) => page.getByRole('button', { name: /^Play the/ });
export const combobox = (page: Page) => page.getByRole('combobox', { name: 'Your guess' });
export const liveRegion = (page: Page) => page.getByRole('status');
export const skipButton = (page: Page) => page.getByRole('button', { name: /^Skip/ });

// Waits for a snippet that was just started to end: the button reads as pressed while the
// preview loads and plays, and returns to its resting state within the snippet length plus
// a safety margin.
export async function awaitSnippet(page: Page, seconds = 1): Promise<void> {
  const button = page.getByRole('button', { name: /snippet$/ });
  await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  await expect(button).toHaveAttribute('aria-pressed', 'false', { timeout: (seconds + 3) * 1_000 });
}

// Presses the play button and waits for the snippet to end.
export async function playSnippet(page: Page, seconds = 1): Promise<void> {
  await playButton(page).click();
  await awaitSnippet(page, seconds);
}

// Types a guess into an emptied box. With the keyboard the typed text is sent with Enter (an
// exactly typed song counts); with the pointer the matching suggestion is clicked.
export async function guess(page: Page, text: string, how: 'keyboard' | 'pointer'): Promise<void> {
  const input = combobox(page);
  await input.fill('');
  if (how === 'keyboard') {
    await input.focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    return;
  }
  await input.click();
  await page.keyboard.type(text);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('option', { name: new RegExp(escaped, 'i') }).first().click();
}

// Presses Skip this many times, waiting for the board to take each one.
export async function skip(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    const rowsBefore = await page.getByRole('listitem', { name: /^Guess \d: (wrong|right artist|skipped|correct)/ }).count();
    await skipButton(page).click();
    await expect(page.getByRole('listitem', { name: `Guess ${rowsBefore + 1}: skipped` })).toHaveCount(1);
  }
}

// The accessible name of the focused element as the app builds it: aria-label, else text.
export function activeName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return '';
    return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
  });
}

// Presses Tab until the focused element carries this name.
export async function tabTo(page: Page, name: string, limit = 12): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    if ((await activeName(page)) === name) return;
  }
  throw new Error(`no element named "${name}" within ${limit} Tab presses`);
}

// Opens the Statistics sheet from the header and returns the dialog.
export async function openStats(page: Page) {
  await page.getByRole('button', { name: 'Statistics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Statistics' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Opens the About sheet from the header and returns the dialog.
export async function openAbout(page: Page) {
  await page.getByRole('button', { name: 'About' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'About FiveGuesses' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function closeSheet(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
