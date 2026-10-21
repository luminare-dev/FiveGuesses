import {
  clockFor,
  expect,
  expectedDailyLabel,
  guess,
  liveRegion,
  openStats,
  playButton,
  setup,
  skipButton,
  test,
} from './fixtures';

// Puzzle #12 (2026-09-05) serves Lady Gaga – Poker Face; a guess with the right artist and
// the wrong title is the partial state.
const PUZZLE = 12;

test('a lost round with a partial guess, a skip and the text fallback for sharing', async ({ page }) => {
  expect(clockFor(PUZZLE)).toBe('2026-09-05T08:00:00.000Z');
  await setup(page, { time: clockFor(PUZZLE) });
  // Neither a share sheet nor a clipboard: the result has to be shown as text.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.reject(new Error('no share sheet')),
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('no clipboard')) },
      configurable: true,
    });
  });
  await page.goto('/');
  await expect(page.getByText(`Daily #${PUZZLE} · Name the song`)).toBeVisible();
  const answer = expectedDailyLabel(PUZZLE);
  expect(answer).toBe('Lady Gaga – Poker Face');
  const rows = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem');

  await guess(page, 'shallow', 'pointer');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', 'Guess 1: right artist, wrong title, Lady Gaga – Shallow');
  await expect(rows.nth(0)).toContainText('right artist');
  await expect(liveRegion(page)).toHaveText('Right artist, wrong title. 2 seconds unlocked.');
  await expect(playButton(page)).toHaveAccessibleName('Play the 2-second snippet');

  await expect(skipButton(page)).toHaveAccessibleName('Skip · unlock 4s');
  await skipButton(page).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-label', 'Guess 2: skipped');

  await guess(page, 'Oasis – Wonderwall', 'keyboard');
  await expect(rows.nth(2)).toHaveAttribute('aria-label', 'Guess 3: wrong, Oasis – Wonderwall');
  await guess(page, 'Oasis – Wonderwall', 'keyboard');
  await expect(rows.nth(3)).toHaveAttribute('aria-label', 'Guess 4: wrong, Oasis – Wonderwall');

  // The last tier: Skip loses its unlock text and is described by the warning.
  const lastSkip = page.getByRole('button', { name: 'Skip', exact: true });
  await expect(lastSkip).toBeVisible();
  const warningId = await lastSkip.getAttribute('aria-describedby');
  expect(warningId).toBeTruthy();
  await expect(page.locator(`#${warningId}`)).toHaveText('This is your last guess');

  await guess(page, 'Oasis – Wonderwall', 'keyboard');
  await expect(rows.nth(4)).toHaveAttribute('aria-label', 'Guess 5: wrong, Oasis – Wonderwall');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Out of guesses');
  await expect(liveRegion(page)).toHaveText(`Out of guesses. The song was ${answer}.`);

  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(liveRegion(page)).toHaveText('Could not share. Copy the text below instead.');
  const block = page.getByRole('group', { name: 'Your result as text' });
  await expect(block).toBeVisible();
  expect(await block.textContent()).toBe(
    `FiveGuesses #${PUZZLE} X/5\n1s ≈ · 2s » · 4s ✕ · 8s ✕ · 16s ✕\nfiveguesses.app`
  );

  const stats = await openStats(page);
  await expect(stats.getByRole('listitem', { name: 'Played: 1', exact: true })).toHaveCount(1);
  await expect(stats.getByRole('listitem', { name: 'Current streak: 0', exact: true })).toHaveCount(1);
});

test('the right-artist hint stays in view next to a long song at 320 px', async ({ page }) => {
  await setup(page, { time: clockFor(PUZZLE) });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  const row = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem').nth(0);
  await guess(page, 'Lady Gaga – Die With A Smile', 'keyboard');
  await expect(row).toHaveAttribute('aria-label', 'Guess 1: right artist, wrong title, Lady Gaga – Die With A Smile');
  // The song gives way, the hint does not: it ends inside the row and is not cut.
  const hint = row.getByText('· right artist', { exact: true });
  await expect(hint).toBeVisible();
  const rowBox = await row.boundingBox();
  const hintBox = await hint.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(hintBox).not.toBeNull();
  expect((hintBox?.x ?? 0) + (hintBox?.width ?? 0)).toBeLessThanOrEqual((rowBox?.x ?? 0) + (rowBox?.width ?? 0));
  expect(await hint.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
