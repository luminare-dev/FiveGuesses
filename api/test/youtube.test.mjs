import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budget } from '../src/apple.mjs';
import { fetchPlaylist, parsePlaylistUrl, parseVideoTitle } from '../src/youtube.mjs';
import { fakeFetch, json } from './fake.mjs';

const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
const KEY = 'test-key-AIzaNotReal';

test('playlist links', () => {
  for (const u of [
    `https://www.youtube.com/playlist?list=${LIST}`,
    `https://youtube.com/watch?v=dQw4w9WgXcQ&list=${LIST}`,
    `https://m.youtube.com/playlist?list=${LIST}`,
    `https://music.youtube.com/playlist?list=${LIST}`,
    `https://youtu.be/dQw4w9WgXcQ?list=${LIST}`,
  ]) {
    assert.equal(parsePlaylistUrl(u), LIST, u);
  }
  for (const u of [
    'https://www.youtube.com/playlist?list=short',
    `https://www.youtube.com/playlist?list=${LIST}!`,
    `https://youtube.com.evil.example/playlist?list=${LIST}`,
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'nonsense',
  ]) {
    assert.equal(parsePlaylistUrl(u), null, u);
  }
});

test('video titles', () => {
  const cases = [
    ['a-ha - Take On Me (Official Video) [4K]', '', { artist: 'a-ha', title: 'Take On Me' }],
    ['Rick Astley – Never Gonna Give You Up (Official Music Video)', '', { artist: 'Rick Astley', title: 'Never Gonna Give You Up' }],
    ['Nena — 99 Luftballons (Offizielles Musikvideo)', '', { artist: 'Nena', title: '99 Luftballons' }],
    ['Daft Punk - Get Lucky (feat. Pharrell Williams) | Lyrics', '', { artist: 'Daft Punk', title: 'Get Lucky (feat. Pharrell Williams)' }],
    ['Bohemian Rhapsody (Remastered 2011)', 'Queen - Topic', { artist: 'Queen', title: 'Bohemian Rhapsody (Remastered 2011)' }],
    ['Hello (Lyrics)', 'AdeleVEVO', { artist: 'Adele', title: 'Hello' }],
    ['Blinding Lights', 'The Weeknd Official', { artist: 'The Weeknd', title: 'Blinding Lights' }],
    ['Song - Part - Two', '', { artist: 'Song', title: 'Part - Two' }],
  ];
  for (const [title, channel, want] of cases) assert.deepEqual(parseVideoTitle(title, channel), want, title);
  assert.equal(parseVideoTitle('Deleted video', 'x'), null);
  assert.equal(parseVideoTitle('Private video', 'x'), null);
  assert.equal(parseVideoTitle('No channel', ''), null);
});

const playlists = (u) => u.startsWith('https://www.googleapis.com/youtube/v3/playlists?');
const items = (u) => u.startsWith('https://www.googleapis.com/youtube/v3/playlistItems?');

test('reads the label and up to 4 pages', async () => {
  let page = 0;
  const fetch = fakeFetch([
    [playlists, json({ items: [{ snippet: { title: 'Party' } }] })],
    [items, () => json({ nextPageToken: `t${++page}`, items: [{ snippet: { title: `Band ${page} - Song ${page}` } }, { snippet: { title: 'Deleted video' } }] })],
  ]);
  const pl = await fetchPlaylist(LIST, KEY, { fetch, budget: budget() });
  assert.equal(pl.label, 'Party');
  assert.equal(pl.entries.length, 4);
  assert.equal(fetch.calls.length, 5);
  const q = new URL(fetch.calls[2]).searchParams;
  assert.equal(q.get('pageToken'), 't1');
  assert.equal(q.get('maxResults'), '50');
  assert.equal(q.get('playlistId'), LIST);
});

const quota = json({ error: { code: 403, errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota', message: `key ${KEY}` }] } }, 403);

test('quota, missing key and missing playlists', async () => {
  const check = (e, status, code) => e.status === status && e.code === code && !e.message.includes(KEY) && !JSON.stringify(e).includes(KEY);
  await assert.rejects(fetchPlaylist(LIST, KEY, { fetch: fakeFetch([[() => true, () => quota.clone()]]) }), (e) => check(e, 503, 'youtube_unavailable'));
  await assert.rejects(fetchPlaylist(LIST, '', { fetch: fakeFetch([]) }), (e) => check(e, 503, 'youtube_unavailable'));
  await assert.rejects(fetchPlaylist(LIST, KEY, { fetch: fakeFetch([[playlists, json({ items: [] })]]) }), (e) => check(e, 404, 'playlist_not_found'));
  await assert.rejects(
    fetchPlaylist(LIST, KEY, { fetch: fakeFetch([[playlists, json({ items: [{ snippet: { title: 'x' } }] })], [items, () => json({}, 404)]]) }),
    (e) => check(e, 404, 'playlist_not_found'),
  );
  await assert.rejects(fetchPlaylist(LIST, KEY, { fetch: async () => { throw new TypeError(`fetch failed ${KEY}`); } }), (e) => check(e, 503, 'youtube_unavailable'));
});
