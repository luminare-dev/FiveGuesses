import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stats } from '../storage';
import { colors, radius } from '../theme';

export function StatsCard({ stats }: { stats: Stats }) {
  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const items: Array<[string, string | number]> = [
    ['Played', stats.played],
    ['Win %', `${winRate}`],
    ['Streak', stats.streak],
    ['Best', stats.maxStreak],
  ];
  return (
    <View style={styles.row}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.cell}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
  },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  value: { color: colors.text, fontSize: 18, fontWeight: '800' },
  label: { color: colors.dim, fontSize: 11 },
});
