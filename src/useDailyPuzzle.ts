import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { nextLocalMidnight } from './clock';
import { puzzleNumber } from './game';

export type DailyPuzzle = {
  puzzle: number;
  // Re-reads the clock; the number changes only when the local date has moved on.
  recompute: () => void;
};

// Today's puzzle number, kept current while the page stays open: re-read when the tab becomes
// visible, on window focus, on pageshow (back-forward cache), one second after local midnight
// and on the first look at the clock once midnight has passed.
export function useDailyPuzzle(): DailyPuzzle {
  const [puzzle, setPuzzle] = useState<number>(() => puzzleNumber());

  const recompute = useCallback(() => {
    const next = puzzleNumber();
    setPuzzle((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recompute();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', recompute);
    window.addEventListener('pageshow', recompute);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', recompute);
      window.removeEventListener('pageshow', recompute);
    };
  }, [recompute]);

  // One timer past the next local midnight, re-armed after every rollover, and a look at the
  // wall clock once a second that renders nothing until midnight has passed: it catches a
  // midnight the timer missed, for example on a machine that slept through it.
  useEffect(() => {
    const midnight = nextLocalMidnight(new Date()).getTime();
    const timer = setTimeout(recompute, midnight - Date.now() + 1000);
    const check = setInterval(() => {
      if (Date.now() >= midnight) recompute();
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(check);
    };
  }, [puzzle, recompute]);

  return { puzzle, recompute };
}
