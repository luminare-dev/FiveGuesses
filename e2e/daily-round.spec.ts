import {
  ALLOWED_THIRD_PARTY_HOSTS,
  AUDIO_HOST,
  activeName,
  awaitSnippet,
  closeSheet,
  combobox,
  expect,
  expectedDailyLabel,
  guess,
  liveRegion,
  openStats,
  playButton,
  playSnippet,
  setup,
  silentWav,
  skip,
  skipButton,
  test,
} from './fixtures';

// The page's handle on the audio element the app plays, kept by an init script so the test can
// act like a media key or the system's media controls.
type PreviewWindow = Window & { preview: HTMLMediaElement };

test('a daily round is won with the keyboard alone', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FiveGuesses');
  await expect(page.getByText('Daily #58 · Name the song')).toBeVisible();
  const answer = expectedDailyLabel(58);
  expect(answer).toBe('Olivia Rodrigo – drivers license');

  // Three Tabs from the page start: Statistics, About, play.
  for (const name of ['Statistics', 'About', 'Play the 1-second snippet']) {
    await page.keyboard.press('Tab');
    expect(await activeName(page)).toBe(name);
  }
  // Nothing has been asked of Apple before the play press.
  expect(log.thirdPartyHosts()).toEqual([]);

  await page.keyboard.press('Space');
  const bar = page.getByRole('progressbar', { name: 'Snippet progress' });
  await expect(bar).toHaveAttribute('aria-valuemax', '1');
  await page.waitForFunction(
    () => Number(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')) > 0,
    null,
    { timeout: 5_000 }
  );
  await awaitSnippet(page, 1);
  expect(log.thirdPartyHosts()).toEqual([AUDIO_HOST]);

  await page.keyboard.press('Tab');
  expect(await activeName(page)).toBe('Your guess');
  await page.keyboard.type('driver');
  const input = combobox(page);
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /^guess-option-\d+$/);
  await page.keyboard.press('Enter');

  const rows = page.getByRole('list', { name: 'Your guesses' }).getByRole('listitem');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', `Guess 1: correct, ${answer}`);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(liveRegion(page)).toHaveText(`Correct! The song was ${answer}.`);
  // The guess box is gone; focus moves to the result heading and continues into the card.
  await expect.poll(() => activeName(page)).toBe('Correct!');
  await page.keyboard.press('Tab');
  expect(await activeName(page)).toBe('Listen on Apple Music');
  await expect(page.getByRole('img', { name: `Album artwork for ${answer}` })).toBeVisible();
  for (const host of log.thirdPartyHosts()) {
    expect(ALLOWED_THIRD_PARTY_HOSTS, `third-party host ${host}`).toContain(host);
  }

  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', `Guess 1: correct, ${answer}`);

  const stats = await openStats(page);
  for (const name of ['Played: 1', 'Current streak: 1', 'Won on guess 1: 1']) {
    await expect(stats.getByRole('listitem', { name, exact: true })).toHaveCount(1);
  }
  await closeSheet(page);
  await expect(page.getByRole('timer').first()).toHaveText(/^Next song in \d{2}:\d{2}:\d{2}$/);
});

test('a slow preview is announced while it loads, and the notice goes once it has played', async ({ page }) => {
  await setup(page);
  // Registered after the fixture's stub, so it answers first: the preview arrives after a second.
  await page.route(`**/${AUDIO_HOST}/**`, async (route) => {
    await new Promise((done) => setTimeout(done, 1_000));
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(3) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play the 1-second snippet' }).click();
  await expect(liveRegion(page)).toHaveText('Loading the preview…');
  await awaitSnippet(page, 1);
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.getByText('1s unlocked · next: 2s')).toBeVisible();
});

const LOAD_FAILED = 'The preview could not be loaded. Check your connection and try again.';

test('a preview that cannot be loaded says so, and pressing play again retries', async ({ page }) => {
  await setup(page);
  let requests = 0;
  await page.route(`**/${AUDIO_HOST}/**`, async (route) => {
    requests += 1;
    await route.abort('connectionreset');
  });
  await page.goto('/');
  await playButton(page).click();
  await expect(liveRegion(page)).toHaveText(LOAD_FAILED);
  await expect(page.getByRole('main').getByText(LOAD_FAILED)).toBeVisible();
  const first = requests;
  expect(first).toBeGreaterThan(0);
  await expect(playButton(page)).toBeEnabled();
  await playButton(page).click();
  await expect.poll(() => requests).toBeGreaterThan(first);
  await expect(liveRegion(page)).toHaveText(LOAD_FAILED);
});

test('a preview that fails to load after the round has ended leaves the result alone', async ({ page }) => {
  await setup(page);
  // The preview request hangs for a second and a half, then loses its connection; the round is
  // won in the meantime.
  let aborted: () => void = () => {};
  const abortedOnce = new Promise<void>((done) => {
    aborted = done;
  });
  await page.route(`**/${AUDIO_HOST}/**`, async (route) => {
    await new Promise((done) => setTimeout(done, 1_500));
    await route.abort('connectionreset');
    aborted();
  });
  await page.goto('/');
  const answer = expectedDailyLabel(58);
  await playButton(page).click();
  await guess(page, answer, 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(liveRegion(page)).toHaveText(`Correct! The song was ${answer}.`);
  await abortedOnce;
  // Time for the element's error event to reach the app.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 1_000)));
  await expect(liveRegion(page)).toHaveText(`Correct! The song was ${answer}.`);
  await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);
});

test('media keys neither play the preview past the snippet nor leave the bar playing', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      (window as unknown as PreviewWindow).preview = this;
      return play.call(this);
    };
  });
  await page.goto('/');
  await playSnippet(page, 1);

  // A media key resumes the stopped preview: it is paused again before it gets anywhere.
  const resumedAt = await page.evaluate(() => {
    const preview = (window as unknown as PreviewWindow).preview;
    void preview.play().catch(() => undefined);
    return preview.currentTime;
  });
  const preview = () =>
    page.evaluate(() => {
      const element = (window as unknown as PreviewWindow).preview;
      return { paused: element.paused, time: element.currentTime };
    });
  await expect.poll(async () => (await preview()).paused).toBe(true);
  expect((await preview()).time).toBeLessThan(resumedAt + 0.5);
  await expect(page.getByRole('button', { name: 'Play the 1-second snippet' })).toHaveAttribute('aria-pressed', 'false');

  // The system's media controls pause the 4-second snippet early: the bar stops with it, long
  // before the snippet length or the end of the 3-second stub.
  await skip(page, 2);
  await page.getByRole('button', { name: 'Play the 4-second snippet' }).click();
  await expect(page.getByText('Playing the 4-second snippet')).toBeVisible();
  await page.evaluate(() => (window as unknown as PreviewWindow).preview.pause());
  await expect(page.getByRole('button', { name: 'Play the 4-second snippet' })).toHaveAttribute('aria-pressed', 'false', {
    timeout: 1_000,
  });
  await expect(page.getByText('4s unlocked · next: 8s')).toBeVisible();
});

// The positions at which the app paused a playing preview, kept by an init script.
type StopsWindow = Window & { stops: number[] };

test('every snippet plays to its full length, a replay included', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const record = window as unknown as StopsWindow;
    record.stops = [];
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      // The player also pauses elements that are not playing; only a playing one ends a snippet.
      if (!this.paused) record.stops.push(this.currentTime);
      return pause.call(this);
    };
  });
  await page.goto('/');
  // A replay seeks back to the start, and its first status already reads as playing before the
  // audio clock moves; the snippet must still run to its end.
  await playSnippet(page, 1);
  await playSnippet(page, 1);
  await skip(page, 1);
  await playSnippet(page, 2);
  await playSnippet(page, 2);
  const stops = await page.evaluate(() => (window as unknown as StopsWindow).stops);
  const lengths = [1, 1, 2, 2];
  expect(stops).toHaveLength(lengths.length);
  lengths.forEach((seconds, i) => {
    expect(stops[i], `stop ${i + 1}, a ${seconds}-second snippet`).toBeGreaterThanOrEqual(seconds - 0.02);
    expect(stops[i], `stop ${i + 1}, a ${seconds}-second snippet`).toBeLessThan(seconds + 0.5);
  });
});

test('a second tab never plays a round that another tab finished', async ({ page, context }) => {
  await setup(page);
  // One tab hears about the other through the storage event; the other missed every event (as
  // a frozen tab can) and only finds out when a move is made.
  const follower = await context.newPage();
  await setup(follower);
  const stale = await context.newPage();
  await setup(stale);
  await stale.addInitScript(() => {
    for (const type of ['storage', 'focus', 'pageshow']) {
      window.addEventListener(type, (event) => event.stopImmediatePropagation(), true);
    }
    document.addEventListener('visibilitychange', (event) => event.stopImmediatePropagation(), true);
  });
  for (const tab of [page, follower, stale]) {
    await tab.goto('/');
    await expect(tab.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
  }

  const answer = expectedDailyLabel(58);
  await guess(page, answer, 'keyboard');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  const stored = await page.evaluate(() => localStorage.getItem('fg:stats:v1'));

  await expect(follower.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(stale.getByRole('listitem', { name: 'Guess 1: your next guess' })).toHaveCount(1);
  await skipButton(stale).click();
  await expect(stale.getByRole('heading', { level: 2 })).toHaveText('Correct!');
  await expect(stale.getByRole('listitem', { name: `Guess 1: correct, ${answer}` })).toHaveCount(1);
  await expect(stale.getByRole('listitem', { name: /skipped/ })).toHaveCount(0);
  const stats = await openStats(stale);
  for (const name of ['Played: 1', 'Current streak: 1', 'Won on guess 1: 1']) {
    await expect(stats.getByRole('listitem', { name, exact: true })).toHaveCount(1);
  }

  expect(await page.evaluate(() => localStorage.getItem('fg:stats:v1'))).toBe(stored);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Correct!');
});
