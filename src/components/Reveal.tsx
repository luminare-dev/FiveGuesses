import React, { useMemo } from 'react';
import type { Ref } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { RoundStatus, Song, songLabel } from '../game';
import { t } from '../i18n';
import type { RoundMode } from '../round';
import { shareOutcomeMessage } from '../share';
import type { ShareOutcome } from '../share';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
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

const LISTEN_HINT_ID = 'reveal-listen-hint';

// The card shown once the round is over: the result as a heading, the artwork, the song, the
// link to the full track, the share button with its outcome, the way into free play or back to
// the daily round, the countdown and the previews credit.
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
  const label = songLabel(song);
  const appleMusicUrl = song.appleMusicUrl;
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
      {/* One image node: the wrapper carries the role and the name, the picture itself is
          hidden, since react-native-web adds an <img> of its own inside every Image. */}
      {song.artworkUrl !== '' && (
        <View role="img" aria-label={t('reveal.artwork', { song: label })} style={styles.art}>
          <Image source={{ uri: song.artworkUrl }} aria-hidden style={styles.artImage} />
        </View>
      )}
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.year}>{song.year}</Text>

      {appleMusicUrl !== null &&
        (Platform.OS === 'web' ? (
          <Text
            role="link"
            href={appleMusicUrl}
            hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
            aria-describedby={LISTEN_HINT_ID}
            style={styles.listen}
          >
            {t('reveal.listen')}
          </Text>
        ) : (
          <Pressable
            role="link"
            aria-describedby={LISTEN_HINT_ID}
            onPress={() => {
              void Linking.openURL(appleMusicUrl);
            }}
            style={styles.listen}
          >
            <Text style={styles.listenText}>{t('reveal.listen')}</Text>
          </Pressable>
        ))}
      <Text nativeID={LISTEN_HINT_ID} style={styles.hidden}>
        {t('reveal.listenHint')}
      </Text>

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
      backgroundColor: theme.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 8,
    },
    headline: { ...text(20, '700') },
    headlineWon: { color: theme.correct },
    headlineLost: { color: theme.textSecondary },
    art: { width: 160, height: 160, borderRadius: radius.md, marginTop: 6, overflow: 'hidden' },
    artImage: { width: '100%', height: '100%' },
    title: { ...text(17, '700'), color: theme.text, textAlign: 'center', marginTop: 6 },
    year: { ...text(13, '500'), ...tabularNums, color: theme.textSecondary },
    listen: {
      ...text(16, '600'),
      color: theme.text,
      display: 'flex',
      alignSelf: 'stretch',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: 8,
    },
    listenText: { ...text(16, '600'), color: theme.text },
    // Read through aria-describedby, not shown.
    hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
    half: { flex: 1 },
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
    attribution: { ...text(12, '500'), color: theme.textMuted, marginTop: 6 },
  });
}
