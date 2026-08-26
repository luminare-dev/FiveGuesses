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

export type GuessEntry = { kind: 'wrong'; text: string } | { kind: 'skip' };
export type RoundStatus = 'playing' | 'won' | 'lost';

export const MAX_GUESSES = 5;
// Snippet seconds unlocked per guess: doubles on every miss.
export const SNIPPET_SECONDS = [1, 2, 4, 8, 16];

// Puzzle #1 = this date. Rolls over at local midnight.
const EPOCH = new Date(2026, 7, 25); // 2026-08-25 (months are 0-based)

export function puzzleNumber(now: Date = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate()).getTime();
  return Math.max(1, Math.round((a - b) / 86400000) + 1);
}

// Deterministic full-cycle walk over the song list (7919 is prime, so it
// visits every index before repeating for any list length < 7919).
export function dailySongIndex(puzzle: number, songCount: number): number {
  return (puzzle * 7919) % songCount;
}

export function randomSongIndex(songCount: number, excludeIndex: number): number {
  if (songCount <= 1) return 0;
  let idx = Math.floor(Math.random() * songCount);
  if (idx === excludeIndex) idx = (idx + 1) % songCount;
  return idx;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function searchSongs(songs: Song[], query: string, limit = 8): Song[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const scored = songs
    .map((s) => {
      const label = normalize(`${s.artist} ${s.title}`);
      const title = normalize(s.title);
      let score = -1;
      if (title.startsWith(q)) score = 3;
      else if (label.startsWith(q)) score = 2;
      else if (label.includes(q)) score = 1;
      return { s, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title));
  return scored.slice(0, limit).map((x) => x.s);
}

export function shareText(puzzle: number, guesses: GuessEntry[], won: boolean): string {
  const cells: string[] = guesses.map((g) => (g.kind === 'skip' ? '⬜' : '🟥'));
  if (won) {
    // The winning guess replaces the last recorded state.
    cells.push('🟩');
  }
  while (cells.length < MAX_GUESSES) cells.push('⬛');
  const score = won ? `${cells.indexOf('🟩') + 1}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return `FiveGuesses #${puzzle} ${score} 🎵\n${cells.slice(0, MAX_GUESSES).join('')}\nfiveguesses.app`;
}
