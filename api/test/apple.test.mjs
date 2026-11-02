import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ITEMS, budget, fetchPlaylistPage, get, parsePlaylistHtml, parsePlaylistUrl } from '../src/apple.mjs';
import { fakeFetch, fixture } from './fake.mjs';

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

test('playlist JSON-LD gives ids and titles without parsing the HTML', () => {
  assert.deepEqual(parsePlaylistHtml(fixture('playlist-top100.html')), {
    label: 'Top 100: Global',
    items: [
      { id: 269573303, title: 'Thriller' },
      { id: 1440662595, title: 'This Is Halloween' },
      { id: 82125202, title: 'Monster Mash' },
    ],
  });
  assert.equal(parsePlaylistHtml('<html></html>'), null);
  const track = (url, name = 'X') => ({ '@type': 'MusicRecording', name, url });
  const page = (tracks) => `<script id=schema:music-playlist type="application/ld+json">${JSON.stringify({ name: 'L', track: tracks })}</script>`;
  const odd = parsePlaylistHtml(
    page([
      track('https://music.apple.com/us/song/5'),
      track('https://music.apple.com/us/song/a/5'),
      track('https://music.apple.com/us/album/a/6'),
      track('https://music.apple.com/us/song/a/12345678901234567'),
      { url: 'https://music.apple.com/us/song/a/7' },
    ]),
  );
  assert.deepEqual(odd.items, [{ id: 5, title: 'X' }, { id: 7, title: '' }]);
  const many = parsePlaylistHtml(page(Array.from({ length: MAX_ITEMS + 5 }, (_, i) => track(`https://music.apple.com/us/song/s/${i + 1}`))));
  assert.equal(many.items.length, MAX_ITEMS);
});

test('a page fetch that Apple refuses is apple_blocked; a missing playlist is playlist_not_found', async () => {
  const p = { cc: 'us', slug: 'top-100-global', id: 'pl.d25f5d1181894928af76c85c967f8f31' };
  const ok = await fetchPlaylistPage(p, { fetch: fakeFetch([[() => true, () => new Response(fixture('playlist-top100.html'))]]) });
  assert.equal(ok.items.length, 3);
  const empty = '<script id=schema:music-playlist type="application/ld+json">{"name":"L","track":[]}</script>';
  for (const res of [new Response('gone', { status: 404 }), new Response(empty)]) {
    await assert.rejects(fetchPlaylistPage(p, { fetch: fakeFetch([[() => true, () => res]]) }), (e) => e.code === 'playlist_not_found' && e.status === 404);
  }
  for (const res of [new Response('no', { status: 403 }), new Response('', { status: 500 }), new Response('<html>no data</html>')]) {
    await assert.rejects(fetchPlaylistPage(p, { fetch: fakeFetch([[() => true, () => res]]) }), (e) => e.code === 'apple_blocked' && e.status === 502);
  }
  const down = async () => {
    throw new TypeError('network');
  };
  await assert.rejects(fetchPlaylistPage(p, { fetch: down }), (e) => e.code === 'apple_blocked');
});

test('the subrequest budget stops at 45', async () => {
  const fetch = fakeFetch([[() => true, () => new Response('{}')]]);
  const deps = { fetch, budget: budget() };
  for (let i = 0; i < 45; i++) await get('https://music.apple.com/x', deps);
  await assert.rejects(get('https://music.apple.com/x', deps), (e) => e.code === 'budget');
  assert.equal(fetch.calls.length, 45);
});
