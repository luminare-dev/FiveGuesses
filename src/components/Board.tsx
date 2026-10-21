import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GuessEntry, MAX_GUESSES } from '../game';
import { colors, radius } from '../theme';

type Props = { entries: GuessEntry[]; activeIndex: number | null };

const MARKS = { wrong: '✕', partial: '≈', skip: '»', correct: '✓' } as const;

export function Board({ entries, activeIndex }: Props) {
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const entry = entries[i];
    if (entry) {
      rows.push(
        <View key={i} style={[styles.row, rowStyles[entry.kind]]}>
          <Text style={styles.mark}>{MARKS[entry.kind]}</Text>
          <Text style={[styles.rowText, entry.kind === 'skip' && styles.skipText]} numberOfLines={1}>
            {entry.kind === 'skip' ? 'Skipped' : entry.kind === 'partial' ? `${entry.text} · right artist` : entry.text}
          </Text>
        </View>
      );
    } else {
      const active = i === activeIndex;
      rows.push(<View key={i} style={[styles.row, styles.rowEmpty, active && styles.rowActive]} />);
    }
  }
  return <View style={styles.board}>{rows}</View>;
}

const styles = StyleSheet.create({
  board: { gap: 8, alignSelf: 'stretch' },
  row: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  rowEmpty: {},
  rowActive: { borderColor: colors.dim },
  rowWrong: { borderColor: colors.red },
  rowPartial: { borderColor: colors.gold },
  rowSkip: { borderColor: colors.border },
  rowWin: { borderColor: colors.green, backgroundColor: '#12281c' },
  mark: { color: colors.dim, fontSize: 15, width: 16, textAlign: 'center' },
  rowText: { color: colors.text, fontSize: 15, flex: 1 },
  skipText: { color: colors.dim, fontStyle: 'italic' },
});

const rowStyles = {
  wrong: styles.rowWrong,
  partial: styles.rowPartial,
  skip: styles.rowSkip,
  correct: styles.rowWin,
} as const;
