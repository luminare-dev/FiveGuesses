import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

// Sora is the only typeface. On web it resolves to the @font-face rule of the static shell, with
// the kit's fallbacks (system-ui, sans-serif) while it loads; the variable font carries weights
// 100 to 800 and no italic, so no style here is ever italic.
export const fontFamily = Platform.select({ web: 'Sora, system-ui, sans-serif', default: 'Sora' });

// Weights in use: 400 body and inputs, 500 captions and labels, 600 buttons and the subtitle,
// 700 headings and the song title, 800 stat values.
export type FontWeight = '400' | '500' | '600' | '700' | '800';

// The viewport widths between which a fluid size grows from its minimum to its maximum.
const FLUID_FROM = 360;
const FLUID_TO = 1440;

// A length that grows with the viewport width on web: min px at 360 px and below, max px at
// 1440 px and above, linear in between (CSS clamp()). Native has no viewport unit and keeps min.
// The typings only know numbers, which is what native gets; react-native-web passes the string on.
export function fluid(min: number, max: number): number {
  if (Platform.OS !== 'web' || min === max) return min;
  const slope = (max - min) / (FLUID_TO - FLUID_FROM);
  const base = min - slope * FLUID_FROM;
  return `clamp(${min}px, ${base.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw, ${max}px)` as unknown as number;
}

// On web the line height is a ratio, so it follows the fluid font size.
function lineHeight(size: number, ratio: number): number {
  return Platform.OS === 'web' ? (String(ratio) as unknown as number) : Math.round(size * ratio);
}

// Running text: line height 1.4. Up to an eighth larger on a wide screen.
export function text(size: number, weight: FontWeight = '400'): TextStyle {
  return { fontFamily, fontSize: fluid(size, Math.round(size * 1.125)), fontWeight: weight, lineHeight: lineHeight(size, 1.4) };
}

// The wordmark, headings and stat values: line height 1.2. Up to a third larger on a wide screen.
export function display(size: number, weight: FontWeight = '700'): TextStyle {
  return { fontFamily, fontSize: fluid(size, Math.round(size * 1.33)), fontWeight: weight, lineHeight: lineHeight(size, 1.2) };
}

// Numbers that change in place (puzzle number, seconds, stats) keep their width.
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };
