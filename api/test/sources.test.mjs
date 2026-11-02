import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from '../src/http.mjs';
import { CATEGORY_TRACKS } from '../src/categories.mjs';
import { SOURCES, categoryPool, importPlaylist } from '../src/sources.mjs';
import { fakeFetch, fixture, json } from './fake.mjs';

const CURATED = ['70s', '80s', '90s', '2000s', '2010s', '2020s', 'pop', 'rock', 'hiphop', 'electronic', 'deutschpop', 'austropop', 'schlager', 'soundtracks', 'videogames', 'onehits', 'christmas'];
const noApple = (fetch) => assert.ok(!fetch.calls.some((u) => new URL(u).hostname === 'itunes.apple.com'), 'no iTunes call');

test('17 curated sources with unique ids, no charts', () => {
  assert.equal(SOURCES.length, 17);
  assert.deepEqual(SOURCES.map((s) => s.id).sort(), [...CURATED].sort());
  assert.deepEqual(Object.keys(CATEGORY_TRACKS).sort(), [...CURATED].sort());
});

test('every curated category has 60-120 unique tracks from AT, DE or US', () => {
  for (const id of CURATED) {
    const rows = CATEGORY_TRACKS[id];
    assert.ok(rows.length >= 60 && rows.length <= 120, `${id}: ${rows.length}`);
    assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, id);
    for (const [tid, country, artist, title] of rows) {
      assert.ok(Number.isSafeInteger(tid) && ['AT', 'DE', 'US'].includes(country) && artist && title, `${id} ${tid}`);
    }
  }
});

test('a category pool is every seed entry as { id, artist, title, country }', () => {
  const pool = categoryPool('80s');
  assert.equal(pool.source, '80s');
  assert.equal(pool.label, '1980s');
  assert.equal(pool.entries.length, CATEGORY_TRACKS['80s'].length);
  const [id, country, artist, title] = CATEGORY_TRACKS['80s'][0];
  assert.deepEqual(pool.entries[0], { id, artist, title, country });
  assert.throws(() => categoryPool('chart-at'), (e) => e.code === 'source_unknown' && e.status === 404);
});

test('YouTube import returns the parsed entries and never calls iTunes', async () => {
  let page = 0;
  const fetch = fakeFetch([
    [(u) => u.includes('/youtube/v3/playlists?'), json({ items: [{ snippet: { title: 'Big' } }] })],
    [
      (u) => u.includes('/youtube/v3/playlistItems?'),
      () => json({ nextPageToken: `p${++page}`, items: Array.from({ length: 50 }, (_, i) => ({ snippet: { title: `Band ${page}-${i} - Song ${i}` } })) }),
    ],
  ]);
  const req = new Request('https://api.fiveguesses.app/api/import', {
    method: 'POST',
    headers: { Origin: 'https://fiveguesses.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' }),
  });
  const res = await handle(req, { YOUTUBE_API_KEY: 'k' }, { fetch });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kind, 'entries');
  assert.equal(body.label, 'Big');
  assert.equal(body.total, 200);
  assert.equal(body.entries.length, 200);
  assert.deepEqual(body.entries[0], { artist: 'Band 1-0', title: 'Song 0' });
  assert.equal(fetch.calls.length, 5);
  noApple(fetch);
});

test('Apple Music import returns ids and titles in the link country, without a lookup', async () => {
  const fetch = fakeFetch([[(u) => u.startsWith('https://music.apple.com/us/playlist/'), () => new Response(fixture('playlist-top100.html'))]]);
  const out = await importPlaylist('https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31', { fetch }, {});
  assert.deepEqual(out, {
    kind: 'ids',
    label: 'Top 100: Global',
    country: 'US',
    total: 3,
    items: [
      { id: 269573303, title: 'Thriller' },
      { id: 1440662595, title: 'This Is Halloween' },
      { id: 82125202, title: 'Monster Mash' },
    ],
  });
  assert.equal(fetch.calls.length, 1);
  noApple(fetch);
});

test('an Apple Music page that Apple refuses answers 502 apple_blocked', async () => {
  const fetch = fakeFetch([[() => true, () => new Response('', { status: 403 })]]);
  const req = new Request('https://api.fiveguesses.app/api/import', {
    method: 'POST',
    headers: { Origin: 'https://fiveguesses.app' },
    body: JSON.stringify({ url: 'https://music.apple.com/at/playlist/x/pl.abc' }),
  });
  const res = await handle(req, {}, { fetch });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'apple_blocked' });
});
