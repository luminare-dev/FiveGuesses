import React, { useMemo } from 'react';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RoundStatus, Song } from '../game';
import { t } from '../i18n';
import type { RoundMode } from '../round';
import { shareOutcomeMessage } from '../share';
import type { ShareOutcome } from '../share';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { display, tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { AnswerCard } from './AnswerCard';
import { Button } from './Button';
import { Countdown } from './Countdown';

type Props = {
  song: Song;
  status: RoundStatus;
  mode: RoundMode;
  // The ladder of a finished daily round; null in free play, where nothing is shared.
  shareText: string | null;
  shareOutcome: ShareOutcome | null;
  onShare: () => void;
  onFreePlay: () => void;
  onBackToDaily: () => void;
  // The result heading; the screen moves focus here when a round ends.
  headingRef?: Ref<Text>;
};

// The result once the round is over, below the board in the game card: the result as a heading,
// the answer, the share button with its outcome, the way into free play or back to the daily
// round, the countdown and the previews credit. The other modes stay in the mode picker.
export function Reveal({
  song,
  status,
  mode,
  shareText,
  shareOutcome,
  onShare,
  onFreePlay,
  onBackToDaily,
  headingRef,
}: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const won = status === 'won';
  const daily = mode === 'daily';

  return (
    <View style={styles.card}>
      <Text
        ref={headingRef}
        role="heading"
        aria-level={2}
        tabIndex={-1}
        style={[styles.headline, won ? styles.headlineWon : styles.headlineLost]}
      >
        {won ? t('reveal.won') : t('reveal.lost')}
      </Text>
      <AnswerCard song={song} />

      <View style={styles.actions}>
        {daily && shareText !== null && <Button label={t('reveal.share')} onPress={onShare} style={styles.half} />}
        <Button variant="secondary" label={t('reveal.freePlay')} onPress={onFreePlay} style={styles.half} />
        {!daily && (
          <Button variant="secondary" label={t('reveal.backToDaily')} onPress={onBackToDaily} style={styles.half} />
        )}
      </View>
      {daily && shareOutcome !== null && <Text style={styles.outcome}>{shareOutcomeMessage(shareOutcome)}</Text>}
      {daily && shareOutcome === 'failed' && shareText !== null && (
        <View role="group" aria-label={t('reveal.shareTextLabel')} style={styles.shareBlock}>
          <Text selectable style={styles.shareBlockText}>
            {shareText}
          </Text>
        </View>
      )}

      {daily && <Countdown style={styles.countdown} />}
      <Text style={styles.attribution}>{t('reveal.previewsCredit')}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: theme.cardBorder,
      paddingTop: 20,
      gap: 8,
    },
    headline: { ...display(22, '700') },
    headlineWon: { color: theme.correct },
    headlineLost: { color: theme.textSecondary },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, alignSelf: 'stretch' },
    half: { flexGrow: 1, flexBasis: 140 },
    outcome: { ...text(13, '500'), color: theme.textSecondary, textAlign: 'center' },
    shareBlock: {
      alignSelf: 'stretch',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.background,
      padding: 12,
    },
    shareBlockText: { ...text(15), ...tabularNums, color: theme.text },
    countdown: { marginTop: 8 },
    attribution: { ...text(13, '500'), color: theme.textMuted, marginTop: 6 },
  });
}
