import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GuessEntry, MAX_GUESSES } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = { entries: GuessEntry[]; activeIndex: number | null };

const MARKS = { wrong: '✕', partial: '≈', skip: '»', correct: '✓' } as const;

export function Board({ entries, activeIndex }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const entry = entries[i];
    if (entry) {
      const kind = styles.kinds[entry.kind];
      rows.push(
        <View key={i} style={[styles.row, kind.row]}>
          <Text style={[styles.mark, kind.mark]}>{MARKS[entry.kind]}</Text>
          <Text style={[styles.rowText, kind.text]} numberOfLines={1}>
            {entry.kind === 'skip' ? t('board.skipped') : entry.text}
            {entry.kind === 'partial' && <Text style={styles.partialHint}>{` · ${t('board.partialHint')}`}</Text>}
          </Text>
        </View>
      );
    } else {
      const active = i === activeIndex;
      rows.push(<View key={i} style={[styles.row, active && styles.rowActive]} />);
    }
  }
  return <View style={styles.board}>{rows}</View>;
}

function makeStyles(theme: Theme) {
  const sheet = StyleSheet.create({
    board: { gap: 8, alignSelf: 'stretch' },
    row: {
      minHeight: 44,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 10,
    },
    rowActive: { borderColor: theme.activeRow },
    rowWrong: { backgroundColor: theme.wrongFill, borderColor: theme.wrongBorder },
    rowPartial: { borderColor: theme.partial },
    rowSkip: { borderColor: theme.skipBorder, borderStyle: 'dashed' },
    rowCorrect: { borderColor: theme.correct },
    mark: { ...text(15, '600'), width: 16, textAlign: 'center' },
    markWrong: { color: theme.wrongGlyph },
    markPartial: { color: theme.partial },
    markSkip: { color: theme.skipText },
    markCorrect: { color: theme.correct },
    rowText: { ...text(15), color: theme.text, flex: 1 },
    textWrong: { color: theme.wrongText },
    textPartial: { color: theme.text },
    textSkip: { ...text(15, '600'), color: theme.skipText },
    textCorrect: { ...text(15, '700'), color: theme.correct },
    partialHint: { color: theme.partial },
  });
  return {
    ...sheet,
    kinds: {
      wrong: { row: sheet.rowWrong, mark: sheet.markWrong, text: sheet.textWrong },
      partial: { row: sheet.rowPartial, mark: sheet.markPartial, text: sheet.textPartial },
      skip: { row: sheet.rowSkip, mark: sheet.markSkip, text: sheet.textSkip },
      correct: { row: sheet.rowCorrect, mark: sheet.markCorrect, text: sheet.textCorrect },
    },
  };
}
