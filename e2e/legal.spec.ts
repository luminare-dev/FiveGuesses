import { ORIGIN, expect, setup, test } from './fixtures';

// The second-level headings of the legal page, in order.
const HEADINGS = [
  'Who runs this site',
  'What this site does with your data',
  'Data stored in your browser',
  'Server logs',
  'Requests to Apple',
  'Your rights',
];

const REQUIRED_TEXT = [
  'oss@luminare.tech',
  'luminare.tech/imprint/',
  'luminare.tech/privacy/',
  'audio-ssl.itunes.apple.com',
  'Hetzner Online GmbH',
  '7 days',
  '5 weeks',
  'Datenschutzbehörde',
  'Last updated: 21 October 2026',
];

test('the legal page is static, complete and leads back to the game', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy and legal' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/legal/`);
  await expect(page.locator('h1')).toHaveText('Privacy and legal');
  expect(await page.locator('h2').allTextContents()).toEqual(HEADINGS);
  const html = await page.content();
  for (const text of REQUIRED_TEXT) {
    expect(html, text).toContain(text);
  }
  expect(await page.evaluate(() => document.scripts.length)).toBe(0);
  await page.getByRole('link', { name: 'Back to the game' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
});
