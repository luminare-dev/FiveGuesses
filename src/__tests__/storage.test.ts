import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyStats } from '../stats';
import {
  loadRound,
  loadStats,
  loadThemePreference,
  migrateRound,
  pruneRounds,
  resetAllData,
  saveRound,
  saveStats,
  saveThemePreference,
} from '../storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('stats', () => {
  it('starts empty', async () => {
    expect(await loadStats()).toEqual(emptyStats());
  });
  it('round-trips through storage', async () => {
    const stats = { ...emptyStats(), played: 2, wins: 1, streak: 1, maxStreak: 1, lastPuzzleWon: 58, lastPuzzlePlayed: 58, dist: [0, 1, 0, 0, 0] };
    expect(await saveStats(stats)).toBe(true);
    expect(await loadStats()).toEqual(stats);
  });
  it('falls back to the empty stats on broken data', async () => {
    await AsyncStorage.setItem('fg:stats:v1', '{broken');
    await expect(loadStats()).resolves.toEqual(emptyStats());
  });
  it('reports a failed write instead of throwing', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(saveStats(emptyStats())).resolves.toBe(false);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('gone'));
    await expect(loadStats()).resolves.toEqual(emptyStats());
  });
});

describe('migrateRound', () => {
  it('adds the winning row to a won v1 round and removes the old key', async () => {
    await AsyncStorage.setItem(
      'fg:round:v1:58',
      JSON.stringify({ puzzle: 58, guesses: [{ kind: 'wrong', text: 'A – B' }], status: 'won' })
    );
    await migrateRound(58, 'Dua Lipa – Levitating');
    expect(JSON.parse((await AsyncStorage.getItem('fg:round:v2:58')) ?? 'null')).toEqual({
      version: 2,
      puzzle: 58,
      entries: [
        { kind: 'wrong', text: 'A – B' },
        { kind: 'correct', text: 'Dua Lipa – Levitating' },
      ],
      status: 'won',
    });
    expect(await AsyncStorage.getItem('fg:round:v1:58')).toBeNull();
    expect(await loadRound(58)).toEqual({
      version: 2,
      puzzle: 58,
      entries: [
        { kind: 'wrong', text: 'A – B' },
        { kind: 'correct', text: 'Dua Lipa – Levitating' },
      ],
      status: 'won',
    });
  });
  it('copies an unfinished v1 round without a winning row', async () => {
    await AsyncStorage.setItem(
      'fg:round:v1:58',
      JSON.stringify({ puzzle: 58, guesses: [{ kind: 'wrong', text: 'A – B' }, { kind: 'skip' }], status: 'playing' })
    );
    await migrateRound(58, 'Dua Lipa – Levitating');
    const round = await loadRound(58);
    expect(round?.entries).toEqual([{ kind: 'wrong', text: 'A – B' }, { kind: 'skip' }]);
    expect(round?.status).toBe('playing');
    expect(await AsyncStorage.getItem('fg:round:v1:58')).toBeNull();
  });
  it('leaves an existing v2 round alone', async () => {
    const v2 = JSON.stringify({ version: 2, puzzle: 58, entries: [{ kind: 'skip' }], status: 'playing' });
    const v1 = JSON.stringify({ puzzle: 58, guesses: [], status: 'won' });
    await AsyncStorage.setItem('fg:round:v2:58', v2);
    await AsyncStorage.setItem('fg:round:v1:58', v1);
    await migrateRound(58, 'Dua Lipa – Levitating');
    expect(await AsyncStorage.getItem('fg:round:v2:58')).toBe(v2);
    expect(await AsyncStorage.getItem('fg:round:v1:58')).toBe(v1);
  });
  it('does nothing without a v1 round or with a broken one', async () => {
    await migrateRound(58, 'Dua Lipa – Levitating');
    expect(await AsyncStorage.getItem('fg:round:v2:58')).toBeNull();
    await AsyncStorage.setItem('fg:round:v1:58', '{broken');
    await migrateRound(58, 'Dua Lipa – Levitating');
    expect(await AsyncStorage.getItem('fg:round:v2:58')).toBeNull();
  });
});

describe('pruneRounds', () => {
  it('keeps only the round of the given puzzle', async () => {
    await AsyncStorage.setItem('fg:round:v2:57', '{}');
    await AsyncStorage.setItem('fg:round:v2:58', '{}');
    await AsyncStorage.setItem('fg:round:v1:50', '{}');
    await AsyncStorage.setItem('fg:stats:v1', '{}');
    await AsyncStorage.setItem('other', 'x');
    await pruneRounds(58);
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(['fg:round:v2:58', 'fg:stats:v1', 'other']);
  });
  it('keeps the round of a later day the time zone moved back from, and no further', async () => {
    for (const puzzle of ['57', '58', '59', '60', '61', '400', 'x', '']) {
      await AsyncStorage.setItem(`fg:round:v2:${puzzle}`, '{}');
    }
    await pruneRounds(58);
    expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(['fg:round:v2:58', 'fg:round:v2:59', 'fg:round:v2:60']);
  });
});

describe('loadRound and saveRound', () => {
  it('round-trips a saved round', async () => {
    const entries = [{ kind: 'wrong' as const, text: 'A – B' }, { kind: 'partial' as const, text: 'C – D' }];
    expect(await saveRound({ puzzle: 58, entries, status: 'playing' })).toBe(true);
    expect(await loadRound(58)).toEqual({ version: 2, puzzle: 58, entries, status: 'playing' });
    expect(await loadRound(57)).toBeNull();
  });
  it('rejects a round of another puzzle', async () => {
    await AsyncStorage.setItem('fg:round:v2:58', JSON.stringify({ version: 2, puzzle: 57, entries: [], status: 'playing' }));
    expect(await loadRound(58)).toBeNull();
  });
  it('rejects unknown entry kinds, statuses, versions and too many entries', async () => {
    const put = (value: unknown) => AsyncStorage.setItem('fg:round:v2:58', JSON.stringify(value));
    await put({ version: 2, puzzle: 58, entries: [{ kind: 'nope' }], status: 'playing' });
    expect(await loadRound(58)).toBeNull();
    await put({ version: 2, puzzle: 58, entries: [{ kind: 'wrong' }], status: 'playing' });
    expect(await loadRound(58)).toBeNull();
    await put({ version: 2, puzzle: 58, entries: [], status: 'paused' });
    expect(await loadRound(58)).toBeNull();
    await put({ version: 1, puzzle: 58, entries: [], status: 'playing' });
    expect(await loadRound(58)).toBeNull();
    await put({ version: 2, puzzle: 58, entries: Array(6).fill({ kind: 'skip' }), status: 'lost' });
    expect(await loadRound(58)).toBeNull();
    await AsyncStorage.setItem('fg:round:v2:58', 'not json');
    expect(await loadRound(58)).toBeNull();
  });
});

describe('theme preference', () => {
  it('reads a stored choice and falls back to system', async () => {
    await AsyncStorage.setItem('fg:theme:v1', 'dark');
    expect(await loadThemePreference()).toBe('dark');
    await AsyncStorage.setItem('fg:theme:v1', 'purple');
    expect(await loadThemePreference()).toBe('system');
    await AsyncStorage.removeItem('fg:theme:v1');
    expect(await loadThemePreference()).toBe('system');
  });
  it('stores the choice as a plain string', async () => {
    expect(await saveThemePreference('light')).toBe(true);
    expect(await AsyncStorage.getItem('fg:theme:v1')).toBe('light');
    expect(await loadThemePreference()).toBe('light');
  });
});

describe('resetAllData', () => {
  it('removes every fg: key and nothing else', async () => {
    await AsyncStorage.setItem('fg:stats:v1', '{}');
    await AsyncStorage.setItem('fg:round:v2:58', '{}');
    await AsyncStorage.setItem('fg:theme:v1', 'dark');
    await AsyncStorage.setItem('other', 'x');
    expect(await resetAllData()).toBe(true);
    expect(await AsyncStorage.getAllKeys()).toEqual(['other']);
    expect(await loadStats()).toEqual(emptyStats());
    expect(await loadThemePreference()).toBe('system');
  });
});
