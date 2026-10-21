// The pure part of the snippet player: types and the one decision function. The hook in
// useSnippetPlayer.ts owns the audio element and the timers; everything that can be checked
// without a browser lives here.

export type SnippetState = 'idle' | 'loading' | 'playing' | 'offline' | 'failed';

// Where playback stood when it started: the wall-clock instant and the position the media
// element reported. The stop timer is armed from these two values, not from the press, so a cold
// start that spends a while fetching still plays the whole snippet.
export type SnippetAnchor = { startedAt: number; offsetSeconds: number; seconds: number };

export type SnippetView = {
  state: SnippetState;
  // Length of the current or last requested snippet in seconds; null before the first press.
  seconds: number | null;
  anchor: SnippetAnchor | null;
  // The reported position clamped to [0, seconds] while playing, 0 otherwise.
  position: number;
  // The number of play presses so far. A press that ends in the same notice as the one before
  // (offline, offline again) changes only this, so the bar can announce the notice again.
  attempt: number;
};

export type SnippetAction = 'none' | 'start' | 'stop' | 'fail' | 'reanchor';

// The fields of an expo-audio status update that the decision reads.
export type SnippetStatus = { playing: boolean; currentTime: number; error?: string | null };

// How far the reported position may drift from the anchored estimate, in seconds, before the
// stop timer is re-armed from the reported position (a stall or a slow seek).
export const DRIFT_TOLERANCE = 0.15;

// Decides what the controller does with one status update. The play event arrives with
// playing: true before any data, so playback counts as started only once a position is reported.
export function nextSnippetAction(
  state: SnippetState,
  status: SnippetStatus,
  seconds: number,
  anchor: SnippetAnchor | null,
  now: number
): SnippetAction {
  if (status.error) return 'fail';
  if (state === 'loading') {
    return status.playing && status.currentTime > 0 ? 'start' : 'none';
  }
  if (state !== 'playing') return 'none';
  if (status.currentTime >= seconds) return 'stop';
  if (anchor !== null) {
    const expected = anchor.offsetSeconds + (now - anchor.startedAt) / 1000;
    if (Math.abs(expected - status.currentTime) > DRIFT_TOLERANCE) return 'reanchor';
  }
  return 'none';
}

// The reported position as the progress bar shows it.
export function clampPosition(currentTime: number, seconds: number | null): number {
  if (seconds === null || !Number.isFinite(currentTime)) return 0;
  return Math.min(Math.max(currentTime, 0), seconds);
}
