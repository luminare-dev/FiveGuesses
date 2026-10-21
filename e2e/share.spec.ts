import type { Page } from '@playwright/test';
import { expect, expectedDailyLabel, guess, liveRegion, setup, test } from './fixtures';

const LADDER = 'FiveGuesses #58 1/5\n1s ✓\nfiveguesses.app';

async function winFirstGuess(page: Page): Promise<void> {
  await page.goto('/');
  await guess(page, expectedDailyLabel(58), 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
}

test('the result goes to the share sheet when the browser has one', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      value: (data: unknown) => {
        (window as unknown as { __shared: unknown }).__shared = data;
        return Promise.resolve();
      },
      configurable: true,
    });
  });
  await winFirstGuess(page);
  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(liveRegion(page)).toHaveText('Shared');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string } }).__shared);
  expect(shared.text).toBe(LADDER);
});

test('the result goes to the clipboard when there is no share sheet', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await winFirstGuess(page);
  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(liveRegion(page)).toHaveText('Copied to clipboard');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LADDER);
});

test('dismissing the share sheet shares nothing and copies nothing', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const state = window as unknown as { __shareCalls: number };
    state.__shareCalls = 0;
    Object.defineProperty(navigator, 'share', {
      value: () => {
        state.__shareCalls += 1;
        // The first sheet is dismissed, the second one shares.
        return state.__shareCalls === 1
          ? Promise.reject(new DOMException('Share canceled', 'AbortError'))
          : Promise.resolve();
      },
      configurable: true,
    });
  });
  await winFirstGuess(page);
  const won = `Correct! The song was ${expectedDailyLabel(58)}.`;
  await expect(liveRegion(page)).toHaveText(won);
  await page.evaluate(() => navigator.clipboard.writeText('untouched'));

  await page.getByRole('button', { name: 'Share result' }).click();
  await page.waitForFunction(() => (window as unknown as { __shareCalls: number }).__shareCalls === 1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');
  await expect(liveRegion(page)).toHaveText(won);
  await expect(page.getByText('Copied to clipboard')).toHaveCount(0);

  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(liveRegion(page)).toHaveText('Shared');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');
});
