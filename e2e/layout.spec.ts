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

// The width of the dialog's card: the outermost ancestor of the title narrower than the layer.
function sheetCardWidth(dialog: ReturnType<Page['getByRole']>): Promise<number> {
  return dialog.evaluate((root) => {
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
}

test('the modes sit beside the game and the page is centred at 1024 px, with a 520 px sheet card', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  const { scrollWidth, innerWidth } = await pageWidths(page);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  const box = await main.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  // Centred: the same gutter on both sides.
  expect(Math.abs(box.x - (1024 - box.x - box.width))).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThan(900);
  // Two columns: the modes on the left, the game on the right, both starting at the top.
  const modes = await page.getByRole('navigation', { name: 'Game modes' }).boundingBox();
  const game = await page.getByRole('list', { name: 'Your guesses' }).boundingBox();
  expect(modes !== null && game !== null).toBe(true);
  if (modes === null || game === null) return;
  expect(modes.x).toBeCloseTo(box.x, 0);
  expect(game.x).toBeGreaterThan(modes.x + modes.width);
  expect(game.width).toBeGreaterThan(560);
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  expect(await heightOf(page, /^Skip/)).toBeGreaterThanOrEqual(44);
  expect(await heightOf(page, 'Guess')).toBeGreaterThanOrEqual(44);

  const dialog = await openStats(page);
  expect(await sheetCardWidth(dialog)).toBe(520);
});

test('the page grows to 1080 px and the text grows with it at 1440 px', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  const box = await main.boundingBox();
  expect(box?.width).toBe(1080);
  expect(box?.x).toBe((1440 - 1080) / 2);
  const size = (element: ReturnType<Page['getByRole']>) =>
    element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(await size(page.getByRole('heading', { level: 1 }))).toBeCloseTo(32, 0);
  await page.setViewportSize({ width: 360, height: 740 });
  await expect.poll(() => size(page.getByRole('heading', { level: 1 }))).toBeCloseTo(21, 0);
});

test('a landscape phone gets both columns, 44 px targets and no horizontal scroll', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  const { scrollWidth, innerWidth } = await pageWidths(page);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  const modes = await page.getByRole('navigation', { name: 'Game modes' }).boundingBox();
  const game = await page.getByRole('list', { name: 'Your guesses' }).boundingBox();
  expect(modes !== null && game !== null && game.x > modes.x + modes.width).toBe(true);
  for (const name of ['Daily song', 'Free play', 'Choose songs', 'Play with friends', 'Statistics']) {
    expect(await heightOf(page, name)).toBeGreaterThanOrEqual(44);
  }
});

test('the four modes fit two by two with 44 px targets at 320 px', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  const { scrollWidth } = await pageWidths(page);
  expect(scrollWidth).toBeLessThanOrEqual(320);
  const boxes = [];
  for (const name of ['Daily song', 'Free play', 'Choose songs', 'Play with friends']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    boxes.push(box);
  }
  // Two rows of two.
  expect(boxes[0]?.y).toBe(boxes[1]?.y);
  expect(boxes[2]?.y).toBe(boxes[3]?.y);
  expect((boxes[2]?.y ?? 0) > (boxes[0]?.y ?? 0)).toBe(true);
});
