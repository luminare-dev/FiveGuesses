import { useEffect, useRef, useState } from 'react';
import { formatCountdown, msUntilLocalMidnight, nextLocalMidnight } from './clock';

// The time left until the next local midnight as HH:MM:SS, ticking once a second from the
// wall clock. onZero runs once when the target is reached; the target then moves to the
// following midnight. A tab that slept past midnight catches up on its next tick.
export function useCountdown(onZero: () => void): string {
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;
  const [remaining, setRemaining] = useState<number>(() => msUntilLocalMidnight(new Date()));

  useEffect(() => {
    let target = nextLocalMidnight(new Date()).getTime();
    const tick = () => {
      const now = Date.now();
      let left = target - now;
      if (left <= 0) {
        onZeroRef.current();
        target = nextLocalMidnight(new Date(now)).getTime();
        left = target - now;
      }
      setRemaining(left);
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return formatCountdown(remaining);
}
