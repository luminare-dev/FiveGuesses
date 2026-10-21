import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  ARTWORK_HOST,
  AUDIO_HOST,
  ORIGIN,
  closeSheet,
  expect,
  expectedDailyLabel,
  goOffline,
  guess,
  liveRegion,
  openAbout,
  playButton,
  playSnippet,
  setup,
  test,
} from './fixtures';

type Manifest = { name: string; icons: { src: string }[] };

function readManifest(page: Page): Promise<Manifest> {
  return page.evaluate(async () => (await fetch('/manifest.webmanifest')).json() as Promise<Manifest>);
}

function isControlled(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.serviceWorker?.controller != null);
}

// The worker claims the page after its first activation; one reload is allowed in case it
// does not.
async function waitForControl(page: Page): Promise<void> {
  const controlled = await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (controlled) return;
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10_000 });
}

test('the shell, the saved round and the legal page open offline', async ({ page }) => {
  // The Apple stubs sit on the context, so a request the worker made itself would be stubbed too.
  const log = await setup(page, { stubScope: 'context' });
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await readManifest(page);
  expect(manifest.name).toBe('FiveGuesses');
  expect(manifest.icons).toHaveLength(4);

  const worker = await page.evaluate(async () => (await fetch('/sw.js')).text());
  expect(worker).toContain('fg-shell-');
  expect(worker).not.toContain('__PRECACHE__');
  expect(worker).not.toContain('__BUILD_ID__');

  await waitForControl(page);
  expect(await isControlled(page)).toBe(true);

  // One round online while the worker controls the page: the preview and the artwork pass
  // through it, so the cache check at the end has Apple responses that must not be there.
  const answer = expectedDailyLabel(58);
  await playSnippet(page);
  await guess(page, answer, 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  const artwork = page.getByRole('img', { name: `Album artwork for ${answer}` }).locator('img');
  await expect.poll(() => artwork.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(log.thirdPartyHosts()).toEqual([AUDIO_HOST, ARTWORK_HOST]);

  await goOffline(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  const rows = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', `Guess 1: correct, ${answer}`);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  // A free round starts offline too; its preview needs the connection.
  await page.getByRole('button', { name: 'Play a free round' }).click();
  await expect(page.getByText('Free play · Name the song')).toBeVisible();
  await playButton(page).click();
  await expect(liveRegion(page)).toHaveText('You are offline. The preview needs a connection.');
  // The About sheet's studio lockup comes from the cache too.
  const about = await openAbout(page);
  const lockup = about.locator('img');
  await expect(lockup).toHaveCount(1);
  await expect.poll(() => lockup.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await closeSheet(page);

  // Only the worker's cache knows this path (the test server answers 404), so the shell shown
  // here proves the offline fallback rather than a network answer.
  await page.goto('/some/deep/link');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');

  await page.goto('/legal/');
  await expect(page.locator('h1')).toHaveText('Privacy and legal');

  const keys = await page.evaluate(() => caches.keys());
  expect(keys.filter((key) => key.startsWith('fg-shell-'))).toHaveLength(1);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const url of cached) {
    expect(new URL(url).origin, `cached ${url}`).toBe(ORIGIN);
  }
});

// The icon files of the shell: the manifest icons and the three the page links itself.
const SHELL_ICONS = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'];

test('every icon answers 200 and the shell logs no console error', async ({ page }) => {
  await setup(page);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${message.text()} (${message.location().url})`);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  const manifest = await readManifest(page);
  expect(manifest.icons).toHaveLength(4);
  for (const url of [...manifest.icons.map((icon) => icon.src), ...SHELL_ICONS]) {
    const response = await page.request.get(url);
    expect(response.status(), url).toBe(200);
  }
  expect(consoleErrors).toEqual([]);
});

test('the stylesheets are named after their content, and the worker precaches those names', async ({ page }) => {
  await setup(page);
  const hashed: string[] = [];
  for (const path of ['/', '/legal/']) {
    await page.goto(path);
    const href = (await page.locator('link[rel="stylesheet"]').getAttribute('href')) ?? '';
    const name = /^\/(?:legal\/legal|styles)\.([0-9a-f]{32})\.css$/.exec(href);
    expect(name, `the stylesheet of ${path}: ${href}`).not.toBeNull();
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
    expect(createHash('sha256').update(await response.body()).digest('hex').slice(0, 32), href).toBe(name?.[1]);
    hashed.push(href);
  }
  // The legal page is styled by its own sheet.
  await expect(page.locator('main')).toHaveCSS('max-width', '640px');
  const worker = await (await page.request.get('/sw.js')).text();
  for (const href of hashed) expect(worker).toContain(`"${href}"`);
  expect(worker).not.toContain('"/styles.css"');
  expect(worker).not.toContain('"/legal/legal.css"');
});
