import React, { useMemo } from 'react';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import type { RoundMode } from '../round';
import type { Theme } from '../theme';
import { display, tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  mode: RoundMode;
  // The daily puzzle number; null in free play.
  puzzle: number | null;
  onOpenStats: () => void;
  onOpenAbout: () => void;
  // The buttons that open the sheets; focus returns to them when a sheet closes.
  statsButtonRef: Ref<View>;
  aboutButtonRef: Ref<View>;
};

// The wordmark as the page's one top-level heading, the subtitle with the puzzle number and
// the two sheet openers. The second word of the wordmark takes the primary colour; the text
// itself stays one string from the dictionary.
export function Header({ mode, puzzle, onOpenStats, onOpenAbout, statsButtonRef, aboutButtonRef }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const title = t('app.title');
  const cut = title.slice(1).search(/[A-Z]/);
  const head = cut < 0 ? title : title.slice(0, cut + 1);
  const tail = cut < 0 ? '' : title.slice(cut + 1);
  const subtitle =
    mode === 'daily' && puzzle !== null ? t('app.subtitle.daily', { puzzle }) : t('app.subtitle.free');

  return (
    <View role="banner" style={styles.header}>
      <View style={styles.row}>
        <Text role="heading" aria-level={1} style={styles.wordmark}>
          {head}
          <Text style={styles.wordmarkAccent}>{tail}</Text>
        </Text>
        <View style={styles.buttons}>
          <Button ref={statsButtonRef} variant="secondary" label={t('header.stats')} onPress={onOpenStats} />
          <Button ref={aboutButtonRef} variant="secondary" label={t('header.about')} onPress={onOpenAbout} />
        </View>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    header: { alignSelf: 'stretch', gap: 6 },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    wordmark: { ...display(26, '700'), color: theme.text },
    wordmarkAccent: { color: theme.primary },
    buttons: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
    subtitle: { ...text(13, '600'), ...tabularNums, color: theme.textSecondary },
  });
}
