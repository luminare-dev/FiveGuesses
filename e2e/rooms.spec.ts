import type { Page } from '@playwright/test';
import { CORS, awaitSnippet, expect, guess, liveRegion, playButton, setup, test } from './fixtures';
import { FakeRoom, ROOM_CODE, searchAnswer, serveRoomPages, TAKE_ON_ME, WONDERWALL } from './roomServer';

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

async function openRoom(page: Page, fake: FakeRoom): Promise<void> {
  await serveRoomPages(page.context());
  await fake.attach(page);
  await page.route('https://itunes.apple.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body: searchAnswer([TAKE_ON_ME, WONDERWALL]) })
  );
  await page.goto(`/r/${ROOM_CODE}`);
}

async function join(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Join the room' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

const players = (page: Page) => page.getByRole('list', { name: 'Players' }).getByRole('listitem');

test('join by name, play a round against a bot and keep the seat over a reload', async ({ page }) => {
  await setup(page);
  const fake = await FakeRoom.create([TAKE_ON_ME, WONDERWALL]);
  await openRoom(page, fake);
  await expect(page.getByText(`Room ${ROOM_CODE} · Lobby`)).toBeVisible();
  await join(page, 'Anna');

  await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  const hellos = fake.messages('hello');
  expect(hellos).toHaveLength(2);
  expect(hellos[0].token).toMatch(TOKEN);
  expect(hellos[0].name).toBeUndefined();
  expect(hellos[1]).toEqual({ t: 'hello', token: hellos[0].token, name: 'Anna' });
  await expect(page.getByText(new RegExp(`/r/${ROOM_CODE}$`))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share the link' })).toBeVisible();

  const ben = fake.join('Ben');
  fake.join('Cara');
  await expect(players(page)).toHaveCount(3);
  await expect(players(page).nth(0)).toContainText('Anna · host · you');
  await page.getByRole('button', { name: 'Remove Cara' }).click();
  await expect(players(page)).toHaveCount(2);
  expect(fake.messages('kick')).toHaveLength(1);

  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 of 2' })).toBeVisible();
  expect(fake.messages('start')).toEqual([{ t: 'start', rounds: 10, source: { kind: 'category', id: '80s' } }]);
  await expect(page.getByText(`Room ${ROOM_CODE} · Round 1 of 2`)).toBeVisible();
  await expect(liveRegion(page)).toHaveText('Round 1 of 2 started. Name the song.');

  await playButton(page).click();
  await awaitSnippet(page, 1);
  await guess(page, 'Wonderwall', 'pointer');
  await expect(page.getByRole('listitem', { name: 'Guess 1: wrong, Oasis – Wonderwall' })).toHaveCount(1);
  await expect(playButton(page)).toHaveAccessibleName('Play the 2-second snippet');
  await guess(page, 'Take On Me', 'pointer');
  expect(fake.messages('guess')).toEqual([
    { t: 'guess', round: 1, id: WONDERWALL.id, artist: 'Oasis', title: 'Wonderwall' },
    { t: 'guess', round: 1, id: TAKE_ON_ME.id, artist: 'a-ha', title: 'Take On Me' },
  ]);

  // Solved: the answer shows while the round waits for Ben.
  const main = page.getByRole('main');
  await expect(main.getByText('Correct!', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Listen on Apple Music' })).toHaveAttribute('href', TAKE_ON_ME.appleMusicUrl ?? '');
  await expect(main.getByText('Previews courtesy of Apple Music')).toBeVisible();
  await expect(players(page).nth(1)).toContainText('Guessing');

  for (let i = 0; i < 5; i++) fake.act(ben, { t: 'skip', round: 1 });
  await expect(page.getByRole('heading', { name: 'Round 1 of 2 is over' })).toBeVisible();
  const results = page.getByRole('list', { name: 'Round results' }).getByRole('listitem');
  await expect(results.nth(0)).toContainText('Anna');
  await expect(results.nth(0)).toContainText('Named it in 2 s, place 1');
  await expect(results.nth(0)).toContainText('+110');
  await expect(results.nth(1)).toContainText('Missed the song');

  // A reload is the same tab: the same token, the same seat, no name asked.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Round 1 of 2 is over' })).toBeVisible();
  const again = fake.messages('hello');
  expect(again[again.length - 1]).toEqual({ t: 'hello', token: hellos[0].token });

  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.getByRole('heading', { name: 'Round 2 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip turn for Ben' }).click();
  await expect(players(page).nth(1)).toContainText('Turn skipped by the host');
  await page.getByRole('button', { name: 'End game' }).click();
  await expect(page.getByRole('heading', { name: 'Final standings' })).toBeVisible();
  const standings = page.getByRole('list', { name: 'Standings' }).getByRole('listitem');
  await expect(standings.nth(0)).toContainText('Anna');
  await expect(standings.nth(0)).toContainText('110 points');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();

  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: 'You left the room.' })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), `fg:room:${ROOM_CODE}`)).toBeNull();
});

test('the host role moves on when the host leaves', async ({ page }) => {
  await setup(page);
  const fake = await FakeRoom.create([TAKE_ON_ME]);
  const ben = fake.join('Ben');
  await openRoom(page, fake);
  await join(page, 'Anna');
  await expect(page.getByText('Waiting for Ben to start the game.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
  fake.act(ben, { t: 'leave' });
  await expect(page.getByRole('button', { name: 'Start the game' })).toBeVisible();
  await expect(liveRegion(page)).toHaveText('You are the host now.');
});

test('a taken name is asked again', async ({ page }) => {
  await setup(page);
  const fake = await FakeRoom.create([TAKE_ON_ME]);
  fake.join('Ben');
  await openRoom(page, fake);
  await join(page, 'ben ');
  await expect(page.getByText('Someone in this room already has that name. Choose another one.')).toBeVisible();
  await join(page, 'Anna');
  await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
});

test('a removed player sees why and does not come back', async ({ page }) => {
  await setup(page);
  const fake = await FakeRoom.create([TAKE_ON_ME]);
  await openRoom(page, fake);
  await join(page, 'Anna');
  await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  const sent = fake.received.length;
  fake.closeAll(4001);
  await expect(page.getByRole('heading', { name: 'The host removed you from this room.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the daily game' })).toHaveAttribute('href', '/');
  await page.clock.runFor(15_000);
  expect(fake.received.length).toBe(sent);
  // The token stays, so a reload is refused by the room instead of asking for a new name.
  expect(await page.evaluate((key) => sessionStorage.getItem(key), `fg:room:${ROOM_CODE}`)).toMatch(TOKEN);
});

test('an unknown room says so', async ({ page }) => {
  await setup(page);
  const fake = await FakeRoom.create([], false);
  await openRoom(page, fake);
  await expect(page.getByRole('heading', { name: 'This room does not exist or has closed.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveCount(0);
});
