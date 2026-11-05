import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { palette, radius, withAlpha } from '../theme';
import type { Theme } from '../theme';
import { fluid } from './typography';

// The soft drop shadow under a card: a tight contact shadow and a wide, faint one. Raised is
// for a sheet over the page. Night on the light background, black on the dark one.
export function elevation(theme: Theme, raised = false): ViewStyle {
  const ink = theme.scheme === 'dark' ? '#000000' : palette.night;
  const [near, far] = theme.scheme === 'dark' ? [0.35, raised ? 0.5 : 0.28] : [0.06, raised ? 0.16 : 0.07];
  const spread = raised ? '0px 20px 48px' : '0px 10px 28px';
  return { boxShadow: `0px 1px 2px ${withAlpha(ink, near)}, ${spread} ${withAlpha(ink, far)}` };
}

// The tint behind a chosen tile: the primary colour at a low alpha over the surface.
export function selectedFill(theme: Theme): string {
  return withAlpha(theme.primary, theme.scheme === 'dark' ? 0.12 : 0.08);
}

// One card: surface fill, hairline, the large radius, fluid padding and the resting shadow.
export function card(theme: Theme): ViewStyle {
  return {
    alignSelf: 'stretch',
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: fluid(16, 28),
    ...elevation(theme),
  };
}

// A short ease on colour, shadow and position for hover and press, web only. The static shell
// cuts every transition to nothing under prefers-reduced-motion, and the components leave out
// the hover lift then as well.
export function transition(properties = 'background-color, border-color, box-shadow, transform, opacity'): ViewStyle {
  if (Platform.OS !== 'web') return {};
  return {
    transitionProperty: properties,
    transitionDuration: '160ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
  } as unknown as ViewStyle;
}
