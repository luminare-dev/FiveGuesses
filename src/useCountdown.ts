import { useEffect, useState } from 'react';
import { countdownMs, formatCountdown } from './clock';

// The time left until the next local midnight as HH:MM:SS, ticking once a second from the
// wall clock. It stays at 00:00:00 in the first two seconds of a new day, while the rollover
// replaces the finished board, and counts down to the following midnight after that; a tab that
// slept catches up on its next tick. Only the Countdown component calls it, so the tick
// re-renders that text and nothing else; the rollover itself is useDailyPuzzle's job.
export function useCountdown(): string {
  const [text, setText] = useState<string>(() => formatCountdown(countdownMs(new Date())));

  useEffect(() => {
    const timer = setInterval(() => setText(formatCountdown(countdownMs(new Date()))), 1000);
    return () => clearInterval(timer);
  }, []);

  return text;
}
