import { Song, songLabel } from '../game';
import { GuessEntry, isOver, roundReducer, RoundState, unlockedIndex } from '../round';
import { SONGS } from '../songs';

const byLabel = (label: string): Song => {
  const found = SONGS.find((s) => songLabel(s) === label);
  if (!found) throw new Error(`not in the song list: ${label}`);
  return found;
};

const answer = byLabel('Dua Lipa – Levitating');
const answerIndex = SONGS.indexOf(answer);
const wonderwall = byLabel('Oasis – Wonderwall');
const chandelier = byLabel('Sia – Chandelier');

const start = (saved: { entries: GuessEntry[]; status: RoundState['status'] } | null = null): RoundState =>
  roundReducer(
    { mode: 'free', puzzle: null, songIndex: 0, entries: [], status: 'lost' },
    { type: 'startDaily', puzzle: 58, songIndex: answerIndex, saved },
    answer
  );

const guess = (state: RoundState, song: Song) => roundReducer(state, { type: 'guess', song }, answer);
const skip = (state: RoundState) => roundReducer(state, { type: 'skip' }, answer);

describe('startDaily', () => {
  it('opens an empty daily round', () => {
    const state = start();
    expect(state).toEqual({ mode: 'daily', puzzle: 58, songIndex: answerIndex, entries: [], status: 'playing' });
    expect(isOver(state)).toBe(false);
    expect(unlockedIndex(state)).toBe(0);
  });
  it('restores a saved round verbatim', () => {
    const saved = { entries: [{ kind: 'wrong', text: 'Oasis – Wonderwall' }] as GuessEntry[], status: 'playing' as const };
    const state = start(saved);
    expect(state.entries).toEqual(saved.entries);
    expect(state.status).toBe('playing');
    expect(state.puzzle).toBe(58);
    expect(unlockedIndex(state)).toBe(1);
  });
  it('restores a won round as over', () => {
    const entries: GuessEntry[] = [{ kind: 'skip' }, { kind: 'correct', text: 'Dua Lipa – Levitating' }];
    const state = start({ entries, status: 'won' });
    expect(isOver(state)).toBe(true);
    expect(unlockedIndex(state)).toBe(1);
  });
});

describe('guess and skip', () => {
  it('wins on a correct first guess and stores the winning row', () => {
    const state = guess(start(), answer);
    expect(state.entries).toEqual([{ kind: 'correct', text: 'Dua Lipa – Levitating' }]);
    expect(state.status).toBe('won');
    expect(isOver(state)).toBe(true);
    expect(unlockedIndex(state)).toBe(0);
  });
  it('records two misses, a skip and the win in order', () => {
    let state = guess(start(), wonderwall);
    state = guess(state, chandelier);
    state = skip(state);
    expect(unlockedIndex(state)).toBe(3);
    expect(state.status).toBe('playing');
    state = guess(state, answer);
    expect(state.entries).toEqual([
      { kind: 'wrong', text: 'Oasis – Wonderwall' },
      { kind: 'wrong', text: 'Sia – Chandelier' },
      { kind: 'skip' },
      { kind: 'correct', text: 'Dua Lipa – Levitating' },
    ]);
    expect(state.status).toBe('won');
    expect(unlockedIndex(state)).toBe(3);
  });
  it('loses after five misses', () => {
    let state = start();
    for (let i = 0; i < 4; i++) state = guess(state, wonderwall);
    expect(unlockedIndex(state)).toBe(4);
    expect(state.status).toBe('playing');
    state = guess(state, wonderwall);
    expect(state.entries).toHaveLength(5);
    expect(state.entries.every((e) => e.kind === 'wrong')).toBe(true);
    expect(state.status).toBe('lost');
    expect(unlockedIndex(state)).toBe(4);
  });
  it('loses after five skips', () => {
    let state = start();
    for (let i = 0; i < 5; i++) state = skip(state);
    expect(state.entries).toEqual(Array(5).fill({ kind: 'skip' }));
    expect(state.status).toBe('lost');
  });
  it('ignores a guess or a skip once the round is over', () => {
    const won = guess(start(), answer);
    expect(guess(won, wonderwall)).toBe(won);
    expect(skip(won)).toBe(won);
    let lost = start();
    for (let i = 0; i < 5; i++) lost = skip(lost);
    expect(guess(lost, answer)).toBe(lost);
    expect(skip(lost)).toBe(lost);
  });
  it('marks the right artist with the wrong title as partial and counts it as a miss', () => {
    const pokerFace = byLabel('Lady Gaga – Poker Face');
    const shallow = byLabel('Lady Gaga – Shallow');
    const round: RoundState = { mode: 'daily', puzzle: 50, songIndex: SONGS.indexOf(pokerFace), entries: [], status: 'playing' };
    const state = roundReducer(round, { type: 'guess', song: shallow }, pokerFace);
    expect(state.entries).toEqual([{ kind: 'partial', text: 'Lady Gaga – Shallow' }]);
    expect(state.status).toBe('playing');
    expect(unlockedIndex(state)).toBe(1);
  });
  it('does not change the previous state object', () => {
    const before = start();
    const entries = before.entries;
    guess(before, wonderwall);
    expect(before.entries).toBe(entries);
    expect(before.entries).toEqual([]);
  });
});

describe('startFree', () => {
  it('opens a free round without a puzzle number', () => {
    const state = roundReducer(guess(start(), answer), { type: 'startFree', songIndex: 3 }, answer);
    expect(state).toEqual({ mode: 'free', puzzle: null, songIndex: 3, entries: [], status: 'playing' });
    expect(isOver(state)).toBe(false);
  });
});
