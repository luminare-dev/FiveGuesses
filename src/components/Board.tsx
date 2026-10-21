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

// The accessible name of one row: the guess number, the outcome in words and the song.
// The glyph and the colours only repeat what the name says.
function rowLabel(n: number, entry: GuessEntry | undefined, active: boolean): string {
  if (entry === undefined) return active ? t('board.row.active', { n }) : t('board.row.empty', { n });
  switch (entry.kind) {
    case 'wrong':
      return t('board.row.wrong', { n, song: entry.text });
    case 'partial':
      return t('board.row.partial', { n, song: entry.text });
    case 'skip':
      return t('board.row.skip', { n });
    case 'correct':
      return t('board.row.correct', { n, song: entry.text });
  }
}

// The five guess rows as a list. Used rows carry the glyph and the song, a partial row adds
// the "right artist" hint, the next free row is outlined. The hint sits beside the song rather
// than inside it, so a long song is cut short and the hint always stays in view.
export function Board({ entries, activeIndex }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const entry = entries[i];
    const active = i === activeIndex;
    const label = rowLabel(i + 1, entry, active);
    if (entry) {
      const kind = styles.kinds[entry.kind];
      rows.push(
        <View key={i} role="listitem" aria-label={label} style={[styles.row, kind.row]}>
          <Text aria-hidden style={[styles.mark, kind.mark]}>
            {MARKS[entry.kind]}
          </Text>
          <View style={styles.rowBody}>
            <Text style={[styles.rowText, kind.text]} numberOfLines={1}>
              {entry.kind === 'skip' ? t('board.skipped') : entry.text}
            </Text>
            {entry.kind === 'partial' && (
              <Text style={[styles.rowText, styles.partialHint]}>{`· ${t('board.partialHint')}`}</Text>
            )}
          </View>
        </View>
      );
    } else {
      rows.push(<View key={i} role="listitem" aria-label={label} style={[styles.row, active && styles.rowActive]} />);
    }
  }
  return (
    <View role="list" aria-label={t('board.label')} style={styles.board}>
      {rows}
    </View>
  );
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
    rowActive: { borderColor: theme.activeRow, borderWidth: 2 },
    rowWrong: { backgroundColor: theme.wrongFill, borderColor: theme.wrongBorder },
    rowPartial: { borderColor: theme.partial },
    rowSkip: { borderColor: theme.skipBorder, borderStyle: 'dashed' },
    rowCorrect: { borderColor: theme.correct },
    mark: { ...text(15, '600'), width: 16, textAlign: 'center' },
    markWrong: { color: theme.wrongGlyph },
    markPartial: { color: theme.partial },
    markSkip: { color: theme.skipText },
    markCorrect: { color: theme.correct },
    rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
    rowText: { ...text(15), color: theme.text, flexShrink: 1 },
    textWrong: { color: theme.wrongText },
    textPartial: { color: theme.text },
    textSkip: { ...text(15, '600'), color: theme.skipText },
    textCorrect: { ...text(15, '700'), color: theme.correct },
    partialHint: { color: theme.partial, flexShrink: 0 },
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
