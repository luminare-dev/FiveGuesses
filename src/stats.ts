import { MAX_GUESSES, MAX_ZONE_SHIFT_DAYS } from './game';

export type Stats = {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  lastPuzzleWon: number | null;
  lastPuzzlePlayed: number | null;
  dist: number[]; // wins by number of guesses used (index 0 = won on the first guess)
};

export const emptyStats = (): Stats => ({
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  lastPuzzleWon: null,
  lastPuzzlePlayed: null,
  dist: Array<number>(MAX_GUESSES).fill(0),
});

// Records one finished daily round. A puzzle that was already recorded changes nothing and the
// same object comes back, so finishing a restored round twice cannot double-count. The same holds
// for any puzzle up to MAX_ZONE_SHIFT_DAYS before the last one recorded: the number only goes back
// when the time zone moved the date back, and those days were played or passed already. A longer
// step back is a corrected clock, and recording goes on from the corrected day.
export function applyResult(stats: Stats, puzzle: number, won: boolean, guessesUsed: number): Stats {
  const last = stats.lastPuzzlePlayed;
  if (last !== null && puzzle <= last && last - puzzle <= MAX_ZONE_SHIFT_DAYS) return stats;
  const next: Stats = { ...stats, dist: [...stats.dist] };
  next.played += 1;
  next.lastPuzzlePlayed = puzzle;
  if (won) {
    next.wins += 1;
    next.streak = stats.lastPuzzleWon === puzzle - 1 ? stats.streak + 1 : 1;
    next.maxStreak = Math.max(stats.maxStreak, next.streak);
    next.lastPuzzleWon = puzzle;
    const slot = Math.min(Math.max(1, Math.floor(guessesUsed)), MAX_GUESSES) - 1;
    next.dist[slot] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function puzzleOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

// Validates whatever came out of storage: counters are integers >= 0, the two puzzle markers are
// integers or null, the distribution has exactly MAX_GUESSES slots. Anything that is not an
// object becomes the empty stats; an invalid field falls back on its own.
export function normaliseStats(raw: unknown): Stats {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyStats();
  const r = raw as Record<string, unknown>;
  const dist = Array.isArray(r.dist) ? r.dist.slice(0, MAX_GUESSES).map(count) : [];
  while (dist.length < MAX_GUESSES) dist.push(0);
  return {
    played: count(r.played),
    wins: count(r.wins),
    streak: count(r.streak),
    maxStreak: count(r.maxStreak),
    lastPuzzleWon: puzzleOrNull(r.lastPuzzleWon),
    lastPuzzlePlayed: puzzleOrNull(r.lastPuzzlePlayed),
    dist,
  };
}

// The streak shown today: a streak ends once a day was missed, even before today's round is played.
export function displayStreak(stats: Pick<Stats, 'streak' | 'lastPuzzleWon'>, todayPuzzle: number): number {
  if (stats.lastPuzzleWon === null || stats.lastPuzzleWon < todayPuzzle - 1) return 0;
  return stats.streak;
}

// Whole percent, 0 before the first round.
export function winRate(stats: Pick<Stats, 'played' | 'wins'>): number {
  if (stats.played <= 0) return 0;
  return Math.round((stats.wins / stats.played) * 100);
}
