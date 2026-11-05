// Luminare Development core palette (brand kit tokens), limited to what the game uses.
export const palette = {
  lumen: '#5BDFFF', azure: '#2D63DE', royal: '#1F47C4', abyss: '#15308A', night: '#0A1224',
  slate700: '#39445C', slate500: '#5E6B84', slate300: '#B7C1D3', slate100: '#E3E8F1',
  mist: '#F3F6FB', white: '#FFFFFF', mint: '#06F2C4',
  verdant: '#028844', verdantBright: '#58DD70', amber: '#B15204', amberBright: '#FFB334',
} as const;

export type Theme = {
  scheme: 'light' | 'dark';
  background: string; surface: string; surfaceHover: string;
  border: string; borderStrong: string;
  text: string; textSecondary: string; textMuted: string;
  primary: string; onPrimary: string; primaryHover: string; primaryPressed: string;
  link: string; focusRing: string; badge: string;
  correct: string; onCorrect: string; partial: string; onPartial: string;
  wrongFill: string; wrongBorder: string; wrongText: string; wrongGlyph: string;
  skipBorder: string; skipText: string;
  activeRow: string; track: string; trackUnlocked: string; progress: string; tick: string;
  // The hairline around a card: it only separates, the fill and the shadow carry the shape.
  cardBorder: string;
};

export const light: Theme = {
  scheme: 'light',
  background: palette.mist, surface: palette.white, surfaceHover: palette.slate100,
  border: palette.slate100, borderStrong: palette.slate500,
  text: palette.night, textSecondary: palette.slate700, textMuted: palette.slate500,
  primary: palette.royal, onPrimary: palette.white, primaryHover: palette.azure, primaryPressed: palette.abyss,
  link: palette.royal, focusRing: palette.royal, badge: palette.royal,
  correct: palette.verdant, onCorrect: palette.white, partial: palette.amber, onPartial: palette.white,
  wrongFill: palette.slate100, wrongBorder: palette.slate500, wrongText: palette.night, wrongGlyph: palette.slate700,
  skipBorder: palette.slate500, skipText: palette.slate500,
  activeRow: palette.royal, track: palette.slate100, trackUnlocked: palette.white, progress: palette.royal, tick: palette.slate500,
  cardBorder: palette.slate100,
};

export const dark: Theme = {
  scheme: 'dark',
  background: palette.night, surface: '#141B2D', surfaceHover: '#1E2536',   // White at 4 % / 8 % over Night
  border: palette.slate500, borderStrong: palette.slate500,
  text: palette.white, textSecondary: palette.slate300, textMuted: palette.slate300,
  primary: palette.lumen, onPrimary: palette.night, primaryHover: palette.lumen, primaryPressed: palette.lumen, // hover/pressed via opacity 0.9 / 0.8
  link: palette.lumen, focusRing: palette.mint, badge: palette.mint,
  correct: palette.verdantBright, onCorrect: palette.night, partial: palette.amberBright, onPartial: palette.night,
  wrongFill: '#141B2D', wrongBorder: palette.slate500, wrongText: palette.white, wrongGlyph: palette.slate300,
  skipBorder: palette.slate500, skipText: palette.slate300,
  activeRow: palette.lumen, track: '#141B2D', trackUnlocked: '#1E2536', progress: palette.lumen, tick: palette.slate500,
  cardBorder: '#1E2536',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

// A palette colour at an alpha, so no colour value lives in a component.
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const channel = (offset: number) => parseInt(value.slice(offset, offset + 2), 16);
  return `rgba(${channel(0)},${channel(2)},${channel(4)},${alpha})`;
}

// The stored choice: follow the system setting or force one scheme. Kept in fg:theme:v1.
export type ThemePreference = 'system' | 'light' | 'dark';

export type ColorScheme = Theme['scheme'];

export function resolveScheme(preference: ThemePreference, system: ColorScheme): ColorScheme {
  return preference === 'system' ? system : preference;
}
