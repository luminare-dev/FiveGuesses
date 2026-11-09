import type { Page } from '@playwright/test';
import { CATEGORIES, CORS, combobox, expect, liveRegion, playSnippet, serviceDown, setup, skip, test } from './fixtures';
import { routeApple, routePool, TAKE_ON_ME, track, WONDERWALL } from './roomServer';

const API = 'https://api.fiveguesses.app';
const SOURCES = { sources: [{ id: '80s', group: 'Decades', label: '1980s' }] };

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

// Every request the page made to this host, as URLs.
function requestsTo(page: Page, host: string): URL[] {
  const seen: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.host === host) seen.push(url);
  });
  return seen;
}

// The daily round lost, so the result card is on screen.
async function toReveal(page: Page): Promise<void> {
  await page.goto('/');
  await skip(page, 5);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
}

async function openSources(page: Page) {
  await page.getByRole('button', { name: 'Choose songs' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose songs' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('a category plays its songs, with live suggestions and covers', async ({ page }) => {
  await setup(page);
  await page.route(`${API}/api/sources`, (route) => route.fulfill(json(SOURCES)));
  await routePool(page, [TAKE_ON_ME]);
  await routeApple(page, [TAKE_ON_ME, WONDERWALL]);
  const apple = requestsTo(page, 'itunes.apple.com');
  const service = requestsTo(page, 'api.fiveguesses.app');
  await toReveal(page);
  // The daily round never asks iTunes.
  expect(apple).toEqual([]);

  const sheet = await openSources(page);
  await expect(sheet.getByRole('heading', { name: 'Charts (iTunes)' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Top songs Austria' })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Decades' })).toBeVisible();
  await sheet.getByRole('button', { name: '1980s' }).click();
  await expect(page.getByText('Free play · 1980s')).toBeVisible();
  // The entries come from the service, the preview from the browser's own iTunes lookup.
  expect(service.filter((url) => url.pathname === '/api/pool').map((url) => url.searchParams.get('source'))).toEqual(['80s']);
  const lookup = apple.find((url) => url.pathname === '/lookup');
  expect(lookup?.searchParams.get('id')).toBe(String(TAKE_ON_ME.id));
  expect(lookup?.searchParams.get('country')).toBe('AT');
  await playSnippet(page);

  await combobox(page).click();
  await page.keyboard.type('take on');
  const option = page.getByRole('option', { name: 'a-ha – Take On Me' });
  await expect(option).toBeVisible();
  await expect(option.locator('img')).toHaveCount(1);
  await expect(liveRegion(page)).toHaveText('2 suggestions. Use the arrow keys to choose one.');
  const searches = apple.filter((url) => url.pathname === '/search');
  expect(searches[searches.length - 1].searchParams.get('term')).toBe('take on');
  await option.click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(page.getByRole('img', { name: 'Album artwork for a-ha – Take On Me' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Listen on Apple Music' })).toHaveAttribute('href', TAKE_ON_ME.appleMusicUrl ?? '');
  await expect(page.getByRole('main').getByText('Previews courtesy of Apple Music')).toBeVisible();
});

test('a chart comes from the iTunes feed in the browser, without the song service', async ({ page }) => {
  await setup(page);
  await serviceDown(page);
  await routeApple(page, [WONDERWALL]);
  const apple = requestsTo(page, 'itunes.apple.com');
  const service = requestsTo(page, 'api.fiveguesses.app');
  await toReveal(page);
  const sheet = await openSources(page);
  await expect(sheet.getByText('The categories could not be loaded. The charts and your own songs still work.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Top songs Germany' }).click();
  await expect(page.getByText('Free play · Top songs Germany')).toBeVisible();
  expect(apple.map((url) => url.pathname)).toEqual(['/de/rss/topsongs/limit=100/json']);
  expect(service.map((url) => url.pathname)).toEqual(['/api/sources']);
  await playSnippet(page);
  await skip(page, 5);
  await expect(page.getByRole('img', { name: 'Album artwork for Oasis – Wonderwall' })).toBeVisible();
});

test('the sheet lists every category of the service by its group', async ({ page }) => {
  await setup(page);
  const service = requestsTo(page, 'api.fiveguesses.app');
  await toReveal(page);
  const sheet = await openSources(page);
  for (const group of new Set(CATEGORIES.map((c) => c.group))) {
    await expect(sheet.getByRole('heading', { name: group, exact: true })).toBeVisible();
  }
  for (const { label } of CATEGORIES) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toHaveCount(1);
  }
  expect(service.map((url) => url.pathname)).toEqual(['/api/sources']);
});

test('without the song service the sheet offers the built-in songs', async ({ page }) => {
  await setup(page);
  await serviceDown(page);
  await toReveal(page);
  const sheet = await openSources(page);
  await expect(sheet.getByText('The categories could not be loaded. The charts and your own songs still work.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Built-in songs' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Free play · Name the song')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
});

test('a song search that fails falls back to the built-in list and typed guesses', async ({ page }) => {
  await setup(page);
  await page.route('https://itunes.apple.com/**', (route) =>
    route.fulfill({ status: 403, contentType: 'text/plain', headers: CORS, body: 'no' })
  );
  await toReveal(page);
  await page.getByRole('button', { name: 'Play a free round' }).click();
  await combobox(page).click();
  await page.keyboard.type('zzzz qqqq');
  await expect(page.getByRole('main').getByText('Song search is unavailable right now. Type the title and press Guess.')).toBeVisible();
  await expect(liveRegion(page)).toHaveText('Song search is unavailable right now. Type the title and press Guess.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: 'Guess 1: wrong, zzzz qqqq' })).toHaveCount(1);
});

// iTunes search that finds every "Artist n Song n" entry as its own song.
async function routeEntrySearch(page: Page): Promise<URL[]> {
  const searches: URL[] = [];
  await page.route((url) => url.host === 'itunes.apple.com' && url.pathname === '/search', (route) => {
    const url = new URL(route.request().url());
    searches.push(url);
    const m = /^Artist (\d+) Song (\d+)$/.exec(url.searchParams.get('term') ?? '');
    const results = m === null ? [] : [track(9000 + Number(m[1]), `Artist ${m[1]}`, `Song ${m[2]}`)];
    const body = results.map((t) => ({ wrapperType: 'track', trackId: t.id, artistName: t.artist, trackName: t.title, previewUrl: t.previewUrl }));
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body: JSON.stringify({ results: body }) });
  });
  return searches;
}

const lines = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Artist ${i} - Song ${i}`).join('\n');

test('a pasted list is matched in the browser, every song, under the iTunes limit', async ({ page }) => {
  await setup(page);
  const searches = await routeEntrySearch(page);
  const service = requestsTo(page, 'api.fiveguesses.app');
  await toReveal(page);
  const sheet = await openSources(page);
  await sheet.getByRole('textbox', { name: 'Paste a list' }).fill(lines(25));
  await sheet.getByRole('button', { name: 'Use list' }).click();
  // 18 searches in the first minute, then the list waits for the next slot.
  await expect(sheet.getByText('Matching the songs at Apple: 18 of 25, 18 found…')).toBeVisible();
  await expect(sheet.getByText('Apple answers about 20 searches a minute', { exact: false })).toBeVisible();
  expect(searches).toHaveLength(18);
  expect(searches[0].searchParams.get('country')).toBe('AT');
  expect(searches[0].searchParams.get('term')).toMatch(/^Artist \d+ Song \d+$/);
  await page.clock.fastForward(61_000);
  await expect(sheet.getByText('25 songs found')).toBeVisible();
  expect(searches).toHaveLength(25);
  expect(service.filter((url) => url.pathname !== '/api/sources')).toEqual([]);

  await sheet.getByRole('button', { name: 'Play these songs' }).click();
  await expect(page.getByText('Free play · Your list')).toBeVisible();
});

test('a YouTube playlist comes back as entries; stopping the match keeps what was found', async ({ page }) => {
  await setup(page);
  const searches = await routeEntrySearch(page);
  const entries = Array.from({ length: 25 }, (_, i) => ({ artist: `Artist ${i}`, title: `Song ${i}` }));
  await page.route(`${API}/api/import`, (route) => route.fulfill(json({ kind: 'entries', label: 'Party', total: 25, entries })));
  await toReveal(page);
  const sheet = await openSources(page);
  await sheet.getByRole('textbox', { name: 'Playlist link' }).fill('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  await sheet.getByRole('button', { name: 'Import' }).click();
  await expect(sheet.getByText('Matching the songs at Apple: 18 of 25, 18 found…')).toBeVisible();
  await sheet.getByRole('button', { name: 'Stop and use what was found' }).click();
  await expect(sheet.getByText('18 songs found')).toBeVisible();
  expect(searches).toHaveLength(18);
  await sheet.getByRole('button', { name: 'Play these songs' }).click();
  await expect(page.getByText('Free play · Party')).toBeVisible();
});

test('an Apple Music link gives ids that the browser looks up in the link country', async ({ page }) => {
  await setup(page);
  await routeApple(page, [TAKE_ON_ME, WONDERWALL]);
  const apple = requestsTo(page, 'itunes.apple.com');
  const items = [TAKE_ON_ME, WONDERWALL].map((t) => ({ id: t.id, title: t.title }));
  await page.route(`${API}/api/import`, (route) =>
    route.fulfill(json({ kind: 'ids', label: 'Top 100: Global', country: 'US', total: 2, items }))
  );
  await toReveal(page);
  const sheet = await openSources(page);
  await sheet.getByRole('textbox', { name: 'Playlist link' }).fill('https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31');
  await sheet.getByRole('button', { name: 'Import' }).click();
  await expect(sheet.getByText('2 songs found')).toBeVisible();
  expect(apple.map((url) => [url.pathname, url.searchParams.get('country')])).toEqual([['/lookup', 'US']]);
  await sheet.getByRole('button', { name: 'Play these songs' }).click();
  await expect(page.getByText('Free play · Top 100: Global')).toBeVisible();
});

test('an Apple Music page that Apple refuses asks for the song list instead', async ({ page }) => {
  await setup(page);
  await page.route(`${API}/api/import`, (route) => route.fulfill(json({ error: 'apple_blocked' }, 502)));
  await toReveal(page);
  const sheet = await openSources(page);
  await sheet.getByRole('textbox', { name: 'Playlist link' }).fill('https://music.apple.com/at/playlist/x/pl.abc');
  await sheet.getByRole('button', { name: 'Import' }).click();
  await expect(sheet.getByText('Apple blocked this request — paste the song list instead.')).toBeVisible();
});

test('a Spotify playlist comes back as entries that the browser matches at Apple', async ({ page }) => {
  await setup(page);
  const searches = await routeEntrySearch(page);
  const entries = Array.from({ length: 3 }, (_, i) => ({ artist: `Artist ${i}`, title: `Song ${i}` }));
  const bodies: unknown[] = [];
  await page.route(`${API}/api/import`, (route) => {
    if (route.request().method() === 'POST') bodies.push(route.request().postDataJSON());
    return route.fulfill(json({ kind: 'entries', label: 'Today’s Top Hits', total: 3, entries }));
  });
  await toReveal(page);
  const sheet = await openSources(page);
  await expect(sheet.getByPlaceholder('YouTube, Apple Music or Spotify playlist link')).toBeVisible();
  const link = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc';
  await sheet.getByRole('textbox', { name: 'Playlist link' }).fill(link);
  await sheet.getByRole('button', { name: 'Import' }).click();
  await expect(sheet.getByText('3 songs found')).toBeVisible();
  expect(bodies).toEqual([{ url: link }]);
  expect(searches).toHaveLength(3);
  await sheet.getByRole('button', { name: 'Play these songs' }).click();
  await expect(page.getByText('Free play · Today’s Top Hits')).toBeVisible();
});

test('a Spotify page that Spotify refuses points to exportify.net or a pasted list', async ({ page }) => {
  await setup(page);
  await page.route(`${API}/api/import`, (route) => route.fulfill(json({ error: 'spotify_blocked' }, 502)));
  await toReveal(page);
  const sheet = await openSources(page);
  await sheet.getByRole('textbox', { name: 'Playlist link' }).fill('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
  await sheet.getByRole('button', { name: 'Import' }).click();
  await expect(
    sheet.getByText('Spotify blocked this request — export the playlist with exportify.net or paste the list instead.')
  ).toBeVisible();
});
