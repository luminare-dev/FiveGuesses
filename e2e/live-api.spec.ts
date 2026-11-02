import { expect, test } from '@playwright/test';

// Checks the deployed service, so it needs the network: skipped unless FG_LIVE_API=1.
const API = 'https://api.fiveguesses.app';

test.skip(process.env.FG_LIVE_API !== '1', 'set FG_LIVE_API=1 to check the live service');

test('the live song service answers', async ({ request }) => {
  const health = await request.get(`${API}/api/health`);
  expect(await health.json()).toEqual({ ok: true });
  const sources = (await (await request.get(`${API}/api/sources`)).json()) as { sources: unknown[] };
  expect(sources.sources).toHaveLength(21);
  const list = (await (await request.get(`${API}/api/tracks?source=80s&n=3`)).json()) as { tracks: { previewUrl: string }[] };
  expect(list.tracks).toHaveLength(3);
  for (const track of list.tracks) expect(track.previewUrl).toMatch(/^https:\/\/audio-ssl\.itunes\.apple\.com\//);
  const room = await request.post(`${API}/api/rooms`, { headers: { Origin: 'https://fiveguesses.app' } });
  expect(room.status()).toBe(201);
});
