import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from '../src/http.mjs';
import { importPlaylist } from '../src/sources.mjs';
import { fetchSpotifyPlaylist, parseEmbedHtml, parsePlaylistUrl } from '../src/spotify.mjs';
import { fakeFetch, fixture } from './fake.mjs';

const ID = '37i9dQZF1DXcBWIGoYBM5M';
const EMBED = `https://open.spotify.com/embed/playlist/${ID}`;
const page = () => new Response(fixture('spotify-embed-top-hits.html'), { headers: { 'Content-Type': 'text/html' } });

test('playlist links', () => {
  for (const u of [
    `https://open.spotify.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}?si=0a1b2c3d4e5f`,
    `https://open.spotify.com/intl-de/playlist/${ID}?si=x`,
    `https://open.spotify.com/intl-pt-br/playlist/${ID}`,
    `https://open.spotify.com/embed/playlist/${ID}`,
    `spotify:playlist:${ID}`,
    `  spotify:playlist:${ID} `,
  ]) {
    assert.equal(parsePlaylistUrl(u), ID, u);
  }
  for (const u of [
    `https://open.spotify.com/album/${ID}`,
    `https://open.spotify.com/track/${ID}`,
    `https://open.spotify.com/playlist/${ID}x`,
    'https://open.spotify.com/playlist/short',
    `https://open.spotify.com.evil.example/playlist/${ID}`,
    `https://evil.example/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}/extra`,
    `spotify:album:${ID}`,
    `spotify:playlist:${ID}:x`,
    `ftp://open.spotify.com/playlist/${ID}`,
    'nonsense',
  ]) {
    assert.equal(parsePlaylistUrl(u), null, u);
  }
});

test('the embed page gives the name and the first artist of each track', () => {
  const pl = parseEmbedHtml(fixture('spotify-embed-top-hits.html'));
  assert.equal(pl.label, 'Today’s Top Hits');
  assert.equal(pl.entries.length, 50);
  assert.deepEqual(pl.entries[0], { artist: 'Tame Impala', title: 'Loser' });
  assert.ok(pl.entries.some((e) => e.title === 'BbY WOW' && e.artist === 'KAROL G'));
  assert.ok(pl.entries.every((e) => e.artist && e.title && !e.artist.includes(',')));
  assert.equal(parseEmbedHtml('<html>no data</html>'), null);
  assert.equal(parseEmbedHtml('<script id="__NEXT_DATA__" type="application/json">{bad</script>'), null);
  assert.equal(parseEmbedHtml('<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>'), null);
});

test('fetches the embed page with a browser User-Agent and a timeout', async () => {
  const fetch = fakeFetch([[(u) => u === EMBED, page]]);
  const pl = await fetchSpotifyPlaylist(ID, { fetch });
  assert.equal(pl.entries.length, 50);
  assert.deepEqual(fetch.calls, [EMBED]);
  assert.match(fetch.inits[0].headers['User-Agent'], /^Mozilla\/5\.0 .*Chrome\//);
  assert.ok(fetch.inits[0].signal instanceof AbortSignal);
});

test('missing, refused and failed pages', async () => {
  const check = (status, code) => (e) => e.status === status && e.code === code;
  const with404 = fakeFetch([]);
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: with404 }), check(404, 'playlist_not_found'));
  const empty = fakeFetch([[() => true, () => new Response('<html></html>')]]);
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: empty }), check(404, 'playlist_not_found'));
  const noTracks = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"x","trackList":[]}}}}}}</script>';
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: fakeFetch([[() => true, () => new Response(noTracks)]]) }), check(404, 'playlist_not_found'));
  const refused = fakeFetch([[() => true, () => new Response('', { status: 403 })]]);
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: refused }), check(502, 'spotify_blocked'));
  const limited = fakeFetch([[() => true, () => new Response('', { status: 429 })]]);
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: limited }), check(502, 'spotify_blocked'));
  const down = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: down }), check(502, 'spotify_blocked'));
  const timeout = async () => {
    throw new DOMException('timed out', 'TimeoutError');
  };
  await assert.rejects(fetchSpotifyPlaylist(ID, { fetch: timeout }), check(502, 'spotify_blocked'));
});

test('/api/import answers entries like YouTube and never calls iTunes', async () => {
  const fetch = fakeFetch([[(u) => u === EMBED, page]]);
  const req = new Request('https://api.fiveguesses.app/api/import', {
    method: 'POST',
    headers: { Origin: 'https://fiveguesses.app', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://open.spotify.com/intl-de/playlist/${ID}?si=abc` }),
  });
  const res = await handle(req, {}, { fetch });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['kind', 'label', 'total', 'entries']);
  assert.equal(body.kind, 'entries');
  assert.equal(body.label, 'Today’s Top Hits');
  assert.equal(body.total, 50);
  assert.deepEqual(body.entries[0], { artist: 'Tame Impala', title: 'Loser' });
  assert.ok(fetch.calls.every((u) => !u.includes('itunes.apple.com')));
});

test('/api/import answers 502 spotify_blocked when Spotify refuses', async () => {
  const fetch = fakeFetch([[() => true, () => new Response('', { status: 403 })]]);
  const req = new Request('https://api.fiveguesses.app/api/import', {
    method: 'POST',
    headers: { Origin: 'https://fiveguesses.app' },
    body: JSON.stringify({ url: `spotify:playlist:${ID}` }),
  });
  const res = await handle(req, {}, { fetch });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'spotify_blocked' });
});

test('SPOTIFY_IMPORT=off turns the import off without a request', async () => {
  const fetch = fakeFetch([[() => true, page]]);
  for (const off of ['off', 'OFF', ' off ']) {
    await assert.rejects(importPlaylist(`spotify:playlist:${ID}`, { fetch }, { SPOTIFY_IMPORT: off }), (e) => e.status === 503 && e.code === 'spotify_unavailable');
  }
  assert.equal(fetch.calls.length, 0);
  for (const on of [undefined, '', 'on']) {
    const out = await importPlaylist(`spotify:playlist:${ID}`, { fetch }, { SPOTIFY_IMPORT: on });
    assert.equal(out.total, 50);
  }
});
