import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SNIPPET_SECONDS } from '../game';
import { colors, radius } from '../theme';

type Props = {
  unlockedIndex: number; // 0..4 — how many snippet tiers are unlocked
  playingSeconds: number | null;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
};

export function SnippetBar({ unlockedIndex, playingSeconds, onPlay, onStop, disabled }: Props) {
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
        style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.85 }, disabled && { opacity: 0.4 }]}
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
          {seconds}s unlocked{unlockedIndex < SNIPPET_SECONDS.length - 1 ? ` · next: ${SNIPPET_SECONDS[unlockedIndex + 1]}s` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  barArea: { flex: 1, gap: 6 },
  track: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  unlocked: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.surfaceHi },
  progress: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.accent },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  label: { color: colors.dim, fontSize: 12 },
});
