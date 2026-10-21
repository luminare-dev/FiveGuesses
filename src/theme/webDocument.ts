import { dark, light } from '../theme';
import type { ColorScheme, ThemePreference } from '../theme';

const DARK_MEDIA = /prefers-color-scheme:\s*dark/;

// Tells the static shell which scheme is active: html[data-theme] drives the focus ring, the
// selection colour and the body background in styles.css, color-scheme switches the form controls
// and scrollbars, and the theme-color metas colour the browser's title bar. The browser uses the
// first theme-color meta whose media matches, and one of the shell's two media-scoped metas always
// matches, so they carry the chosen background while a light or dark choice is set and go back to
// their own scheme's background while the system setting is followed. The meta without a media
// query follows the active background. A no-op without a document (native, tests).
export function applySchemeToDocument(scheme: ColorScheme, background: string, preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.setProperty('color-scheme', scheme);
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta === null) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = background;
  for (const scoped of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')) {
    const own = DARK_MEDIA.test(scoped.getAttribute('media') ?? '') ? dark.background : light.background;
    scoped.content = preference === 'system' ? own : background;
  }
}
