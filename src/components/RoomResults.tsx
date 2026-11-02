import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import type { PlayerView, RoundResult, Standing } from '../rooms/types';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

function resultLine(result: RoundResult): string {
  switch (result.status) {
    case 'won':
      return result.place !== null && result.place <= 3
        ? t('rooms.result.wonPlace', { seconds: result.seconds ?? 0, place: result.place })
        : t('rooms.result.won', { seconds: result.seconds ?? 0 });
    case 'lost':
    case 'playing':
      return t('rooms.status.lost');
    case 'skipped':
      return t('rooms.status.skipped');
    case 'out':
      return t('rooms.status.out');
    case 'waiting':
      return t('rooms.status.waiting');
  }
}

// One round: every player with the outcome and the points, the most points first.
export function RoundResults({ results, players }: { results: RoundResult[]; players: PlayerView[] }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const order = new Map(players.map((p, i) => [p.id, i]));
  const sorted = [...results]
    .filter((r) => names.has(r.id))
    .sort((a, b) => b.points - a.points || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return (
    <View role="list" aria-label={t('rooms.roundResults')} style={styles.list}>
      {sorted.map((r) => (
        <View key={r.id} role="listitem" style={styles.row}>
          <Text style={styles.name}>{names.get(r.id)}</Text>
          <Text style={styles.detail}>{resultLine(r)}</Text>
          <Text style={styles.points}>{t('rooms.plusPoints', { points: r.points })}</Text>
        </View>
      ))}
    </View>
  );
}

// The final standings: rank, name, points and songs named.
export function Standings({ standings }: { standings: Standing[] }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View role="list" aria-label={t('rooms.standings')} style={styles.list}>
      {standings.map((s) => (
        <View key={s.id} role="listitem" style={[styles.row, s.rank === 1 && styles.first]}>
          <Text style={styles.rank}>{t('rooms.rank', { rank: s.rank })}</Text>
          <Text style={styles.name}>{s.name}</Text>
          <Text style={styles.detail}>
            {s.correct === 1 ? t('rooms.correctOne') : t('rooms.correct', { count: s.correct })}
          </Text>
          <Text style={styles.points}>{t('rooms.points', { points: s.total })}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { gap: 8, alignSelf: 'stretch' },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 10,
      rowGap: 2,
      minHeight: 44,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    first: { borderColor: theme.correct, borderWidth: 2 },
    rank: { ...text(15, '700'), ...tabularNums, color: theme.text, minWidth: 28 },
    name: { ...text(15, '700'), color: theme.text, flexShrink: 1 },
    detail: { ...text(13, '500'), ...tabularNums, color: theme.textSecondary, flexShrink: 1 },
    points: { ...text(15, '700'), ...tabularNums, color: theme.text, marginLeft: 'auto' },
  });
}
