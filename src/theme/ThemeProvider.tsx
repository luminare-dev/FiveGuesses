import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { loadThemePreference, saveThemePreference } from '../storage';
import { dark, light, resolveScheme } from '../theme';
import type { ColorScheme, Theme, ThemePreference } from '../theme';
import { applySchemeToDocument } from './webDocument';

export type ThemeContextValue = {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

// Holds the stored preference (system until the stored value arrives), resolves it against the
// system setting and hands the matching role map to every component through useTheme.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const chosen = useRef(false);
  const system: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = resolveScheme(preference, system);
  const theme = scheme === 'dark' ? dark : light;

  useEffect(() => {
    let cancelled = false;
    void loadThemePreference().then((stored) => {
      // A choice made before the stored value arrived wins over the stored value.
      if (!cancelled && !chosen.current) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applySchemeToDocument(scheme, theme.background, preference);
  }, [scheme, theme.background, preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    chosen.current = true;
    setPreferenceState(next);
    void saveThemePreference(next);
  }, []);

  const value = useMemo(
    () => ({ theme, scheme, preference, setPreference }),
    [theme, scheme, preference, setPreference]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
