import type { Page } from '@playwright/test';
import { CORS, combobox, expect, liveRegion, playSnippet, setup, skip, test } from './fixtures';
import { searchAnswer, TAKE_ON_ME, WONDERWALL } from './roomServer';

const API = 'https://api.fiveguesses.app';
const SOURCES = {
  sources: [
    { id: 'chart-at', group: 'Charts', label: 'Charts Austria' },
    { id: '80s', group: 'Decades', label: '1980s' },
  ],
};

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

// The daily round lost, so the result card with its song choices is on screen.
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
  const trackRequests: URL[] = [];
  await page.route(
    (url) => url.href.startsWith(`${API}/api/tracks?`),
    (route) => {
      trackRequests.push(new URL(route.request().url()));
      return route.fulfill(json({ source: '80s', label: '1980s', tracks: [TAKE_ON_ME] }));
    }
  );
  const searches: URL[] = [];
  await page.route('https://itunes.apple.com/**', (route) => {
    searches.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body: searchAnswer([TAKE_ON_ME, WONDERWALL]) });
  });
  await toReveal(page);
  // The daily round never asks the song search.
  expect(searches).toEqual([]);

  const sheet = await openSources(page);
  await expect(sheet.getByRole('heading', { name: 'Decades' })).toBeVisible();
  await sheet.getByRole('button', { name: '1980s' }).click();
  await expect(page.getByText('Free play · 1980s')).toBeVisible();
  expect(trackRequests.map((url) => url.searchParams.get('source'))).toEqual(['80s']);
  await playSnippet(page);

  await combobox(page).click();
  await page.keyboard.type('take on');
  const option = page.getByRole('option', { name: 'a-ha – Take On Me' });
  await expect(option).toBeVisible();
  await expect(option.locator('img')).toHaveCount(1);
  await expect(liveRegion(page)).toHaveText('2 suggestions. Use the arrow keys to choose one.');
  expect(searches[searches.length - 1].searchParams.get('term')).toBe('take on');
  await option.click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(page.getByRole('img', { name: 'Album artwork for a-ha – Take On Me' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Listen on Apple Music' })).toHaveAttribute('href', TAKE_ON_ME.appleMusicUrl ?? '');
  await expect(page.getByRole('main').getByText('Previews courtesy of Apple Music')).toBeVisible();
});

test('without the song service the sheet offers the built-in songs', async ({ page }) => {
  await setup(page);
  await toReveal(page);
  const sheet = await openSources(page);
  await expect(sheet.getByText('The song lists could not be loaded. The built-in songs still work.')).toBeVisible();
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
  await expect(page.getByText('Song search is unavailable right now. Type the title and press Guess.')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: 'Guess 1: wrong, zzzz qqqq' })).toHaveCount(1);
});

test('a pasted list sends at most 30 songs for matching and plays what was found', async ({ page }) => {
  await setup(page);
  const bodies: { entries: { artist: string; title: string }[] }[] = [];
  await page.route(`${API}/api/resolve`, (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill(json({ tracks: [TAKE_ON_ME], unresolved: 29 }));
  });
  await toReveal(page);
  const sheet = await openSources(page);
  const lines = Array.from({ length: 40 }, (_, i) => `${i + 1}. Artist ${i} - Song ${i}`).join('\n');
  await sheet.getByRole('textbox', { name: 'Paste a list' }).fill(lines);
  await sheet.getByRole('button', { name: 'Use list' }).click();
  await expect(sheet.getByText('1 song found')).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].entries).toHaveLength(30);
  expect(bodies[0].entries[0]).toEqual({ artist: expect.stringMatching(/^Artist \d+$/), title: expect.stringMatching(/^Song \d+$/) });

  await sheet.getByRole('button', { name: 'Play these songs' }).click();
  await expect(page.getByText('Free play · Your list')).toBeVisible();
});
