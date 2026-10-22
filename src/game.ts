export type Song = {
  id: number;
  artist: string;
  title: string;
  year: number;
  matchedTrack: string;
  matchedArtist: string;
  previewUrl: string;
  artworkUrl: string;
  appleMusicUrl: string | null;
};

export type GuessKind = 'wrong' | 'partial' | 'skip' | 'correct';
// A round stores the winning guess as its own entry, so a saved round carries the whole board.
export type GuessEntry = { kind: 'wrong' | 'partial' | 'correct'; text: string } | { kind: 'skip' };
export type RoundStatus = 'playing' | 'won' | 'lost';

export const MAX_GUESSES = 5;
// Snippet seconds unlocked per guess: doubles on every miss.
export const SNIPPET_SECONDS: readonly number[] = [1, 2, 4, 8, 16];

// Puzzle #1 = this date. Rolls over at local midnight.
const EPOCH = new Date(2026, 7, 25); // 2026-08-25 (months are 0-based)

export function puzzleNumber(now: Date = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate()).getTime();
  return Math.max(1, Math.round((a - b) / 86400000) + 1);
}

// The most a change of time zone moves the local date, and so the puzzle number, back: the zones
// span UTC-12 to UTC+14, two calendar days. A bigger step back means the clock was corrected.
export const MAX_ZONE_SHIFT_DAYS = 2;

// Fixed stride over the song list. 7919 is prime, so for any list shorter than 7919 songs every
// index is served exactly once before the order repeats: puzzle n + songCount plays the same song
// as puzzle n, and two consecutive puzzles are always 7919 mod songCount positions apart.
export function dailySongIndex(puzzle: number, songCount: number): number {
  return (puzzle * 7919) % songCount;
}

// Apostrophes and periods vanish ("Don't" -> "dont", "R.E.M." -> "rem") and every other mark
// becomes a word break ("AC/DC" -> "ac dc"), so a guess typed without the punctuation (phone
// keyboards add none with autocorrect off) still finds the song.
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['\u2018\u2019\u02bc`\u00b4.]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A normalised text without its spaces: "acdc", "aha" and "antihero" then match "AC/DC", "a-ha"
// and "Anti-Hero", whose marks became word breaks.
function compact(normalised: string): string {
  return normalised.replace(/ /g, '');
}

export function songLabel(s: Song): string {
  return `${s.artist} – ${s.title}`;
}

export function isCorrect(guess: Song, answer: Song): boolean {
  if (guess.id === answer.id) return true;
  return (
    normalize(guess.title) === normalize(answer.title) &&
    normalize(guess.artist) === normalize(answer.artist)
  );
}

// Right artist, wrong title: counts as a miss but is shown as its own state.
export function isPartial(guess: Song, answer: Song): boolean {
  if (isCorrect(guess, answer)) return false;
  return normalize(guess.artist) === normalize(answer.artist);
}

export function classifyGuess(guess: Song, answer: Song): Exclude<GuessKind, 'skip'> {
  if (isCorrect(guess, answer)) return 'correct';
  if (isPartial(guess, answer)) return 'partial';
  return 'wrong';
}

export function searchSongs(songs: readonly Song[], query: string, limit = 8): Song[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  // Compared without spaces, so a word break the player left out (or added) does not matter.
  const qc = compact(q);
  const scored = songs
    .map((s) => {
      const label = compact(normalize(`${s.artist} ${s.title}`));
      const title = compact(normalize(s.title));
      let score = -1;
      if (title.startsWith(qc)) score = 3;
      else if (label.startsWith(qc)) score = 2;
      else if (label.includes(qc)) score = 1;
      return { s, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title));
  return scored.slice(0, limit).map((x) => x.s);
}

// A typed guess counts without picking a suggestion when it names exactly one song: the full
// "artist title" or "artist – title" (the dash vanishes under normalisation), or a title that
// only one song in the list carries. Spaces are ignored, as in searchSongs.
export function findExactMatch(songs: readonly Song[], query: string): Song | null {
  const q = compact(normalize(query));
  if (!q) return null;
  const full = songs.find((s) => compact(normalize(`${s.artist} ${s.title}`)) === q);
  if (full) return full;
  const byTitle = songs.filter((s) => compact(normalize(s.title)) === q);
  return byTitle.length === 1 ? byTitle[0] : null;
}
