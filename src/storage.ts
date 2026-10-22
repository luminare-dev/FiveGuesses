import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuessEntry, MAX_GUESSES, MAX_ZONE_SHIFT_DAYS, RoundStatus } from './game';
import { emptyStats, normaliseStats, Stats } from './stats';
import type { ThemePreference } from './theme';

// Every key starts with "fg:" so resetAllData() can remove them in one go. The version in the
// key changes when the stored shape changes; one reader per old version migrates it and the old
// key is removed after a successful write. Nothing in this module throws.
export const STORAGE_PREFIX = 'fg:';
const STATS_KEY = 'fg:stats:v1';
const THEME_KEY = 'fg:theme:v1';
const ROUND_V2 = 'fg:round:v2:';
const ROUND_V1 = 'fg:round:v1:';
const roundKey = (puzzle: number) => `${ROUND_V2}${puzzle}`;
const legacyRoundKey = (puzzle: number) => `${ROUND_V1}${puzzle}`;

export type SavedRound = {
  version: 2;
  puzzle: number;
  entries: GuessEntry[];
  status: RoundStatus;
};

const STATUSES: readonly string[] = ['playing', 'won', 'lost'];
const TEXT_KINDS: readonly string[] = ['wrong', 'partial', 'correct'];

function isStatus(value: unknown): value is RoundStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}

function isEntry(value: unknown): value is GuessEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'skip') return true;
  return typeof v.kind === 'string' && TEXT_KINDS.includes(v.kind) && typeof v.text === 'string';
}

function isEntryList(value: unknown): value is GuessEntry[] {
  return Array.isArray(value) && value.length <= MAX_GUESSES && value.every(isEntry);
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

async function removeKeys(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  try {
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch {
    return false;
  }
}

async function allKeys(): Promise<string[]> {
  try {
    return [...(await AsyncStorage.getAllKeys())];
  } catch {
    return [];
  }
}

export async function loadStats(): Promise<Stats> {
  const data = parse(await getItem(STATS_KEY));
  return data === null ? emptyStats() : normaliseStats(data);
}

export function saveStats(stats: Stats): Promise<boolean> {
  return setItem(STATS_KEY, JSON.stringify(stats));
}

// Reads a round saved by the first release (guesses without the winning row) and writes it in the
// current shape. Skipped when today's v2 round already exists; pruneRounds() removes the rest.
export async function migrateRound(puzzle: number, answerLabel: string): Promise<void> {
  if ((await getItem(roundKey(puzzle))) !== null) return;
  const legacy = parse(await getItem(legacyRoundKey(puzzle)));
  if (typeof legacy !== 'object' || legacy === null) return;
  const l = legacy as Record<string, unknown>;
  if (l.puzzle !== puzzle || !isStatus(l.status) || !Array.isArray(l.guesses)) return;
  const entries: GuessEntry[] = l.guesses.filter(isEntry);
  if (l.status === 'won') entries.push({ kind: 'correct', text: answerLabel });
  if (entries.length > MAX_GUESSES) return;
  const round: SavedRound = { version: 2, puzzle, entries, status: l.status };
  if (await setItem(roundKey(puzzle), JSON.stringify(round))) {
    await removeKeys([legacyRoundKey(puzzle)]);
  }
}

// Keeps today's round. A round of one of the next MAX_ZONE_SHIFT_DAYS puzzles exists only when a
// change of time zone moved the date back; it stays so that board comes back with its day. Every
// v1 key and every other v2 key goes.
export async function pruneRounds(keepPuzzle: number): Promise<void> {
  const stale = (await allKeys()).filter((key) => {
    if (key.startsWith(ROUND_V1)) return true;
    if (!key.startsWith(ROUND_V2)) return false;
    const suffix = key.slice(ROUND_V2.length);
    const puzzle = /^\d+$/.test(suffix) ? Number(suffix) : Number.NaN;
    return !(puzzle >= keepPuzzle && puzzle - keepPuzzle <= MAX_ZONE_SHIFT_DAYS);
  });
  await removeKeys(stale);
}

export async function loadRound(puzzle: number): Promise<SavedRound | null> {
  const data = parse(await getItem(roundKey(puzzle)));
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 2 || d.puzzle !== puzzle || !isEntryList(d.entries) || !isStatus(d.status)) {
    return null;
  }
  return { version: 2, puzzle, entries: d.entries, status: d.status };
}

export function saveRound(round: { puzzle: number; entries: GuessEntry[]; status: RoundStatus }): Promise<boolean> {
  const saved: SavedRound = { version: 2, puzzle: round.puzzle, entries: round.entries, status: round.status };
  return setItem(roundKey(round.puzzle), JSON.stringify(saved));
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const raw = await getItem(THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function saveThemePreference(preference: ThemePreference): Promise<boolean> {
  return setItem(THEME_KEY, preference);
}

// Removes every key this app stored (prefix fg:); other keys in the same storage are left alone.
export async function resetAllData(): Promise<boolean> {
  const ours = (await allKeys()).filter((key) => key.startsWith(STORAGE_PREFIX));
  return removeKeys(ours);
}
