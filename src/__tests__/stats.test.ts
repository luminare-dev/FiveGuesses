import { applyResult, displayStreak, emptyStats, normaliseStats, winRate } from '../stats';

describe('applyResult', () => {
  it('records a win, a streak, a loss and a broken streak, and ignores a repeat', () => {
    const s1 = applyResult(emptyStats(), 58, true, 3);
    expect(s1).toEqual({
      played: 1,
      wins: 1,
      streak: 1,
      maxStreak: 1,
      lastPuzzleWon: 58,
      lastPuzzlePlayed: 58,
      dist: [0, 0, 1, 0, 0],
    });

    const s2 = applyResult(s1, 59, true, 1);
    expect(s2.streak).toBe(2);
    expect(s2.maxStreak).toBe(2);
    expect(s2.dist).toEqual([1, 0, 1, 0, 0]);

    const s3 = applyResult(s2, 60, false, 5);
    expect(s3.played).toBe(3);
    expect(s3.wins).toBe(2);
    expect(s3.streak).toBe(0);
    expect(s3.maxStreak).toBe(2);
    expect(s3.lastPuzzleWon).toBe(59);
    expect(s3.lastPuzzlePlayed).toBe(60);
    expect(s3.dist).toEqual([1, 0, 1, 0, 0]);

    const s4 = applyResult(s3, 62, true, 5);
    expect(s4.streak).toBe(1);
    expect(s4.maxStreak).toBe(2);
    expect(s4.dist).toEqual([1, 0, 1, 0, 1]);
    expect(s4.lastPuzzleWon).toBe(62);

    expect(applyResult(s4, 62, true, 1)).toBe(s4);
    expect(applyResult(s4, 62, false, 5)).toBe(s4);
  });
  it('records nothing again when a change of time zone moves the puzzle number back', () => {
    const s = applyResult(applyResult(emptyStats(), 58, true, 2), 59, true, 1);
    expect(s).toMatchObject({ played: 2, wins: 2, streak: 2, lastPuzzlePlayed: 59 });
    expect(applyResult(s, 58, true, 1)).toBe(s);
    expect(applyResult(s, 57, false, 5)).toBe(s);
    // The day comes round again in the new zone: still the same object.
    expect(applyResult(s, 59, true, 3)).toBe(s);
    const next = applyResult(s, 60, true, 1);
    expect(next).toMatchObject({ played: 3, wins: 3, streak: 3, maxStreak: 3, lastPuzzlePlayed: 60 });
  });
  it('goes on recording after a clock that ran ahead was corrected', () => {
    const ahead = applyResult(emptyStats(), 400, true, 2);
    expect(applyResult(ahead, 398, true, 1)).toBe(ahead);
    const corrected = applyResult(ahead, 60, true, 1);
    expect(corrected).toEqual({
      played: 2,
      wins: 2,
      streak: 1,
      maxStreak: 1,
      lastPuzzleWon: 60,
      lastPuzzlePlayed: 60,
      dist: [1, 1, 0, 0, 0],
    });
    expect(applyResult(corrected, 61, false, 5)).toMatchObject({ played: 3, streak: 0, lastPuzzlePlayed: 61 });
  });
  it('never changes the object it was given', () => {
    const before = emptyStats();
    applyResult(before, 58, true, 2);
    expect(before).toEqual(emptyStats());
  });
  it('clamps the guess count into the distribution', () => {
    expect(applyResult(emptyStats(), 5, true, 9).dist[4]).toBe(1);
    expect(applyResult(emptyStats(), 5, true, 0).dist[0]).toBe(1);
  });
});

describe('normaliseStats', () => {
  it('turns anything that is not an object into the empty stats', () => {
    expect(normaliseStats('garbage')).toEqual(emptyStats());
    expect(normaliseStats(null)).toEqual(emptyStats());
    expect(normaliseStats({})).toEqual(emptyStats());
    expect(normaliseStats([1, 2])).toEqual(emptyStats());
    expect(normaliseStats(undefined)).toEqual(emptyStats());
  });
  it('replaces invalid fields and pads the distribution', () => {
    const s = normaliseStats({ played: '3', dist: [1, 2] });
    expect(s.played).toBe(0);
    expect(s.dist).toEqual([1, 2, 0, 0, 0]);
  });
  it('truncates a distribution that is too long', () => {
    expect(normaliseStats({ dist: [1, 2, 3, 4, 5, 6, 7] }).dist).toEqual([1, 2, 3, 4, 5]);
  });
  it('rejects negative and fractional counters', () => {
    const s = normaliseStats({ played: -1, wins: 2.5 });
    expect(s.played).toBe(0);
    expect(s.wins).toBe(0);
  });
  it('keeps a valid record as it is', () => {
    const valid = { played: 4, wins: 3, streak: 2, maxStreak: 3, lastPuzzleWon: 58, lastPuzzlePlayed: 58, dist: [1, 1, 1, 0, 0] };
    expect(normaliseStats(valid)).toEqual(valid);
    expect(normaliseStats({ ...valid, lastPuzzleWon: null })).toEqual({ ...valid, lastPuzzleWon: null });
    expect(normaliseStats({ ...valid, lastPuzzleWon: 'x', dist: ['a', 2] }).lastPuzzleWon).toBeNull();
    expect(normaliseStats({ ...valid, dist: ['a', 2] }).dist).toEqual([0, 2, 0, 0, 0]);
  });
});

describe('displayStreak and winRate', () => {
  it('shows the streak only while no day was missed', () => {
    expect(displayStreak({ streak: 3, lastPuzzleWon: 56 }, 58)).toBe(0);
    expect(displayStreak({ streak: 3, lastPuzzleWon: 57 }, 58)).toBe(3);
    expect(displayStreak({ streak: 3, lastPuzzleWon: 58 }, 58)).toBe(3);
    expect(displayStreak({ streak: 3, lastPuzzleWon: null }, 58)).toBe(0);
  });
  it('rounds the win rate to whole percent', () => {
    expect(winRate({ played: 0, wins: 0 })).toBe(0);
    expect(winRate({ played: 3, wins: 2 })).toBe(67);
    expect(winRate({ played: 4, wins: 4 })).toBe(100);
  });
});
