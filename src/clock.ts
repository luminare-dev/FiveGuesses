// Local-midnight arithmetic for the daily rollover. Dates are built from calendar fields, so a
// day with a clock change is 23 or 25 hours long and the countdown follows the real wall clock.

export function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export function msUntilLocalMidnight(now: Date = new Date()): number {
  return nextLocalMidnight(now).getTime() - now.getTime();
}

// How long after local midnight the countdown stays at 00:00:00. The rollover replaces the
// finished board within a second of midnight (useDailyPuzzle looks at the clock once a second);
// until then the old board says the next song is due instead of counting down a whole new day.
export const ROLLOVER_HOLD_MS = 2000;

// The time the countdown shows: until the next local midnight, held at zero in the first moments
// of a new day while the rollover is on its way.
export function countdownMs(now: Date = new Date()): number {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return now.getTime() - startOfDay < ROLLOVER_HOLD_MS ? 0 : msUntilLocalMidnight(now);
}

const pad = (n: number) => String(n).padStart(2, '0');

// HH:MM:SS, floored to whole seconds and never negative; hours may pass 24 on a 25-hour day.
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
