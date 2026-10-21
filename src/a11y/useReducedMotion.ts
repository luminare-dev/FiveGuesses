import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Whether the person asked for less motion. On web react-native-web reads the
// prefers-reduced-motion media query and reports changes through reduceMotionChanged.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {});
    // Without a media query (tests, native) react-native-web returns no subscription.
    const subscription: { remove: () => void } | undefined = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced
    );
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return reduced;
}
