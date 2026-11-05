import React, { useMemo } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import type { Theme } from '../theme';
import { display, fluid } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  // The controls on the right: the sheet openers on the game screen, Leave in a room.
  children?: ReactNode;
};

// The banner: the wordmark on the left and the screen's controls on the right, on one line from
// 320 px up (the controls wrap below the wordmark only when they do not fit).
export function Header({ children }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View role="banner" style={styles.header}>
      <Wordmark />
      {children !== undefined && <View style={styles.buttons}>{children}</View>}
    </View>
  );
}

// The wordmark as the page's one top-level heading. The second word takes the primary colour;
// the text itself stays one string from the dictionary.
export function Wordmark() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const title = t('app.title');
  const cut = title.slice(1).search(/[A-Z]/);
  const head = cut < 0 ? title : title.slice(0, cut + 1);
  const tail = cut < 0 ? '' : title.slice(cut + 1);
  return (
    <Text role="heading" aria-level={1} style={styles.wordmark}>
      {head}
      <Text style={styles.wordmarkAccent}>{tail}</Text>
    </Text>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 44,
    },
    // 21 px on a phone, so the wordmark and both sheet openers share one line from 360 px.
    wordmark: { ...display(21, '800'), fontSize: fluid(21, 32), color: theme.text, letterSpacing: -0.4 },
    wordmarkAccent: { color: theme.primary },
    buttons: { flexDirection: 'row', gap: fluid(6, 10), marginLeft: 'auto' },
  });
}
