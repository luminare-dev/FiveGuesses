import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  budget,
  chartIds,
  fetchPlaylistPage,
  lookup,
  parsePlaylistHtml,
  parsePlaylistUrl,
  search,
  toTrack,
} from '../src/apple.mjs';
import { fakeFetch, fixture, json, result } from './fake.mjs';

test('toTrack maps a lookup result', () => {
  const r = JSON.parse(fixture('lookup-nirvana.json')).results[0];
  const t = toTrack(r, 'AT', { artist: 'Nirvana', title: 'Smells Like Teen Spirit' });
  assert.equal(t.id, 1440783625);
  assert.equal(t.year, null);
  assert.equal(t.country, 'AT');
  assert.equal(t.matchedTrack, 'Smells Like Teen Spirit');
  assert.match(t.artworkUrl, /^https:\/\/is1-ssl\.mzstatic\.com\/.*\/512x512bb\.jpg$/);
  assert.match(t.appleMusicUrl, /^https:\/\/music\.apple\.com\/at\//);
  assert.ok(t.previewUrl.startsWith('https://audio-ssl.itunes.apple.com/'));
});

test('toTrack uses Apple names without a seed and checks every URL', () => {
  const r = result(5, 'Mark Ronson', 'Uptown Funk (feat. Bruno Mars)');
  assert.equal(toTrack(r, 'DE').title, 'Uptown Funk (feat. Bruno Mars)');
  assert.equal(toTrack({ ...r, previewUrl: 'https://evil.example/a.m4a' }, 'AT'), null);
  assert.equal(toTrack({ ...r, previewUrl: undefined }, 'AT'), null);
  assert.equal(toTrack({ ...r, artworkUrl100: 'http://is1-ssl.mzstatic.com/a.jpg' }, 'AT').artworkUrl, '');
  assert.equal(toTrack({ ...r, artworkUrl100: 'https://mzstatic.com.evil.example/a.jpg' }, 'AT').artworkUrl, '');
  assert.equal(toTrack({ ...r, trackViewUrl: 'https://music.apple.com.evil.example/x' }, 'AT').appleMusicUrl, null);
  assert.equal(toTrack({ ...r, trackViewUrl: 'javascript:alert(1)' }, 'AT').appleMusicUrl, null);
});

test('search and lookup build the iTunes URLs', async () => {
  const fetch = fakeFetch([[(u) => u.includes('itunes.apple.com'), JSON.parse(fixture('lookup-nirvana.json'))]]);
  const deps = { fetch };
  await search('a-ha Take On Me', 'AT', deps);
  const ids = Array.from({ length: 250 }, (_, i) => i + 1);
  const found = await lookup(ids, 'DE', deps);
  assert.equal(found.length, 1);
  const s = new URL(fetch.calls[0]);
  assert.equal(s.pathname, '/search');
  assert.deepEqual(Object.fromEntries(s.searchParams), { term: 'a-ha Take On Me', media: 'music', entity: 'song', limit: '10', country: 'AT' });
  const l = new URL(fetch.calls[1]);
  assert.equal(l.searchParams.get('id').split(',').length, 200);
  assert.equal(l.searchParams.get('country'), 'DE');
});

test('Apple throttling is reported', async () => {
  const deps = { fetch: fakeFetch([[() => true, () => new Response('', { status: 403 })]]) };
  await assert.rejects(search('x', 'AT', deps), (e) => e.code === 'apple_unavailable' && e.throttled);
});

test('chart feed ids and the hour cache', async () => {
  const fetch = fakeFetch([[(u) => u.startsWith('https://rss.marketingtools.apple.com/api/v2/at/'), JSON.parse(fixture('chart-at.json'))]]);
  const store = new Map();
  const cache = {
    match: async (k) => (store.has(k) ? new Response(store.get(k)) : undefined),
    put: async (k, res) => store.set(k, await res.text()),
  };
  const ids = await chartIds('at', { fetch, cache });
  assert.deepEqual(ids, JSON.parse(fixture('chart-at.json')).feed.results.map((r) => Number(r.id)));
  assert.ok(store.has('https://api.fiveguesses.app/_cache/chart/at'));
  assert.deepEqual(await chartIds('at', { fetch, cache }), ids);
  assert.equal(fetch.calls.length, 1);
  const broken = { match: async () => { throw new Error('no cache'); }, put: async () => { throw new Error('no cache'); } };
  assert.deepEqual(await chartIds('at', { fetch, cache: broken }), ids);
});

test('Apple Music playlist links', () => {
  assert.deepEqual(parsePlaylistUrl('https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31'), {
    cc: 'us',
    slug: 'top-100-global',
    id: 'pl.d25f5d1181894928af76c85c967f8f31',
  });
  for (const bad of [
    'http://music.apple.com/us/playlist/x/pl.abc',
    'https://music.apple.com.evil.example/us/playlist/x/pl.abc',
    'https://music.apple.com/us/album/x/123',
    'https://music.apple.com/us/playlist/x/abc',
    'https://music.apple.com/us/playlist/x/pl.a/b',
    'not a url',
  ]) {
    assert.equal(parsePlaylistUrl(bad), null, bad);
  }
});

test('playlist JSON-LD is read without parsing the HTML', async () => {
  const html = fixture('playlist-top100.html');
  assert.deepEqual(parsePlaylistHtml(html), { label: 'Top 100: Global', ids: [269573303, 1440662595, 82125202] });
  assert.equal(parsePlaylistHtml('<html></html>'), null);
  const p = { cc: 'us', slug: 'top-100-global', id: 'pl.d25f5d1181894928af76c85c967f8f31' };
  const ok = await fetchPlaylistPage(p, { fetch: fakeFetch([[() => true, () => new Response(html)]]) });
  assert.equal(ok.ids.length, 3);
  for (const res of [new Response('gone', { status: 404 }), new Response('<html>no data</html>')]) {
    await assert.rejects(fetchPlaylistPage(p, { fetch: fakeFetch([[() => true, () => res]]) }), (e) => e.code === 'playlist_not_found' && e.status === 404);
  }
});

test('the subrequest budget stops at 45', async () => {
  const fetch = fakeFetch([[() => true, json({ results: [] })]]);
  const deps = { fetch, budget: budget() };
  for (let i = 0; i < 45; i++) await search('x', 'AT', deps);
  await assert.rejects(search('x', 'AT', deps), (e) => e.code === 'budget');
  assert.equal(fetch.calls.length, 45);
});
