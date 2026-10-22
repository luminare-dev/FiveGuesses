import { useEffect, useState } from 'react';
import { formatCountdown, msUntilLocalMidnight } from './clock';

// The time left until the next local midnight as HH:MM:SS, ticking once a second from the
// wall clock; past midnight it counts down to the following one, and a tab that slept catches
// up on its next tick. Only the Countdown component calls it, so the tick re-renders that text
// and nothing else; the rollover itself is useDailyPuzzle's job.
export function useCountdown(): string {
  const [text, setText] = useState<string>(() => formatCountdown(msUntilLocalMidnight(new Date())));

  useEffect(() => {
    const timer = setInterval(() => setText(formatCountdown(msUntilLocalMidnight(new Date()))), 1000);
    return () => clearInterval(timer);
  }, []);

  return text;
}
