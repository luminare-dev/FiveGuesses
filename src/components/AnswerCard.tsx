import React, { useMemo } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { songLabel } from '../game';
import type { Song } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = { song: Song };

const LISTEN_HINT_ID = 'answer-listen-hint';

// The song of a finished round: the artwork, the song, the year when known and the link to the
// full track on Apple Music.
export function AnswerCard({ song }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const label = songLabel(song);
  const appleMusicUrl = song.appleMusicUrl;

  return (
    <View style={styles.wrap}>
      {/* One image node: the wrapper carries the role and the name, the picture itself is
          hidden, since react-native-web adds an <img> of its own inside every Image. */}
      {song.artworkUrl !== '' && (
        <View role="img" aria-label={t('reveal.artwork', { song: label })} style={styles.art}>
          <Image source={{ uri: song.artworkUrl }} aria-hidden style={styles.artImage} />
        </View>
      )}
      <Text style={styles.title}>{label}</Text>
      {song.year !== null && <Text style={styles.year}>{song.year}</Text>}

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
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', alignItems: 'center', gap: 8 },
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
  });
}
