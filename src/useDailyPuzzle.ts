import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { msUntilLocalMidnight } from './clock';
import { puzzleNumber } from './game';

export type DailyPuzzle = {
  puzzle: number;
  // Re-reads the clock; the number changes only when the local date has moved on.
  recompute: () => void;
};

// Today's puzzle number, kept current while the page stays open: re-read when the tab becomes
// visible, on window focus, on pageshow (back-forward cache), one second after local midnight
// and from the countdown's zero callback.
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

  // One timer past the next local midnight, re-armed after every rollover.
  useEffect(() => {
    const timer = setTimeout(recompute, msUntilLocalMidnight(new Date()) + 1000);
    return () => clearTimeout(timer);
  }, [puzzle, recompute]);

  return { puzzle, recompute };
}
