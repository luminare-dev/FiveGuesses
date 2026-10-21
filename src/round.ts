import { classifyGuess, GuessEntry, MAX_GUESSES, RoundStatus, Song, songLabel } from './game';

export type { GuessEntry, GuessKind, RoundStatus } from './game';

export type RoundMode = 'daily' | 'free';

export type RoundState = {
  mode: RoundMode;
  puzzle: number | null; // daily: the puzzle number; free: null
  songIndex: number; // index into SONGS
  entries: GuessEntry[]; // in order, length <= MAX_GUESSES; the winning guess is the last entry
  status: RoundStatus;
};

export type RoundEvent =
  | { type: 'guess'; song: Song }
  | { type: 'skip' }
  | {
      type: 'startDaily';
      puzzle: number;
      songIndex: number;
      saved: { entries: GuessEntry[]; status: RoundStatus } | null;
    }
  | { type: 'startFree'; songIndex: number };

// Pure: the same state object comes back when the event changes nothing.
export function roundReducer(state: RoundState, event: RoundEvent, answer: Song): RoundState {
  switch (event.type) {
    case 'startDaily':
      return {
        mode: 'daily',
        puzzle: event.puzzle,
        songIndex: event.songIndex,
        entries: event.saved ? [...event.saved.entries] : [],
        status: event.saved ? event.saved.status : 'playing',
      };
    case 'startFree':
      return { mode: 'free', puzzle: null, songIndex: event.songIndex, entries: [], status: 'playing' };
    case 'guess': {
      if (state.status !== 'playing') return state;
      const kind = classifyGuess(event.song, answer);
      if (kind === 'correct') {
        const entries: GuessEntry[] = [...state.entries, { kind, text: songLabel(answer) }];
        return { ...state, entries, status: 'won' };
      }
      return miss(state, { kind, text: songLabel(event.song) });
    }
    case 'skip':
      if (state.status !== 'playing') return state;
      return miss(state, { kind: 'skip' });
  }
}

function miss(state: RoundState, entry: GuessEntry): RoundState {
  const entries = [...state.entries, entry];
  return { ...state, entries, status: entries.length >= MAX_GUESSES ? 'lost' : 'playing' };
}

// Which snippet tier is open: one per miss, capped at the last tier.
export function unlockedIndex(state: RoundState): number {
  const misses = state.entries.filter((e) => e.kind !== 'correct').length;
  return Math.min(misses, MAX_GUESSES - 1);
}

export function isOver(state: RoundState): boolean {
  return state.status !== 'playing';
}
