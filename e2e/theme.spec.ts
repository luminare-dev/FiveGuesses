import { closeSheet, expect, openAbout, setup, tabTo, test } from './fixtures';
import type { Page } from '@playwright/test';

// Mist and Night from the kit, as the browser reports them.
const LIGHT_BACKGROUND = 'rgb(243, 246, 251)';
const DARK_BACKGROUND = 'rgb(10, 18, 36)';
// Royal on light, Mint on dark.
const LIGHT_FOCUS_RING = 'rgb(31, 71, 196)';
const DARK_FOCUS_RING = 'rgb(6, 242, 196)';
// The same two backgrounds as the theme-color metas carry them.
const LIGHT_THEME_COLOR = '#F3F6FB';
const DARK_THEME_COLOR = '#0A1224';

// The colour the browser gives its title bar: the first theme-color meta whose media matches.
function themeColor(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const meta of Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))) {
      const media = meta.getAttribute('media');
      if (media === null || matchMedia(media).matches) return meta.content.toUpperCase();
    }
    return null;
  });
}

function outlineColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    return element === null ? '' : getComputedStyle(element).outlineColor;
  });
}

test('the theme follows the system setting and a stored choice survives a reload', async ({ page }) => {
  await setup(page, { colorScheme: 'light' });
  await page.goto('/');
  const body = page.locator('body');
  const html = page.locator('html');
  await expect(body).toHaveCSS('background-color', LIGHT_BACKGROUND);
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => themeColor(page)).toBe(LIGHT_THEME_COLOR);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(body).toHaveCSS('background-color', DARK_BACKGROUND);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => themeColor(page)).toBe(DARK_THEME_COLOR);

  // A manual choice reaches the browser's title bar too, against the system setting.
  await openAbout(page);
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await expect(body).toHaveCSS('background-color', LIGHT_BACKGROUND);
  await expect.poll(() => themeColor(page)).toBe(LIGHT_THEME_COLOR);
  await closeSheet(page);

  // The stored choice wins over the dark system setting after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  await expect(body).toHaveCSS('background-color', LIGHT_BACKGROUND);
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => themeColor(page)).toBe(LIGHT_THEME_COLOR);

  await openAbout(page);
  await page.getByRole('radio', { name: 'System' }).click();
  await expect(body).toHaveCSS('background-color', DARK_BACKGROUND);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => themeColor(page)).toBe(DARK_THEME_COLOR);
  await closeSheet(page);

  await tabTo(page, 'Play the 1-second snippet');
  expect(await outlineColor(page)).toBe(DARK_FOCUS_RING);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(body).toHaveCSS('background-color', LIGHT_BACKGROUND);
  expect(await outlineColor(page)).toBe(LIGHT_FOCUS_RING);
  await expect.poll(() => themeColor(page)).toBe(LIGHT_THEME_COLOR);

  // Dark chosen while the system is light: the title bar is dark as well.
  await openAbout(page);
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(body).toHaveCSS('background-color', DARK_BACKGROUND);
  await expect.poll(() => themeColor(page)).toBe(DARK_THEME_COLOR);
  await closeSheet(page);
});

test('Space chooses the focused theme radio and does not scroll the sheet', async ({ page }) => {
  await setup(page);
  // Low enough that the About card scrolls.
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto('/');
  const about = await openAbout(page);
  const scrollTop = () =>
    about.evaluate((root) => {
      let element = root.querySelector('h2')?.parentElement ?? null;
      while (element !== null && element !== root) {
        if (element.scrollHeight > element.clientHeight + 1) return element.scrollTop;
        element = element.parentElement;
      }
      return -1;
    });
  const dark = page.getByRole('radio', { name: 'Dark' });
  await dark.focus();
  const before = await scrollTop();
  expect(before).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Space');
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'false');
  expect(await scrollTop()).toBe(before);
  await closeSheet(page);
});
