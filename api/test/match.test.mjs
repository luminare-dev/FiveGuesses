import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { artistNames, classify, coreTitle, sameArtist } from '../src/match.mjs';

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
