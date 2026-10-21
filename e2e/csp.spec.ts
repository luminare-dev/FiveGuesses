import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeSheet, expect, expectedDailyLabel, guess, liveRegion, openAbout, openStats, playSnippet, setup, test } from './fixtures';

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
