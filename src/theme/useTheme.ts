import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import type { ThemeContextValue } from './ThemeProvider';

// The active role map plus the scheme and the stored preference. Components build their styles
// from theme inside useMemo so a scheme change re-colours everything at once.
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme needs a ThemeProvider above it');
  return value;
}
