import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { Theme } from '../theme';
import { COLUMN_MAX, PAGE_MAX, useLayout } from '../theme/layout';
import { fluid } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  children: ReactNode;
  // Sheets and other layers that sit above the scrolling page.
  overlay?: ReactNode;
};

// Every screen's frame: the status bar, the scrolling page and one centred column, 600 px wide
// at most in the one-column layout and 1080 px in the two-column one. The side gutters grow with
// the window and keep clear of the notch of a landscape phone. On web the page is transparent,
// so the body's background (styles.css) shows through.
export function Page({ children, overlay }: Props) {
  const { theme, scheme } = useTheme();
  const { twoColumns } = useLayout();
  const styles = useMemo(() => makeStyles(theme, twoColumns), [theme, twoColumns]);
  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

// max(gutter, safe-area inset) on web; the plain gutter elsewhere.
function gutter(min: number, max: number, side: 'left' | 'right'): number {
  const value = fluid(min, max);
  if (Platform.OS !== 'web') return value;
  const css = typeof value === 'number' ? `${value}px` : String(value);
  return `max(${css}, env(safe-area-inset-${side}))` as unknown as number;
}

function makeStyles(theme: Theme, twoColumns: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : theme.background },
    fill: { flex: 1 },
    scroll: {
      flexGrow: 1,
      alignItems: 'center',
      paddingTop: fluid(16, 32),
      paddingBottom: fluid(16, 32),
      paddingLeft: gutter(16, 40, 'left'),
      paddingRight: gutter(16, 40, 'right'),
    },
    column: {
      width: '100%',
      maxWidth: twoColumns ? PAGE_MAX : COLUMN_MAX,
      alignSelf: 'center',
      flexGrow: 1,
      gap: fluid(16, 28),
    },
  });
}
