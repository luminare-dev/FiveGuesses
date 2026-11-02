import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { artistNames, classify, coreTitle, pickMatch, sameArtist } from '../src/match.mjs';

const { cases } = JSON.parse(readFileSync(new URL('./match-cases.json', import.meta.url), 'utf8'));

test('shared match cases', () => {
  for (const c of cases) assert.equal(classify(c.guess, c.answer), c.expected, c.name);
});

test('coreTitle drops brackets and a dash suffix', () => {
  assert.equal(coreTitle('Get Lucky (feat. Pharrell Williams) [Radio Edit]'), 'get lucky');
  assert.equal(coreTitle('Take On Me - 2015 Remaster'), 'take on me');
  assert.equal(coreTitle('(Untitled)'), 'untitled');
});

test('artistNames and sameArtist', () => {
  assert.deepEqual(artistNames('Major Lazer, MØ & DJ Snake'), ['major lazer', 'm', 'dj snake']);
  assert.deepEqual(artistNames('The Weeknd feat. Daft Punk'), ['weeknd', 'daft punk']);
  assert.ok(sameArtist('Simon & Garfunkel', 'Garfunkel'));
  assert.ok(!sameArtist('Daft Punk', 'Pharrell Williams'));
});

const r = (trackName, artistName = 'a-ha', collectionName = 'Hunting High and Low', id = 1) => ({
  trackId: id,
  trackName,
  artistName,
  collectionName,
  previewUrl: 'https://audio-ssl.itunes.apple.com/x.m4a',
});

test('pickMatch takes the original', () => {
  const results = [r('Take On Me (Live)', 'a-ha', 'Live', 2), r('Take On Me', 'a-ha', 'Hunting High and Low', 3)];
  assert.equal(pickMatch(results, 'a-ha', 'Take On Me').trackId, 3);
});

test('pickMatch rejects karaoke, covers, live and remixes', () => {
  assert.equal(pickMatch([r('Take On Me', 'Karaoke Hits')], 'a-ha', 'Take On Me'), null);
  assert.equal(pickMatch([r('Take On Me', 'a-ha', 'Tribute to a-ha')], 'a-ha', 'Take On Me'), null);
  assert.equal(pickMatch([r('Take On Me (Live at Wembley)')], 'a-ha', 'Take On Me'), null);
  assert.equal(pickMatch([r('Take On Me (Remix)')], 'a-ha', 'Take On Me'), null);
  assert.equal(pickMatch([r('Take On Me', 'Some Cover Band')], 'a-ha', 'Take On Me'), null);
});

test('pickMatch keeps a credit and needs a preview', () => {
  const ok = r('Uptown Funk (feat. Bruno Mars)', 'Mark Ronson');
  assert.equal(pickMatch([ok], 'Mark Ronson', 'Uptown Funk'), ok);
  assert.equal(pickMatch([{ ...ok, previewUrl: '' }], 'Mark Ronson', 'Uptown Funk'), null);
});
