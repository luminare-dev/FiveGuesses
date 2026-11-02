import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from '../src/http.mjs';
import { CATEGORY_TRACKS } from '../src/categories.mjs';
import { SOURCES, importPlaylist, resolveEntries, sampleTracks } from '../src/sources.mjs';
import { fakeFetch, fixture, json, result } from './fake.mjs';

const CURATED = ['70s', '80s', '90s', '2000s', '2010s', '2020s', 'pop', 'rock', 'hiphop', 'electronic', 'deutschpop', 'austropop', 'schlager', 'soundtracks', 'videogames', 'onehits', 'christmas'];

test('21 sources with unique ids', () => {
  assert.equal(SOURCES.length, 21);
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, 21);
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

// Lookup answers every asked id in its country.
const lookupAll = (u) => {
  const q = new URL(u).searchParams;
  return json({ results: q.get('id').split(',').map((id) => result(Number(id), 'X', 'Y')) });
};

test('category sample: seed names, one lookup per country, excluded ids skipped', async () => {
  const fetch = fakeFetch([[(u) => u.startsWith('https://itunes.apple.com/lookup'), lookupAll]]);
  const exclude = CATEGORY_TRACKS['80s'].slice(0, 50).map((r) => r[0]);
  const out = await sampleTracks('80s', 5, exclude, { fetch, random: Math.random });
  assert.equal(out.source, '80s');
  assert.equal(out.label, '1980s');
  assert.equal(out.tracks.length, 5);
  const seeds = new Map(CATEGORY_TRACKS['80s'].map((r) => [r[0], r]));
  for (const t of out.tracks) {
    assert.ok(!exclude.includes(t.id));
    assert.equal(t.artist, seeds.get(t.id)[2]);
    assert.equal(t.country, seeds.get(t.id)[1]);
  }
  const countries = fetch.calls.map((u) => new URL(u).searchParams.get('country'));
  assert.equal(new Set(countries).size, countries.length);
});

test('chart sample uses the chart country', async () => {
  const fetch = fakeFetch([
    [(u) => u.includes('rss.marketingtools.apple.com/api/v2/at/'), JSON.parse(fixture('chart-at.json'))],
    [(u) => u.startsWith('https://itunes.apple.com/lookup'), lookupAll],
  ]);
  const out = await sampleTracks('chart-at', 3, [], { fetch, random: Math.random });
  assert.equal(out.tracks.length, 3);
  assert.ok(out.tracks.every((t) => t.country === 'AT'));
});

test('resolve: AT first, DE for the rest, dedupe and unresolved count', async () => {
  const fetch = fakeFetch([
    [
      (u) => u.startsWith('https://itunes.apple.com/search'),
      (u) => {
        const q = new URL(u).searchParams;
        if (q.get('term') === 'a-ha Take On Me') return json({ results: [result(1, 'a-ha', 'Take On Me')] });
        if (q.get('term') === 'Nena 99 Luftballons' && q.get('country') === 'DE') return json({ results: [result(2, 'Nena', '99 Luftballons')] });
        if (q.get('term') === 'Karaoke Star Take On Me') return json({ results: [result(3, 'Karaoke Star', 'Take On Me (Karaoke Version)')] });
        return json({ results: [] });
      },
    ],
  ]);
  const out = await resolveEntries(
    [
      { artist: 'a-ha', title: 'Take On Me' },
      { artist: 'A-ha', title: 'take on me' },
      { artist: 'Nena', title: '99 Luftballons' },
      { artist: 'Karaoke Star', title: 'Take On Me' },
    ],
    { fetch, random: Math.random },
  );
  assert.deepEqual(out.tracks.map((t) => t.id).sort(), [1, 2]);
  assert.equal(out.unresolved, 1);
});

test('resolve stops searching after Apple throttles', async () => {
  const fetch = fakeFetch([[() => true, () => new Response('', { status: 429 })]]);
  const entries = Array.from({ length: 20 }, (_, i) => ({ artist: `A${i}`, title: `T${i}` }));
  const out = await resolveEntries(entries, { fetch, random: Math.random });
  assert.equal(out.unresolved, 20);
  assert.ok(fetch.calls.length <= 3, `${fetch.calls.length} calls`);
});

test('YouTube import worst case stays within 45 subrequests', async () => {
  let page = 0;
  const fetch = fakeFetch([
    [(u) => u.includes('/youtube/v3/playlists?'), json({ items: [{ snippet: { title: 'Big' } }] })],
    [
      (u) => u.includes('/youtube/v3/playlistItems?'),
      () => json({ nextPageToken: `p${++page}`, items: Array.from({ length: 50 }, (_, i) => ({ snippet: { title: `Band ${page}-${i} - Song ${i}` } })) }),
    ],
    [(u) => u.startsWith('https://itunes.apple.com/search'), json({ results: [] })],
  ]);
  const req = new Request('https://api.fiveguesses.app/api/import', {
    method: 'POST',
    headers: { Origin: 'https://fiveguesses.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' }),
  });
  const res = await handle(req, { YOUTUBE_API_KEY: 'k' }, { fetch, random: Math.random });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 200);
  assert.equal(body.tracks.length, 0);
  assert.equal(body.unresolved, 30);
  assert.ok(fetch.calls.length <= 45, `${fetch.calls.length} calls`);
});

test('Apple Music import samples ids and looks them up in the link country', async () => {
  const fetch = fakeFetch([
    [(u) => u.startsWith('https://music.apple.com/us/playlist/'), () => new Response(fixture('playlist-top100.html'))],
    [(u) => u.startsWith('https://itunes.apple.com/lookup'), lookupAll],
  ]);
  const out = await importPlaylist('https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31', { fetch, random: Math.random }, {});
  assert.equal(out.label, 'Top 100: Global');
  assert.equal(out.total, 3);
  assert.equal(out.tracks.length, 3);
  assert.equal(out.unresolved, 0);
  assert.ok(out.tracks.every((t) => t.country === 'US'));
});
