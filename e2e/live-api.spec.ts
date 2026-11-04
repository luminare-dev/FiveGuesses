import { expect, test } from '@playwright/test';

// Checks the deployed service, so it needs the network: skipped unless FG_LIVE_API=1.
const API = 'https://api.fiveguesses.app';

test.skip(process.env.FG_LIVE_API !== '1', 'set FG_LIVE_API=1 to check the live service');

test('the live song service answers', async ({ request }) => {
  const health = await request.get(`${API}/api/health`);
  expect(await health.json()).toEqual({ ok: true });
  const sources = (await (await request.get(`${API}/api/sources`)).json()) as { sources: unknown[] };
  expect(sources.sources).toHaveLength(17);
  // Category entries without previews; the browser looks those up at iTunes itself.
  const pool = (await (await request.get(`${API}/api/pool?source=80s`)).json()) as { entries: { id: number; country: string }[] };
  expect(pool.entries.length).toBeGreaterThanOrEqual(60);
  const first = pool.entries.slice(0, 3);
  const lookup = await request.get(`https://itunes.apple.com/lookup?id=${first.map((e) => e.id).join(',')}&country=${first[0].country}`);
  const found = JSON.parse(await lookup.text()) as { results: { previewUrl?: string }[] };
  expect(found.results.some((r) => (r.previewUrl ?? '').startsWith('https://audio-ssl.itunes.apple.com/'))).toBe(true);
  const room = await request.post(`${API}/api/rooms`, { headers: { Origin: 'https://fiveguesses.app' } });
  expect(room.status()).toBe(201);
});
