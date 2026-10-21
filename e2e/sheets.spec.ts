import { activeName, closeSheet, expect, liveRegion, openAbout, openStats, setup, skip, tabTo, test } from './fixtures';
import type { Page } from '@playwright/test';

function focusIsInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
}

function focusIsInHeader(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('[role="banner"]') !== null);
}

type FocusStep = { name: string; inDialog: boolean };
type FocusLog = { __focusLog?: FocusStep[] };

// Logs every element that gains focus from now on, with whether it sits in a dialog.
async function recordFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: FocusStep[] = [];
    (window as unknown as FocusLog).__focusLog = log;
    document.addEventListener(
      'focusin',
      (event) => {
        const element = event.target as Element;
        if ((window as unknown as FocusLog).__focusLog !== log) return;
        log.push({
          name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
          inDialog: element.closest('[role="dialog"]') !== null,
        });
      },
      true
    );
  });
}

function focusLog(page: Page): Promise<FocusStep[]> {
  return page.evaluate(() => (window as unknown as FocusLog).__focusLog ?? []);
}

test('sheets take focus, give it back, close on Escape and on the backdrop; the reset empties the stats', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/');
  // One finished round, so the reset has something to delete.
  await skip(page, 5);
  let stats = await openStats(page);
  await expect(stats.getByRole('listitem', { name: 'Played: 1', exact: true })).toHaveCount(1);
  await closeSheet(page);

  // About from the keyboard: focus moves into the dialog and comes back on Escape.
  await tabTo(page, 'About');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'About FiveGuesses' })).toBeVisible();
  await expect.poll(() => focusIsInsideDialog(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => activeName(page)).toBe('About');
  expect(await focusIsInHeader(page)).toBe(true);

  // Statistics closes on a press outside the card.
  stats = await openStats(page);
  await expect.poll(() => focusIsInsideDialog(page)).toBe(true);
  await page.mouse.click(20, 20);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openAbout(page);
  await page.getByRole('button', { name: 'Reset my data' }).click();
  await expect(page.getByText("Delete your stats, streak, today's round and theme choice from this browser?")).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(liveRegion(page)).toHaveText('Your data was deleted');
  // The new round does not pull focus away from the opener the sheet gave it back to.
  await expect.poll(() => activeName(page)).toBe('About');
  expect(await focusIsInHeader(page)).toBe(true);
  await expect(page.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);

  await page.reload();
  stats = await openStats(page);
  await expect(stats.getByRole('listitem', { name: 'Played: 0', exact: true })).toHaveCount(1);
});

test('Tab and Shift+Tab wrap between the controls of a sheet, and the reset question takes focus', async ({ page }) => {
  await setup(page);
  await page.goto('/');

  // Statistics holds one control: both directions come back to Close, never to the backdrop.
  await openStats(page);
  await expect.poll(() => activeName(page)).toBe('Close');
  for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key);
    await expect.poll(() => activeName(page)).toBe('Close');
    expect(await focusIsInsideDialog(page)).toBe(true);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => activeName(page)).toBe('Statistics');

  // About: Shift+Tab from the first link wraps to Close, Tab from Close back to the first link.
  await tabTo(page, 'About');
  await page.keyboard.press('Enter');
  const about = page.getByRole('dialog', { name: 'About FiveGuesses' });
  await expect.poll(() => activeName(page)).toBe('Luminare Development');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => activeName(page)).toBe('Close');
  await page.keyboard.press('Tab');
  await expect.poll(() => activeName(page)).toBe('Luminare Development');
  await expect(about).toBeVisible();

  // The pressed button is replaced by the question: focus goes to Cancel and comes back.
  await tabTo(page, 'Reset my data');
  await page.keyboard.press('Enter');
  await expect(about.getByText("Delete your stats, streak, today's round and theme choice from this browser?")).toBeVisible();
  await expect.poll(() => activeName(page)).toBe('Cancel');
  await page.keyboard.press('Enter');
  await expect(about.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect.poll(() => activeName(page)).toBe('Reset my data');
  expect(await focusIsInsideDialog(page)).toBe(true);
});

// The focus trap stays on until the sheet has faded out; focus sent to the opener before that is
// pulled back to the first control of the sheet, which a screen reader announces on the way out.
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`closing a sheet moves focus straight to its opener (reduced motion: ${reducedMotion})`, async ({ page }) => {
    await setup(page, { reducedMotion });
    await page.goto('/');

    // About from the header, closed with its Close button from the keyboard.
    await tabTo(page, 'About');
    await page.keyboard.press('Enter');
    await expect.poll(() => activeName(page)).toBe('Luminare Development');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => activeName(page)).toBe('Close');
    await recordFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => activeName(page)).toBe('About');
    let steps = await focusLog(page);
    expect(steps.filter((step) => step.inDialog), 'focus inside the closing About sheet').toEqual([]);
    expect(steps.at(-1)?.name).toBe('About');

    // Statistics from the header, closed with Escape.
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => activeName(page)).toBe('Statistics');
    await page.keyboard.press('Enter');
    await expect.poll(() => activeName(page)).toBe('Close');
    await recordFocus(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => activeName(page)).toBe('Statistics');
    steps = await focusLog(page);
    expect(steps.filter((step) => step.inDialog), 'focus inside the closing Statistics sheet').toEqual([]);
    expect(steps.at(-1)?.name).toBe('Statistics');
  });
}
