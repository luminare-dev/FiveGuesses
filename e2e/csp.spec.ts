import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import {
  CORS,
  closeSheet,
  combobox,
  expect,
  expectedDailyLabel,
  guess,
  liveRegion,
  openAbout,
  openStats,
  playSnippet,
  setup,
  test,
} from './fixtures';
import { FakeRoom, ROOM_CODE, searchAnswer, serveRoomPages, TAKE_ON_ME } from './roomServer';

// The policy the apache host sends, read from the file that ships it.
const HTACCESS = readFileSync(resolve(__dirname, '..', 'public', '.htaccess'), 'utf8');
const POLICY = /Content-Security-Policy "([^"]+)"/.exec(HTACCESS)?.[1];

test('a full round and both sheets raise no violation under the shipped policy', async ({ page }) => {
  expect(POLICY, 'the policy in public/.htaccess').toBeTruthy();
  const csp = POLICY as string;
  await setup(page);
  // Every response from the test server carries the header, as the host would send it.
  await page.route('http://127.0.0.1:4173/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.addInitScript(() => {
    const collector = window as unknown as { __csp: string[] };
    collector.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      collector.__csp.push(
        `${event.violatedDirective}: blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}` +
          (event.sample ? ` sample "${event.sample}"` : '')
      );
    });
  });
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  const violations = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(csp);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  // Checked once after the first paint, so a violation is reported with its source before
  // any later step fails for a less direct reason.
  expect(await violations(), 'violations after the first paint').toEqual([]);

  await playSnippet(page, 1);
  const answer = expectedDailyLabel(58);
  await guess(page, 'Oasis – Wonderwall', 'keyboard');
  await expect(liveRegion(page)).toHaveText('Wrong guess. 2 seconds unlocked.');
  await playSnippet(page, 2);
  await guess(page, answer, 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(page.getByRole('img', { name: `Album artwork for ${answer}` }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(liveRegion(page)).toHaveText('Copied to clipboard');

  await openStats(page);
  await closeSheet(page);
  await openAbout(page);
  await closeSheet(page);

  expect(await violations(), 'violations after the round and both sheets').toEqual([]);
  expect(consoleMessages.filter((text) => text.includes('Content Security Policy'))).toEqual([]);
});

// Every page of the test server carries the policy; violations are collected in the page.
async function enforce(page: Page, csp: string): Promise<() => Promise<string[]>> {
  await page.route('http://127.0.0.1:4173/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.addInitScript(() => {
    const collector = window as unknown as { __csp: string[] };
    collector.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      collector.__csp.push(`${event.violatedDirective}: blocked ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test('a room round with the live song search raises no violation under the shipped policy', async ({ page }) => {
  const csp = POLICY as string;
  expect(csp).toContain("connect-src 'self' https://itunes.apple.com https://api.fiveguesses.app wss://api.fiveguesses.app;");
  expect(csp).toContain("img-src 'self' data: https://*.mzstatic.com;");
  await setup(page);
  const violations = await enforce(page, csp);
  // Registered last, so it answers the room path before the route above.
  await serveRoomPages(page, { 'content-security-policy': csp });
  const fake = await FakeRoom.create([TAKE_ON_ME]);
  await fake.attach(page);
  await page.route('https://itunes.apple.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body: searchAnswer([TAKE_ON_ME]) })
  );

  const response = await page.goto(`/r/${ROOM_CODE}`);
  expect(response?.headers()['content-security-policy']).toBe(csp);
  await page.getByRole('textbox', { name: 'Your name' }).fill('Anna');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 of 1' })).toBeVisible();
  await combobox(page).click();
  await page.keyboard.type('take on');
  const option = page.getByRole('option', { name: 'a-ha – Take On Me' });
  await expect(option.locator('img')).toHaveCount(1);
  await option.click();
  await expect(page.getByRole('main').getByRole('link', { name: 'Listen on Apple Music' })).toBeVisible();
  expect(await violations(), 'violations in the room').toEqual([]);
});
