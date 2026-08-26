import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GuessEntry, MAX_GUESSES } from '../game';
import { colors, radius } from '../theme';

type Props = { guesses: GuessEntry[]; winningLabel?: string | null };

export function Board({ guesses, winningLabel }: Props) {
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const g = guesses[i];
    if (g) {
      rows.push(
        <View key={i} style={[styles.row, g.kind === 'wrong' ? styles.rowWrong : styles.rowSkip]}>
          <Text style={styles.mark}>{g.kind === 'wrong' ? '✕' : '»'}</Text>
          <Text style={[styles.rowText, g.kind === 'skip' && styles.skipText]} numberOfLines={1}>
            {g.kind === 'wrong' ? g.text : 'Skipped'}
          </Text>
        </View>
      );
    } else if (winningLabel && i === guesses.length) {
      rows.push(
        <View key={i} style={[styles.row, styles.rowWin]}>
          <Text style={styles.mark}>✓</Text>
          <Text style={styles.rowText} numberOfLines={1}>
            {winningLabel}
          </Text>
        </View>
      );
    } else {
      const active = !winningLabel && i === guesses.length;
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
  rowSkip: { borderColor: colors.border },
  rowWin: { borderColor: colors.green, backgroundColor: '#12281c' },
  mark: { color: colors.dim, fontSize: 15, width: 16, textAlign: 'center' },
  rowText: { color: colors.text, fontSize: 15, flex: 1 },
  skipText: { color: colors.dim, fontStyle: 'italic' },
});
