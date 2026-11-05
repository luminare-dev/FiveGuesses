// Screenshots for the visual check, not assertions: the start screen, a daily round, its result,
// the song sheet and a room lobby, at a phone, a tablet, a desktop and a landscape phone size,
// light and dark. Each shot is taken at the viewport size and, when the page scrolls, once more
// at the full height.
// Runs only with SCREENSHOTS=1 (the "screenshots" step of the web job), into screenshots/.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { combobox, expect, guess, setup, skip, test } from './fixtures';
import { FakeRoom, ROOM_CODE, serveRoomPages, TAKE_ON_ME, WONDERWALL } from './roomServer';

const OUT = resolve(__dirname, '..', 'screenshots');
const SIZES = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  // A landscape phone, for the self-review; not part of the required set.
  { width: 844, height: 390 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

test.skip(!process.env.SCREENSHOTS, 'screenshots are taken on their own, with SCREENSHOTS=1');
test.describe.configure({ mode: 'parallel' });

// The tallest scrolling box on the page: the page itself, or an open sheet.
function contentHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let tallest = document.documentElement.scrollHeight;
    for (const element of document.querySelectorAll<HTMLElement>('#root *, [role="dialog"] *')) {
      const { overflowY } = getComputedStyle(element);
      if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) {
        tallest = Math.max(tallest, element.scrollHeight + (window.innerHeight - element.clientHeight));
      }
    }
    return tallest;
  });
}

async function shoot(page: Page, name: string, size: { width: number; height: number }, scheme: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const base = `${OUT}/${name}-${size.width}x${size.height}-${scheme}`;
  await page.screenshot({ path: `${base}.png` });
  const height = await contentHeight(page);
  if (height > size.height + 8) {
    await page.setViewportSize({ width: size.width, height: Math.min(height, 4000) });
    await page.screenshot({ path: `${base}-full.png` });
    await page.setViewportSize(size);
  }
}

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test(`game screens at ${size.width}x${size.height}, ${scheme}`, async ({ page }) => {
      test.setTimeout(120_000);
      mkdirSync(OUT, { recursive: true });
      await setup(page, { colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Play the 1-second snippet' })).toBeVisible();
      await shoot(page, '1-start', size, scheme);

      await guess(page, 'Oasis – Wonderwall', 'keyboard');
      await expect(page.getByRole('listitem', { name: /^Guess 1: wrong/ })).toHaveCount(1);
      await skip(page, 1);
      await combobox(page).fill('');
      await combobox(page).focus();
      await page.keyboard.type('lady');
      await expect(page.getByRole('option').first()).toBeVisible();
      await shoot(page, '2-daily-round', size, scheme);

      await page.keyboard.press('Escape');
      await skip(page, 3);
      await expect(page.getByRole('heading', { level: 2, name: 'Out of guesses' })).toBeVisible();
      await shoot(page, '3-daily-result', size, scheme);

      await page.getByRole('button', { name: 'Choose songs' }).click();
      const sheet = page.getByRole('dialog', { name: 'Choose songs' });
      await expect(sheet.getByRole('button', { name: '1980s' })).toBeVisible();
      await shoot(page, '4-free-play-picker', size, scheme);
    });

    test(`room lobby at ${size.width}x${size.height}, ${scheme}`, async ({ page }) => {
      test.setTimeout(120_000);
      mkdirSync(OUT, { recursive: true });
      await setup(page, { colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize(size);
      const fake = await FakeRoom.create([TAKE_ON_ME, WONDERWALL]);
      await serveRoomPages(page.context());
      await fake.attach(page);
      await page.goto(`/r/${ROOM_CODE}`);
      await page.getByRole('textbox', { name: 'Your name' }).fill('Anna');
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
      fake.join('Ben');
      fake.join('Cara');
      await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(3);
      await shoot(page, '5-room-lobby', size, scheme);
    });
  }
}
