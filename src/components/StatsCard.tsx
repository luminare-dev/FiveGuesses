import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { Stats, winRate } from '../stats';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { display, tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

export function StatsCard({ stats }: { stats: Stats }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const items: Array<[string, string | number]> = [
    [t('stats.played'), stats.played],
    [t('stats.winRate'), t('stats.winRateValue', { percent: winRate(stats) })],
    [t('stats.streak'), stats.streak],
    [t('stats.best'), stats.maxStreak],
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      backgroundColor: theme.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
    },
    cell: { flex: 1, alignItems: 'center', gap: 2 },
    value: { ...display(18, '800'), ...tabularNums, color: theme.text },
    label: { ...text(13, '500'), color: theme.textSecondary, textAlign: 'center' },
  });
}
