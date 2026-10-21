import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SNIPPET_SECONDS } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  unlockedIndex: number; // 0..4 — how many snippet tiers are unlocked
  playingSeconds: number | null;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
};

export function SnippetBar({ unlockedIndex, playingSeconds, onPlay, onStop, disabled }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const seconds = SNIPPET_SECONDS[Math.min(unlockedIndex, SNIPPET_SECONDS.length - 1)];
  const max = SNIPPET_SECONDS[SNIPPET_SECONDS.length - 1];
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (playingSeconds != null) {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: playingSeconds * 1000,
        useNativeDriver: false,
      }).start();
    } else {
      progress.stopAnimation();
      progress.setValue(0);
    }
  }, [playingSeconds, progress]);

  const isPlaying = playingSeconds != null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={isPlaying ? onStop : onPlay}
        disabled={disabled}
        style={({ pressed }) => [styles.playBtn, pressed && styles.playBtnPressed, disabled && styles.disabled]}
      >
        <Text style={styles.playIcon}>{isPlaying ? '■' : '▶'}</Text>
      </Pressable>
      <View style={styles.barArea}>
        <View style={styles.track}>
          {/* Unlocked region */}
          <View style={[styles.unlocked, { width: `${(seconds / max) * 100}%` }]} />
          {/* Playback progress inside the unlocked region */}
          <Animated.View
            style={[
              styles.progress,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', `${((playingSeconds ?? seconds) / max) * 100}%`],
                }),
              },
            ]}
          />
          {/* Tier markers */}
          {SNIPPET_SECONDS.slice(0, -1).map((s) => (
            <View key={s} style={[styles.tick, { left: `${(s / max) * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.label}>
          {unlockedIndex < SNIPPET_SECONDS.length - 1
            ? t('snippet.status', { seconds, next: SNIPPET_SECONDS[unlockedIndex + 1] })
            : t('snippet.statusMax', { seconds })}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
    playBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playBtnPressed: { opacity: 0.8 },
    disabled: { opacity: 0.45 },
    playIcon: { color: theme.onPrimary, fontSize: 22, lineHeight: 26 },
    barArea: { flex: 1, gap: 6 },
    track: {
      height: 14,
      borderRadius: radius.sm,
      backgroundColor: theme.track,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    unlocked: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: theme.trackUnlocked },
    progress: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: theme.progress },
    tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: theme.tick },
    label: { ...text(13, '500'), ...tabularNums, color: theme.textMuted },
  });
}
