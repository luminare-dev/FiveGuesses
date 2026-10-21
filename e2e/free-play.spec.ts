import { dailySongIndex } from '../src/game';
import {
  SONG_COUNT,
  activeName,
  closeSheet,
  expect,
  expectedDailyLabel,
  liveRegion,
  openStats,
  setup,
  skip,
  test,
} from './fixtures';

const ARTWORK_NAME = /^Album artwork for /;

test('free rounds stay away from the daily song, never repeat and leave the stats alone', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const daily = expectedDailyLabel(58);

  await skip(page, 5);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
  await expect.poll(() => activeName(page)).toBe('Out of guesses');
  await expect(page.getByRole('img', { name: `Album artwork for ${daily}` })).toBeVisible();

  const revealed: string[] = [];
  for (let round = 1; round <= 3; round++) {
    await page.getByRole('button', { name: 'Play a free round' }).click();
    await expect(page.getByText('Free play · Name the song')).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
    // The result card is gone; focus starts the new round at the play button.
    await expect.poll(() => activeName(page)).toBe('Play the 1-second snippet');
    await skip(page, 5);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
    await expect.poll(() => activeName(page)).toBe('Out of guesses');
    await expect(page.getByRole('button', { name: 'Share result' })).toHaveCount(0);
    const artwork = page.getByRole('img', { name: ARTWORK_NAME });
    await expect(artwork).toBeVisible();
    const name = (await artwork.getAttribute('aria-label')) ?? '';
    revealed.push(name.replace(ARTWORK_NAME, ''));
  }
  expect(new Set(revealed).size).toBe(3);
  expect(revealed).not.toContain(daily);

  const stats = await openStats(page);
  await expect(stats.getByRole('listitem', { name: 'Played: 1', exact: true })).toHaveCount(1);
  await closeSheet(page);

  await page.getByRole('button', { name: "Back to today's round" }).click();
  await expect(page.getByText('Daily #58 · Name the song')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
  await expect.poll(() => activeName(page)).toBe('Out of guesses');
  await expect(page.getByRole('img', { name: `Album artwork for ${daily}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
});

test('a free round whose song becomes the next daily song is replaced at midnight', async ({ page }) => {
  // 23:59 in Vienna. The pinned random number makes the free round pick the song that is the
  // daily song of #59 one minute later (only #58's daily song is left out of the pick).
  await setup(page, { time: '2026-10-21T21:59:00Z' });
  const candidates = [...Array(SONG_COUNT).keys()].filter((i) => i !== dailySongIndex(58, SONG_COUNT));
  const random = (candidates.indexOf(dailySongIndex(59, SONG_COUNT)) + 0.5) / candidates.length;
  await page.addInitScript((value) => {
    Math.random = () => value;
  }, random);
  await page.goto('/');
  const next = expectedDailyLabel(59);

  await skip(page, 5);
  await page.getByRole('button', { name: 'Play a free round' }).click();
  await expect(page.getByText('Free play · Name the song')).toBeVisible();
  await skip(page, 1);

  await page.clock.runFor(70_000);
  await expect(liveRegion(page)).toHaveText('A new daily song is ready');
  await expect(page.getByText('Free play · Name the song')).toBeVisible();
  // A new free round: the skip of the old one is gone.
  await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
  await skip(page, 5);
  const artwork = page.getByRole('img', { name: ARTWORK_NAME });
  await expect(artwork).toBeVisible();
  expect(await artwork.getAttribute('aria-label')).not.toBe(`Album artwork for ${next}`);

  await page.getByRole('button', { name: "Back to today's round" }).click();
  await expect(page.getByText('Daily #59 · Name the song')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
});
