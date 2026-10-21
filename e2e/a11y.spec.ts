import { AxeBuilder } from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import {
  activeName,
  closeSheet,
  combobox,
  expect,
  expectedDailyLabel,
  goOffline,
  guess,
  liveRegion,
  openAbout,
  openStats,
  playButton,
  setup,
  skipButton,
  test,
} from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// The active-row colour: Lumen on dark, Royal on light.
const DARK_ACTIVE_ROW = 'rgb(91, 223, 255)';
const LIGHT_ACTIVE_ROW = 'rgb(31, 71, 196)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

type Heard = { __heard?: string[]; __heardObserver?: MutationObserver };

// Logs every text the live region shows from now on (the empty step before each message is left
// out), so a message that is announced twice or overwritten is seen.
async function recordAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as unknown as Heard;
    scope.__heardObserver?.disconnect();
    const region = document.querySelector('[role="status"]');
    const heard: string[] = [];
    const observer = new MutationObserver(() => {
      const text = region?.textContent ?? '';
      if (text !== '') heard.push(text);
    });
    if (region !== null) observer.observe(region, { subtree: true, childList: true, characterData: true });
    scope.__heard = heard;
    scope.__heardObserver = observer;
  });
}

function announcements(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as Heard).__heard ?? []);
}

// Waits on the page's own clock, so every timer due within this time has fired by the end.
function runPageTimers(page: Page, ms: number): Promise<void> {
  return page.evaluate((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay)), ms);
}

// A system colour as this browser resolves it, to compare with computed styles.
function systemColour(page: Page, keyword: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('div');
    probe.style.setProperty('forced-color-adjust', 'none');
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  }, keyword);
}

// Serious and critical findings fail the test; the rest is printed for the record.
async function audit(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = results.violations.filter((v) => !serious.includes(v));
  if (minor.length > 0) {
    console.log(`axe (${state}), not serious: ${minor.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`).join(', ')}`);
  }
  expect(
    serious.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `axe (${state})`
  ).toEqual([]);
}

test('axe finds no serious or critical issue in any state', async ({ page }) => {
  await setup(page, { colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  await audit(page, 'main, light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await audit(page, 'main, dark');

  await combobox(page).focus();
  await page.keyboard.type('la');
  await expect(page.getByRole('listbox', { name: 'Matching songs' })).toBeVisible();
  await audit(page, 'listbox open');
  // The input keeps focus, so the highlighted option shows a border of its own besides the fill.
  await page.keyboard.press('ArrowDown');
  const options = page.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toHaveCSS('border-top-color', DARK_ACTIVE_ROW);
  await expect(options.nth(1)).toHaveCSS('border-top-color', TRANSPARENT);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(options.first()).toHaveCSS('border-top-color', LIGHT_ACTIVE_ROW);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.keyboard.press('Escape');

  await guess(page, expectedDailyLabel(58), 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await audit(page, 'reveal');

  await openStats(page);
  await audit(page, 'statistics open');
  await closeSheet(page);

  await openAbout(page);
  await audit(page, 'about open');
  await closeSheet(page);
});

test('every control has a role and a name', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play the 1-second snippet' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Your guess' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guess', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip · unlock 2s' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your guesses' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Luminare Development, project page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy and legal' })).toBeVisible();
  // The footer links are underlined, not told apart from the text around them by colour alone.
  const footer = page.getByRole('contentinfo');
  for (const target of [
    footer.getByRole('link', { name: 'Luminare Development, project page' }),
    footer.getByRole('button', { name: 'About' }).getByText('About', { exact: true }),
    footer.getByRole('link', { name: 'Privacy and legal' }),
  ]) {
    await expect(target).toHaveCSS('text-decoration-line', 'underline');
  }

  await openStats(page);
  await expect(page.getByRole('dialog', { name: 'Statistics' })).toBeVisible();
  await closeSheet(page);
  await openAbout(page);
  await expect(page.getByRole('dialog', { name: 'About FiveGuesses' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Luminare Development' })).toHaveCount(1);
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  await closeSheet(page);

  const answer = expectedDailyLabel(58);
  await guess(page, answer, 'keyboard');
  // One image node for the artwork: the picture inside the named wrapper is hidden.
  const artwork = page.getByRole('img', { name: `Album artwork for ${answer}` });
  await expect(artwork).toHaveCount(1);
  await expect(artwork).toBeVisible();
  await expect(page.getByRole('timer').first()).toBeVisible();
  // One h1, then the h2 of the reveal: no level is skipped.
  expect(await page.getByRole('heading').evaluateAll((nodes) => nodes.map((node) => node.tagName))).toEqual(['H1', 'H2']);
});

test('six Tabs from the page start reach the footer link while Guess is disabled', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Guess', exact: true })).toBeDisabled();
  const stops: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    stops.push(await activeName(page));
  }
  expect(stops).toEqual([
    'Statistics',
    'About',
    'Play the 1-second snippet',
    'Your guess',
    'Skip · unlock 2s',
    'Luminare Development, project page',
  ]);
});

test('a pointer resting where the list opens picks nothing; only the keys move the highlight', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const input = combobox(page);
  const rows = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem');
  // The pointer stays on Skip, which is where the list opens once the box has text.
  await skipButton(page).click();
  await expect(rows.nth(0)).toHaveAttribute('aria-label', 'Guess 1: skipped');
  await page.keyboard.press('Shift+Tab');
  expect(await activeName(page)).toBe('Your guess');
  await page.keyboard.type('lady');
  await expect(liveRegion(page)).toHaveText('3 suggestions. Use the arrow keys to choose one.');
  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
  // Several matches and none chosen: Enter guesses nothing.
  await page.keyboard.press('Enter');
  await expect(liveRegion(page)).toHaveText('No matching song');
  await expect(rows.nth(1)).toHaveAttribute('aria-label', 'Guess 2: your next guess');

  // A real pointer move tints the option but does not choose it; the arrow keys do.
  await options.nth(1).hover();
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', /^guess-option-\d+$/);
});

test('the highlighted suggestion is scrolled into view on a short screen', async ({ page }) => {
  await setup(page);
  // A phone with the on-screen keyboard up.
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  await combobox(page).focus();
  await page.keyboard.type('la');
  const options = page.getByRole('option');
  await expect(options.first()).toBeAttached();
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toBeInViewport({ ratio: 0.9 });
  await page.keyboard.press('End');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await expect(options.last()).toBeInViewport({ ratio: 0.9 });
  await page.keyboard.press('Home');
  await expect(options.first()).toBeInViewport({ ratio: 0.9 });
});

test('a suggestion count still waiting gives way to Enter, Escape, a skip and Tab', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const input = combobox(page);
  await expect(input).toBeVisible();
  // Each action follows the text at once, well inside the 300 ms the count waits for.
  const cases: { text: string; action: string; act: () => Promise<void>; heard: string[] }[] = [
    // Several matches and none chosen: the verdict stays and is not replaced by the count.
    { text: 'lady', action: 'Enter', act: () => page.keyboard.press('Enter'), heard: ['No matching song'] },
    // No match at all: the verdict is heard once, not a second time when the count was due.
    { text: 'zzzq', action: 'Enter', act: () => page.keyboard.press('Enter'), heard: ['No matching song'] },
    // The list is closed: nothing tells the player to use the arrow keys on it.
    { text: 'lady', action: 'Escape', act: () => page.keyboard.press('Escape'), heard: [] },
    // A skip by pointer: its own message is the last word.
    { text: 'lady', action: 'Skip', act: () => skipButton(page).click(), heard: ['Skipped. 2 seconds unlocked.'] },
    // Focus has left the box.
    { text: 'lady', action: 'Tab', act: () => page.keyboard.press('Tab'), heard: [] },
  ];
  for (const { text, action, act, heard } of cases) {
    await input.fill('');
    await input.focus();
    await recordAnnouncements(page);
    await input.fill(text);
    await act();
    await runPageTimers(page, 700);
    expect(await announcements(page), `${text}, then ${action}`).toEqual(heard);
  }
  expect(await activeName(page)).toBe('Skip · unlock 4s');
});

test('a suggestion count already heard is taken back once the list closes, the box empties or focus leaves', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/');
  const input = combobox(page);
  await expect(input).toBeVisible();
  const press = (key: string, times = 1) => async () => {
    for (let i = 0; i < times; i++) await page.keyboard.press(key);
  };
  const cases: { text: string; heard: string | RegExp; action: string; act: () => Promise<void> }[] = [
    // The list closes and keeps the text.
    { text: 'lady', heard: '3 suggestions. Use the arrow keys to choose one.', action: 'Escape', act: press('Escape') },
    // No list to close: Escape clears the box, and the verdict goes with the text.
    { text: 'zzzq', heard: 'No matching song', action: 'Escape', act: press('Escape') },
    { text: 'zzzq', heard: 'No matching song', action: 'Backspace to an empty box', act: press('Backspace', 4) },
    // One letter is no query: no list, no count.
    {
      text: 'la',
      heard: /^\d suggestions\. Use the arrow keys to choose one\.$/,
      action: 'Backspace',
      act: press('Backspace'),
    },
    { text: 'lady', heard: '3 suggestions. Use the arrow keys to choose one.', action: 'Tab', act: press('Tab') },
  ];
  for (const { text, heard, action, act } of cases) {
    await input.fill('');
    await input.focus();
    await page.keyboard.type(text);
    await expect(liveRegion(page), `${text}, before ${action}`).toHaveText(heard);
    await act();
    await expect(liveRegion(page), `${text}, then ${action}`).toHaveText('');
  }
  expect(await activeName(page)).toBe('Skip · unlock 2s');
});

test('every press of play while offline is answered, also after a guess was announced', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(combobox(page)).toBeVisible();
  await goOffline(page);
  const offline = 'You are offline. The preview needs a connection.';
  await playButton(page).click();
  await expect(liveRegion(page)).toHaveText(offline);
  await guess(page, 'Oasis – Wonderwall', 'keyboard');
  await expect(liveRegion(page)).toHaveText('Wrong guess. 2 seconds unlocked.');
  // The bar still shows the notice; the next press says it again, and so does the one after.
  await recordAnnouncements(page);
  await playButton(page).click();
  await expect(liveRegion(page)).toHaveText(offline);
  await playButton(page).click();
  await expect.poll(() => announcements(page)).toEqual([offline, offline]);
  await expect(page.getByRole('main').getByText(offline)).toBeVisible();
});

test('in forced-colours mode the highlighted suggestion, the chosen theme and the progress stay visible', async ({
  page,
}) => {
  await setup(page, { colorScheme: 'light' });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  const highlight = await systemColour(page, 'Highlight');
  const highlightText = await systemColour(page, 'HighlightText');
  const canvas = await systemColour(page, 'Canvas');
  expect(highlight).not.toBe(canvas);
  const textColour = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element.firstElementChild ?? element).color);

  // The input keeps focus, so the highlighted option has to stand out by itself; the others
  // carry no outline.
  await combobox(page).focus();
  await page.keyboard.type('la');
  await page.keyboard.press('ArrowDown');
  const options = page.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toHaveCSS('background-color', highlight);
  await expect(options.first()).toHaveCSS('border-top-color', highlight);
  expect(await textColour(options.first())).toBe(highlightText);
  await expect(options.nth(1)).toHaveCSS('border-top-color', canvas);
  await expect(options.nth(1)).not.toHaveCSS('background-color', highlight);
  await page.keyboard.press('Escape');

  // The progress fill is drawn in the highlight colour, not in the page colour of the track.
  await expect(page.locator('#snippet-progress-fill')).toHaveCSS('background-color', highlight);
  await expect(page.getByRole('progressbar')).not.toHaveCSS('background-color', highlight);

  // The filled buttons lose their fill, so they keep a visible outline like the outlined ones.
  for (const button of [page.getByRole('button', { name: 'Guess' }), playButton(page)]) {
    await expect(button).toHaveCSS('border-top-width', '1px');
    await expect(button).not.toHaveCSS('border-top-color', canvas);
    await expect(button).not.toHaveCSS('border-top-color', TRANSPARENT);
  }

  // The chosen theme: highlight fill and a check mark; the others neither.
  await openAbout(page);
  const chosen = page.getByRole('radio', { name: 'System' });
  const other = page.getByRole('radio', { name: 'Light' });
  await expect(chosen).toHaveAttribute('aria-checked', 'true');
  await expect(chosen).toHaveCSS('background-color', highlight);
  expect(await textColour(chosen)).toBe(highlightText);
  await expect(chosen.locator('[aria-hidden="true"]')).toHaveText(/^✓\s*$/);
  await expect(other).not.toHaveCSS('background-color', highlight);
  await expect(other.locator('[aria-hidden="true"]')).toHaveCount(0);
  await other.click();
  await expect(other).toHaveCSS('background-color', highlight);
  await expect(other.locator('[aria-hidden="true"]')).toHaveText(/^✓\s*$/);
  await expect(chosen.locator('[aria-hidden="true"]')).toHaveCount(0);
  await closeSheet(page);
});
