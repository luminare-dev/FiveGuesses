import { GuessEntry, MAX_GUESSES, RoundStatus, SNIPPET_SECONDS } from './game';

// The board's own glyphs: one per used guess, in order.
export const SHARE_GLYPHS = { wrong: '✕', skip: '»', partial: '≈', correct: '✓' } as const;

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export type ShareInput = {
  puzzle: number;
  entries: readonly GuessEntry[];
  status: RoundStatus;
  host: string;
};

// Three lines, no trailing newline:
//   FiveGuesses #58 3/5
//   1s ✕ · 2s » · 4s ✓
//   fiveguesses.app
// A loss reads X/5 and lists all five entries; unused guesses are not shown.
export function shareText({ puzzle, entries, status, host }: ShareInput): string {
  const score = status === 'won' ? `${entries.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const ladder = entries
    .map((entry, i) => `${SNIPPET_SECONDS[i]}s ${SHARE_GLYPHS[entry.kind]}`)
    .join(' · ');
  return [`FiveGuesses #${puzzle} ${score}`, ladder, host].join('\n');
}

// Hands the text to the system share sheet or the clipboard. Until the share flow is wired up,
// every attempt reports a failure so the caller shows the text to copy by hand.
export async function shareResult(text: string): Promise<ShareOutcome> {
  void text;
  return 'failed';
}
