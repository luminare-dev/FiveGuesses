import { Share } from 'react-native';
import { GuessEntry, MAX_GUESSES, RoundStatus, SNIPPET_SECONDS } from './game';
import { t } from './i18n';

// The board's own glyphs: one per used guess, in order.
export const SHARE_GLYPHS = { wrong: '✕', skip: '»', partial: '≈', correct: '✓' } as const;

export type ShareOutcome = 'shared' | 'copied' | 'failed';

// The person closed the share sheet without sharing: nothing was sent and nothing is announced.
export type ShareResult = ShareOutcome | 'cancelled';

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
  return [t('share.header', { puzzle, score }), ladder, host].join('\n');
}

// navigator.share rejects with an AbortError when the person dismisses the sheet.
function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

// The system share sheet first: on web this is navigator.share, which rejects where the
// browser has none. Then the clipboard. When both fail the caller shows the text to copy by
// hand. A dismissed sheet is a choice, not a failure, so nothing falls back to the clipboard.
// Called from the press handler, so the browser still counts the user's gesture.
export async function shareResult(text: string): Promise<ShareResult> {
  try {
    const result = await Share.share({ message: text });
    // iOS resolves with the dismissed action; the browser's navigator.share resolves empty.
    if (result?.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    // No share sheet here; the clipboard is next.
  }
  try {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (clipboard === undefined) return 'failed';
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// The line shown under the share button and announced once an attempt has ended.
export function shareOutcomeMessage(outcome: ShareOutcome): string {
  switch (outcome) {
    case 'shared':
      return t('reveal.shared');
    case 'copied':
      return t('reveal.copied');
    case 'failed':
      return t('reveal.shareFailed');
  }
}
