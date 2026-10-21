import { expect, expectedDailyLabel, guess, liveRegion, setup, skip, test } from './fixtures';

test('the next puzzle arrives at local midnight without a reload', async ({ page }) => {
  // 23:59:55 in Vienna on 2026-10-21; puzzle #59 starts five seconds later.
  await setup(page, { time: '2026-10-21T21:59:55Z' });
  await page.goto('/');
  await expect(page.getByText('Daily #58 · Name the song')).toBeVisible();
  await skip(page, 5);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
  await expect(page.getByRole('timer').first()).toHaveText(/00:00:0[0-5]/);

  // Through midnight in tenths of a second: until the new board is there, the finished one never
  // shows a whole day to go.
  const shown: string[] = [];
  for (let step = 0; step < 100; step++) {
    await page.clock.runFor(100);
    shown.push(...(await page.getByRole('timer').allTextContents()));
  }
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.filter((text) => !/^Next song in 00:00:0\d$/.test(text))).toEqual([]);
  await expect(page.getByText('Daily #59 · Name the song')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(liveRegion(page)).toHaveText('A new daily song is ready');

  const answer = expectedDailyLabel(59);
  expect(answer).toBe('Bomfunk MC’s – Freestyler');
  await guess(page, answer, 'keyboard');
  const rows = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', `Guess 1: correct, ${answer}`);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(liveRegion(page)).toHaveText(`Correct! The song was ${answer}.`);
});
