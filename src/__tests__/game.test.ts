import {
  classifyGuess,
  dailySongIndex,
  findExactMatch,
  isCorrect,
  isPartial,
  normalize,
  puzzleNumber,
  searchSongs,
  Song,
  songLabel,
} from '../game';
import { SONGS, SONG_COUNT } from '../songs';

const song = (id: number, artist: string, title: string): Song => ({
  id,
  artist,
  title,
  year: 2000,
  matchedTrack: title,
  matchedArtist: artist,
  previewUrl: '',
  artworkUrl: '',
  appleMusicUrl: null,
});

const byLabel = (label: string): Song => {
  const found = SONGS.find((s) => songLabel(s) === label);
  if (!found) throw new Error(`not in the song list: ${label}`);
  return found;
};

// jest.config.js pins TZ to Europe/Vienna; a wrong zone must fail loudly, not shift every date case.
test('the test zone is Europe/Vienna', () => {
  expect(new Date(2026, 9, 21).getTimezoneOffset()).toBe(-120);
});

describe('puzzleNumber', () => {
  it('is 1 on the epoch day', () => {
    expect(puzzleNumber(new Date(2026, 7, 25))).toBe(1);
  });
  it('never drops below 1 before the epoch', () => {
    expect(puzzleNumber(new Date(2026, 7, 24))).toBe(1);
  });
  it('is 58 on 2026-10-21 at 10:00', () => {
    expect(puzzleNumber(new Date(2026, 9, 21, 10, 0))).toBe(58);
  });
  it('is still 58 at the last second of 2026-10-21', () => {
    expect(puzzleNumber(new Date(2026, 9, 21, 23, 59, 59))).toBe(58);
  });
  it('is 59 at local midnight on 2026-10-22', () => {
    expect(puzzleNumber(new Date(2026, 9, 22, 0, 0, 0))).toBe(59);
  });
  it('counts one puzzle per calendar day across the clock change in October', () => {
    expect(puzzleNumber(new Date(2026, 9, 24))).toBe(61);
    expect(puzzleNumber(new Date(2026, 9, 25))).toBe(62);
    expect(puzzleNumber(new Date(2026, 9, 26))).toBe(63);
  });
  it('counts one puzzle per calendar day across the clock change in March', () => {
    expect(puzzleNumber(new Date(2027, 2, 28))).toBe(216);
    expect(puzzleNumber(new Date(2027, 2, 29))).toBe(217);
  });
  it('is 129 on the last day of 2026', () => {
    expect(puzzleNumber(new Date(2026, 11, 31))).toBe(129);
  });
});

describe('dailySongIndex', () => {
  it('walks the list with a fixed stride', () => {
    expect(dailySongIndex(1, 98)).toBe(79);
    expect(dailySongIndex(2, 98)).toBe(60);
    expect(dailySongIndex(58, 98)).toBe(74);
    expect(dailySongIndex(98, 98)).toBe(0);
    expect(dailySongIndex(99, 98)).toBe(79);
    expect(dailySongIndex(58, 95)).toBe(72);
  });
  it('visits every index once per cycle and then repeats', () => {
    const seen = new Set<number>();
    for (let p = 1; p <= 98; p++) seen.add(dailySongIndex(p, 98));
    expect(seen.size).toBe(98);
    for (let p = 1; p <= 98; p++) {
      expect(dailySongIndex(p + 98, 98)).toBe(dailySongIndex(p, 98));
    }
  });
  it('covers the shipped list in one cycle', () => {
    const seen = new Set<number>();
    for (let p = 1; p <= SONG_COUNT; p++) seen.add(dailySongIndex(p, SONG_COUNT));
    expect(seen.size).toBe(SONG_COUNT);
    expect(SONG_COUNT).toBe(SONGS.length);
    expect(SONG_COUNT).toBeGreaterThanOrEqual(95);
  });
});

describe('normalize and songLabel', () => {
  it('lower-cases, strips accents and punctuation and collapses spaces', () => {
    expect(normalize('Beyoncé – Crazy in Love!')).toBe('beyonce crazy in love');
    expect(normalize('  Dua   Lipa ')).toBe('dua lipa');
    expect(normalize('')).toBe('');
  });
  it('joins artist and title with an en dash', () => {
    expect(songLabel(byLabel('Dua Lipa – Levitating'))).toBe('Dua Lipa – Levitating');
    expect(songLabel(song(1, 'A', 'B'))).toBe('A – B');
  });
});

describe('isCorrect, isPartial and classifyGuess', () => {
  const answer = song(10, 'Lady Gaga', 'Poker Face');
  const sameSong = song(11, 'LADY GAGA', 'Poker  Face');
  const sameArtist = song(12, 'Lady Gaga', 'Shallow');
  const other = song(13, 'Oasis', 'Wonderwall');

  it('accepts the same id or the same normalised artist and title', () => {
    expect(isCorrect(answer, answer)).toBe(true);
    expect(isCorrect(sameSong, answer)).toBe(true);
    expect(isCorrect(sameArtist, answer)).toBe(false);
    expect(isCorrect(other, answer)).toBe(false);
  });
  it('marks the right artist with the wrong title as partial', () => {
    expect(isPartial(sameArtist, answer)).toBe(true);
    expect(isPartial(answer, answer)).toBe(false);
    expect(isPartial(sameSong, answer)).toBe(false);
    expect(isPartial(other, answer)).toBe(false);
  });
  it('classifies the three outcomes', () => {
    expect(classifyGuess(answer, answer)).toBe('correct');
    expect(classifyGuess(sameArtist, answer)).toBe('partial');
    expect(classifyGuess(other, answer)).toBe('wrong');
  });
  it('works on the shipped list', () => {
    const pokerFace = byLabel('Lady Gaga – Poker Face');
    expect(classifyGuess(byLabel('Lady Gaga – Shallow'), pokerFace)).toBe('partial');
    expect(classifyGuess(pokerFace, pokerFace)).toBe('correct');
    expect(classifyGuess(byLabel('Oasis – Wonderwall'), pokerFace)).toBe('wrong');
  });
});

describe('searchSongs', () => {
  it('needs at least two characters', () => {
    expect(searchSongs(SONGS, 'a')).toEqual([]);
    expect(searchSongs(SONGS, 'e', 8)).toEqual([]);
    expect(searchSongs(SONGS, ' ')).toEqual([]);
  });
  it('matches on the artist', () => {
    expect(songLabel(searchSongs(SONGS, 'nirv')[0])).toBe('Nirvana – Smells Like Teen Spirit');
    expect(searchSongs(SONGS, 'lady gaga')).toHaveLength(3);
  });
  it('never returns more than the limit', () => {
    expect(searchSongs(SONGS, 'the').length).toBeLessThanOrEqual(8);
    expect(searchSongs(SONGS, 'the', 3).length).toBeLessThanOrEqual(3);
  });
  it('ranks a title that starts with the query first', () => {
    expect(songLabel(searchSongs(SONGS, 'crazy')[0])).toBe('Gnarls Barkley – Crazy');
    expect(searchSongs(SONGS, 'crazy').map(songLabel)).toContain('Beyoncé – Crazy in Love');
  });
  it('finds nothing for a query no song contains', () => {
    expect(searchSongs(SONGS, 'zzzz')).toEqual([]);
  });
});

describe('findExactMatch', () => {
  it('accepts the label with or without the dash', () => {
    expect(findExactMatch(SONGS, 'Dua Lipa – Levitating')).toBe(byLabel('Dua Lipa – Levitating'));
    expect(findExactMatch(SONGS, 'dua lipa levitating')).toBe(byLabel('Dua Lipa – Levitating'));
    expect(findExactMatch(SONGS, '  DUA LIPA - LEVITATING ')).toBe(byLabel('Dua Lipa – Levitating'));
  });
  it('accepts a title that only one song carries', () => {
    expect(findExactMatch(SONGS, 'levitating')).toBe(byLabel('Dua Lipa – Levitating'));
    expect(findExactMatch(SONGS, 'crazy')).toBe(byLabel('Gnarls Barkley – Crazy'));
  });
  it('rejects prefixes, partial words and empty input', () => {
    expect(findExactMatch(SONGS, 'la')).toBeNull();
    expect(findExactMatch(SONGS, 'levitat')).toBeNull();
    expect(findExactMatch(SONGS, '')).toBeNull();
  });
  it('rejects a title shared by two songs', () => {
    const list = [song(1, 'A', 'Same'), song(2, 'B', 'Same')];
    expect(findExactMatch(list, 'same')).toBeNull();
    expect(findExactMatch(list, 'a same')).toBe(list[0]);
  });
});
