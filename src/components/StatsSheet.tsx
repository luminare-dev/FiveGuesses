import React, { useMemo } from 'react';
import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { displayStreak, emptyStats, winRate } from '../stats';
import type { Stats } from '../stats';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { display, tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Countdown } from './Countdown';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  openerRef: RefObject<View | null>;
  // Null until the stats have been read from storage.
  stats: Stats | null;
  // The streak shown is zero once a day was missed, so the sheet needs today's number.
  todayPuzzle: number;
  // True while today's round is over: the sheet then shows the time until the next song.
  showCountdown: boolean;
};

const TITLE_ID = 'stats-title';

// The four numbers, the guess distribution and, once today's round is over, the countdown.
// Every number is a list item named "label: value" (stats.item); the visual value and label are
// hidden from assistive technology so nothing is read twice.
export function StatsSheet({ visible, onClose, openerRef, stats, todayPuzzle, showCountdown }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const shown = stats ?? emptyStats();
  const numbers: Array<{ label: string; value: string }> = [
    { label: t('stats.played'), value: String(shown.played) },
    { label: t('stats.winRate'), value: t('stats.winRateValue', { percent: winRate(shown) }) },
    { label: t('stats.streak'), value: String(displayStreak(shown, todayPuzzle)) },
    { label: t('stats.best'), value: String(shown.maxStreak) },
  ];
  const longest = Math.max(1, ...shown.dist);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      openerRef={openerRef}
      title={t('stats.title')}
      titleId={TITLE_ID}
      closeLabel={t('stats.close')}
    >
      <View role="list" style={styles.numbers}>
        {numbers.map(({ label, value }) => (
          <View key={label} role="listitem" aria-label={t('stats.item', { label, value })} style={styles.cell}>
            <Text aria-hidden style={styles.value}>
              {value}
            </Text>
            <Text aria-hidden style={styles.label}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text role="heading" aria-level={3} style={styles.subheading}>
        {t('stats.distribution')}
      </Text>
      <View role="list" style={styles.distribution}>
        {shown.dist.map((count, index) => (
          <View key={index} role="listitem" aria-label={t('stats.distRow', { n: index + 1, count })} style={styles.distRow}>
            <Text aria-hidden style={styles.distIndex}>
              {index + 1}
            </Text>
            <View aria-hidden style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round((count / longest) * 100)}%` }]} />
            </View>
            <Text aria-hidden style={styles.distCount}>
              {count}
            </Text>
          </View>
        ))}
      </View>
      {showCountdown && <Countdown />}
    </Sheet>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    numbers: { flexDirection: 'row', gap: 4 },
    cell: { flex: 1, alignItems: 'center', gap: 2 },
    value: { ...display(22, '800'), ...tabularNums, color: theme.text },
    label: { ...text(13, '500'), color: theme.textSecondary, textAlign: 'center' },
    subheading: { ...text(16, '700'), color: theme.text, marginTop: 4 },
    distribution: { gap: 6 },
    distRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    distIndex: { ...text(15, '600'), ...tabularNums, color: theme.textSecondary, width: 16, textAlign: 'center' },
    track: { flex: 1, height: 20, borderRadius: radius.sm, backgroundColor: theme.track, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: theme.primary, borderRadius: radius.sm },
    distCount: { ...text(15, '600'), ...tabularNums, color: theme.text, width: 32, textAlign: 'right' },
  });
}
