import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuessEntry, RoundStatus, MAX_GUESSES } from './game';

export type Stats = {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  lastPuzzleWon: number | null;
  lastPuzzlePlayed: number | null;
  dist: number[]; // wins by number of guesses used (index 0 = won in 1)
};

export type SavedRound = {
  puzzle: number;
  guesses: GuessEntry[];
  status: RoundStatus;
};

const STATS_KEY = 'fg:stats:v1';
const roundKey = (puzzle: number) => `fg:round:v1:${puzzle}`;

export const emptyStats = (): Stats => ({
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  lastPuzzleWon: null,
  lastPuzzlePlayed: null,
  dist: Array(MAX_GUESSES).fill(0),
});

export async function loadStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    return { ...emptyStats(), ...JSON.parse(raw) };
  } catch {
    return emptyStats();
  }
}

export async function recordResult(puzzle: number, won: boolean, guessesUsed: number): Promise<Stats> {
  const s = await loadStats();
  if (s.lastPuzzlePlayed === puzzle) return s; // already recorded
  s.played += 1;
  s.lastPuzzlePlayed = puzzle;
  if (won) {
    s.wins += 1;
    s.streak = s.lastPuzzleWon === puzzle - 1 ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.lastPuzzleWon = puzzle;
    s.dist[Math.min(guessesUsed, MAX_GUESSES) - 1] += 1;
  } else {
    s.streak = 0;
  }
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(s));
  return s;
}

export async function saveRound(round: SavedRound): Promise<void> {
  try {
    await AsyncStorage.setItem(roundKey(round.puzzle), JSON.stringify(round));
  } catch {}
}

export async function loadRound(puzzle: number): Promise<SavedRound | null> {
  try {
    const raw = await AsyncStorage.getItem(roundKey(puzzle));
    return raw ? (JSON.parse(raw) as SavedRound) : null;
  } catch {
    return null;
  }
}
