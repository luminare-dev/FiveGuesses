import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyGuess } from '../game';
import type { Song } from '../game';

// The same table as api/test/match.test.mjs: the app and the room server judge alike.
type Side = { id: number; artist: string; title: string };
type Case = { name: string; guess: Side; answer: Side; expected: 'correct' | 'partial' | 'wrong' };

const { cases } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'api', 'test', 'match-cases.json'), 'utf8')
) as { cases: Case[] };

const song = ({ id, artist, title }: Side): Song => ({
  id,
  artist,
  title,
  year: null,
  matchedTrack: title,
  matchedArtist: artist,
  previewUrl: '',
  artworkUrl: '',
  appleMusicUrl: null,
});

describe('the shared match table', () => {
  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(10);
  });
  test.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(classifyGuess(song(c.guess), song(c.answer))).toBe(c.expected);
  });
});
