import type { Page } from '@playwright/test';
import { expect, openStats, setup, test } from './fixtures';

async function pageWidths(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}

async function heightOf(page: Page, name: string | RegExp): Promise<number> {
  const box = await page.getByRole('button', { name }).boundingBox();
  return box?.height ?? 0;
}

test('one 328 px column without horizontal scroll at 360 px', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  const { scrollWidth, innerWidth } = await pageWidths(page);
  expect(innerWidth).toBe(360);
  expect(scrollWidth).toBeLessThanOrEqual(360);
  expect((await main.boundingBox())?.width).toBe(328);
  expect(await heightOf(page, /^Skip/)).toBeGreaterThanOrEqual(44);
  expect(await heightOf(page, 'Guess')).toBeGreaterThanOrEqual(44);
  // Sora with the kit's fallbacks, so the text stays sans-serif while the font loads.
  for (const text of [page.getByRole('heading', { level: 1 }), page.getByRole('button', { name: 'Guess' })]) {
    expect(await text.evaluate((element) => getComputedStyle(element.firstElementChild ?? element).fontFamily)).toBe(
      'Sora, system-ui, sans-serif'
    );
  }
  const footer = page.getByRole('contentinfo');
  for (const target of [footer.getByRole('button', { name: 'About' }), footer.getByRole('link', { name: 'Privacy and legal' })]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('a centred 480 px column and a 480 px sheet card at 1024 px', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  const { scrollWidth, innerWidth } = await pageWidths(page);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  const box = await main.boundingBox();
  expect(box?.width).toBe(480);
  expect(box?.x).toBe((1024 - 480) / 2);
  expect(await heightOf(page, /^Skip/)).toBeGreaterThanOrEqual(44);
  expect(await heightOf(page, 'Guess')).toBeGreaterThanOrEqual(44);

  const dialog = await openStats(page);
  // The card is the outermost ancestor of the title that is narrower than the dialog layer.
  const cardWidth = await dialog.evaluate((root) => {
    const layerWidth = root.getBoundingClientRect().width;
    let card = -1;
    let element = root.querySelector('h2')?.parentElement ?? null;
    while (element !== null && element !== root) {
      const width = element.getBoundingClientRect().width;
      if (width < layerWidth) card = width;
      element = element.parentElement;
    }
    return card;
  });
  expect(cardWidth).toBe(480);
});
