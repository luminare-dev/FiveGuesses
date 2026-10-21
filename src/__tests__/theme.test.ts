import { dark, light, palette, resolveScheme, Theme } from '../theme';

// WCAG 2.x relative luminance and contrast ratio.
function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type ColorRole = Exclude<keyof Theme, 'scheme'>;
type Pair = [ColorRole, ColorRole];

// Text on its background needs 4.5:1.
const LIGHT_TEXT: Pair[] = [
  ['text', 'background'], ['text', 'surface'],
  ['textSecondary', 'background'], ['textSecondary', 'surface'],
  ['textMuted', 'background'], ['textMuted', 'surface'],
  ['link', 'background'], ['link', 'surface'],
  ['onPrimary', 'primary'], ['onPrimary', 'primaryHover'], ['onPrimary', 'primaryPressed'],
  ['correct', 'surface'], ['onCorrect', 'correct'],
  ['partial', 'background'], ['partial', 'surface'], ['onPartial', 'partial'],
  ['wrongText', 'wrongFill'], ['wrongGlyph', 'wrongFill'],
  ['skipText', 'surface'],
];
// Component boundaries and large text need 3:1.
const LIGHT_UI: Pair[] = [
  ['primary', 'background'],
  ['focusRing', 'background'], ['focusRing', 'surface'],
  ['borderStrong', 'background'], ['borderStrong', 'surface'],
  ['correct', 'background'], ['partial', 'background'],
  ['progress', 'track'], ['activeRow', 'surface'],
];
const DARK_TEXT: Pair[] = [
  ['text', 'background'], ['text', 'surface'], ['text', 'surfaceHover'],
  ['textSecondary', 'background'], ['textSecondary', 'surface'], ['textSecondary', 'surfaceHover'],
  ['textMuted', 'background'], ['textMuted', 'surface'], ['textMuted', 'surfaceHover'],
  ['link', 'background'], ['link', 'surface'],
  ['onPrimary', 'primary'],
  ['correct', 'background'], ['correct', 'surface'], ['onCorrect', 'correct'],
  ['partial', 'background'], ['partial', 'surface'], ['onPartial', 'partial'],
  ['wrongText', 'wrongFill'], ['wrongGlyph', 'wrongFill'],
  ['skipText', 'background'], ['badge', 'background'],
];
const DARK_UI: Pair[] = [
  ['primary', 'background'],
  ['focusRing', 'background'], ['focusRing', 'surface'], ['focusRing', 'surfaceHover'],
  ['borderStrong', 'background'], ['borderStrong', 'surface'],
  ['correct', 'background'], ['partial', 'background'],
  ['progress', 'trackUnlocked'], ['activeRow', 'surface'],
];

const roles = (theme: Theme): Array<[string, string]> =>
  Object.entries(theme).filter(([name]) => name !== 'scheme');

describe('contrast', () => {
  test.each([
    ['#FFFFFF', '#0A1224', 18.67],
    ['#1F47C4', '#F3F6FB', 7.03],
    ['#028844', '#FFFFFF', 4.56],
    ['#5E6B84', '#0A1224', 3.48],
  ])('%s on %s is %s', (a, b, expected) => {
    expect(Math.abs(contrast(a, b) - expected)).toBeLessThanOrEqual(0.01);
  });
  it('is symmetric', () => {
    expect(contrast('#0A1224', '#FFFFFF')).toBe(contrast('#FFFFFF', '#0A1224'));
  });
});

describe('light theme', () => {
  it('is the light scheme', () => {
    expect(light.scheme).toBe('light');
  });
  test.each(LIGHT_TEXT)('text pair %s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(4.5);
  });
  test.each(LIGHT_UI)('component pair %s against %s reaches 3:1', (fg, bg) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('dark theme', () => {
  it('is the dark scheme', () => {
    expect(dark.scheme).toBe('dark');
  });
  test.each(DARK_TEXT)('text pair %s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });
  test.each(DARK_UI)('component pair %s against %s reaches 3:1', (fg, bg) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('every colour is a kit token', () => {
  // The two dark surfaces are White at 4 % and 8 % over Night, flattened for solid fills.
  const allowed = new Set<string>([...Object.values(palette), '#141B2D', '#1E2536']);
  test.each(roles(light))('light %s', (_name, value) => {
    expect(value).toMatch(/^#[0-9A-F]{6}$/);
    expect(allowed.has(value)).toBe(true);
  });
  test.each(roles(dark))('dark %s', (_name, value) => {
    expect(value).toMatch(/^#[0-9A-F]{6}$/);
    expect(allowed.has(value)).toBe(true);
  });
  it('gives both themes the same roles', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});

describe('resolveScheme', () => {
  it('follows the system when the preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });
  it('forces the chosen scheme otherwise', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});
