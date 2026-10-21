import React, { useMemo, useState } from 'react';
import { Image, Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { SITE_HOST } from '../config';
import { GuessEntry, RoundStatus, Song, songLabel } from '../game';
import { t } from '../i18n';
import { shareText } from '../share';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  song: Song;
  status: RoundStatus;
  entries: GuessEntry[];
  puzzle: number | null; // null = free play (no share)
  onFreePlay: () => void;
};

export function Reveal({ song, status, entries, puzzle, onFreePlay }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [copied, setCopied] = useState(false);
  const won = status === 'won';
  const appleMusicUrl = song.appleMusicUrl;

  const doShare = async () => {
    if (puzzle == null) return;
    const message = shareText({ puzzle, entries, status, host: SITE_HOST });
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    } else {
      try {
        await Share.share({ message });
      } catch {}
    }
  };

  return (
    <View style={styles.card}>
      <Text style={[styles.headline, won ? styles.headlineWon : styles.headlineLost]}>
        {won ? t('reveal.won') : t('reveal.lost')}
      </Text>
      {!!song.artworkUrl && <Image source={{ uri: song.artworkUrl }} style={styles.art} />}
      <Text style={styles.title}>{songLabel(song)}</Text>
      <Text style={styles.year}>{song.year}</Text>

      {appleMusicUrl !== null && (
        <Button
          variant="secondary"
          label={t('reveal.listen')}
          onPress={() => {
            void Linking.openURL(appleMusicUrl);
          }}
          style={styles.listen}
        />
      )}

      <View style={styles.actions}>
        {puzzle != null && <Button label={t('reveal.share')} onPress={() => void doShare()} style={styles.half} />}
        <Button variant="secondary" label={t('reveal.freePlay')} onPress={onFreePlay} style={styles.half} />
      </View>
      {copied && <Text style={styles.status}>{t('reveal.copied')}</Text>}

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
    art: { width: 160, height: 160, borderRadius: radius.md, marginTop: 6 },
    title: { ...text(17, '700'), color: theme.text, textAlign: 'center', marginTop: 6 },
    year: { ...text(13, '500'), ...tabularNums, color: theme.textSecondary },
    listen: { marginTop: 8 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
    half: { flex: 1 },
    status: { ...text(13, '500'), color: theme.textSecondary },
    attribution: { ...text(12, '500'), color: theme.textMuted, marginTop: 10 },
  });
}
