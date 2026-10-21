import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

// Sora is the only typeface. On web it resolves to the @font-face rule of the static shell, with
// the kit's fallbacks (system-ui, sans-serif) while it loads; the variable font carries weights
// 100 to 800 and no italic, so no style here is ever italic.
export const fontFamily = Platform.select({ web: 'Sora, system-ui, sans-serif', default: 'Sora' });

// Weights in use: 400 body and inputs, 500 captions and labels, 600 buttons and the subtitle,
// 700 headings and the song title, 800 stat values.
export type FontWeight = '400' | '500' | '600' | '700' | '800';

// Running text: line height 1.4.
export function text(size: number, weight: FontWeight = '400'): TextStyle {
  return { fontFamily, fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.4) };
}

// The wordmark and stat values: line height 1.2.
export function display(size: number, weight: FontWeight = '700'): TextStyle {
  return { fontFamily, fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.2) };
}

// Numbers that change in place (puzzle number, seconds, stats) keep their width.
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };
