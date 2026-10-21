import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { SnippetView } from '../audio/snippetLogic';
import { SNIPPET_SECONDS } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  unlockedIndex: number; // 0..4: which snippet tier is open
  view: SnippetView;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
  // Receives the loading, offline and failed notices for the live region.
  announce?: (message: string) => void;
  // Takes a notice back from the live region once it no longer holds.
  withdraw?: (message: string) => void;
  // The play/stop button; the screen moves focus here when a new round starts.
  playButtonRef?: Ref<View>;
};

const LAST_TIER = SNIPPET_SECONDS.length - 1;
const MAX_SECONDS = SNIPPET_SECONDS[LAST_TIER];
// A preview that starts within this time is not announced as loading.
const LOADING_NOTICE_DELAY = 400;
// The fill's element id: styles.css paints it in the system highlight colour in forced-colours
// mode, where every background would otherwise turn into the page colour and hide the progress.
const PROGRESS_FILL_ID = 'snippet-progress-fill';

export function SnippetBar({
  unlockedIndex,
  view,
  onPlay,
  onStop,
  disabled = false,
  announce,
  withdraw,
  playButtonRef,
}: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const tier = Math.min(Math.max(unlockedIndex, 0), LAST_TIER);
  const seconds = SNIPPET_SECONDS[tier];
  // The button reads as pressed while a snippet is loading or playing; a notice state offers
  // play again, which retries.
  const active = view.state === 'loading' || view.state === 'playing';
  const progress = useRef(new Animated.Value(0)).current;

  // Animated fill from the anchor: it starts at the reported position and reaches the end of
  // the snippet when the stop timer fires. A re-anchor restarts it from the new position.
  useEffect(() => {
    if (reducedMotion || view.state !== 'playing' || view.anchor === null) return undefined;
    const { offsetSeconds, seconds: total } = view.anchor;
    progress.setValue(total > 0 ? Math.min(1, offsetSeconds / total) : 0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, total - offsetSeconds) * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, view.state, view.anchor, progress]);

  // Stepwise fill from the reported position under reduced motion, and the reset to zero.
  useEffect(() => {
    if (!reducedMotion && view.state === 'playing') return;
    progress.stopAnimation();
    const total = view.seconds ?? 0;
    progress.setValue(view.state === 'playing' && total > 0 ? Math.min(1, view.position / total) : 0);
  }, [reducedMotion, view.state, view.position, view.seconds, progress]);

  const notice =
    view.state === 'loading'
      ? t('snippet.loading')
      : view.state === 'offline'
        ? t('snippet.offline')
        : view.state === 'failed'
          ? t('snippet.failed')
          : null;
  const loading = view.state === 'loading';
  const announceRef = useRef(announce);
  announceRef.current = announce;
  const withdrawRef = useRef(withdraw);
  withdrawRef.current = withdraw;
  // The notice this bar last sent to the live region, with the press it answered. It is taken
  // back as soon as the state moves on, so the region never shows a notice the bar no longer
  // shows. The offline and failed notices are sent at once, and again on every further press
  // that ends in the same notice (the retry gets an answer even when a guess was announced in
  // between); the loading notice only when loading takes a while.
  const announced = useRef<{ notice: string; attempt: number } | null>(null);
  const attempt = view.attempt;
  useEffect(() => {
    const previous = announced.current;
    if (previous !== null && previous.notice !== notice) {
      announced.current = null;
      withdrawRef.current?.(previous.notice);
    }
    if (notice === null) return undefined;
    if (previous !== null && previous.notice === notice && previous.attempt === attempt) return undefined;
    const send = () => {
      announced.current = { notice, attempt };
      announceRef.current?.(notice);
    };
    if (!loading) {
      send();
      return undefined;
    }
    const timer = setTimeout(send, LOADING_NOTICE_DELAY);
    return () => clearTimeout(timer);
  }, [notice, loading, attempt]);

  const statusLine =
    view.state === 'playing'
      ? t('snippet.playing', { seconds: view.seconds ?? seconds })
      : tier < LAST_TIER
        ? t('snippet.status', { seconds, next: SNIPPET_SECONDS[tier + 1] })
        : t('snippet.statusMax', { seconds });

  // The snippet the bar measures, for the fill and the progressbar values alike: the one that is
  // playing (a guess or a skip during playback opens the next tier but does not lengthen it),
  // otherwise the unlocked tier.
  const fillSeconds = view.state === 'playing' && view.seconds !== null ? view.seconds : seconds;
  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${(fillSeconds / MAX_SECONDS) * 100}%`],
  });

  return (
    <View style={styles.wrap}>
      <Pressable
        ref={playButtonRef}
        role="button"
        aria-label={active ? t('snippet.stop') : t('snippet.play', { seconds })}
        aria-pressed={active}
        disabled={disabled}
        onPress={active ? onStop : onPlay}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [
          styles.playButton,
          hovered && !pressed && !disabled && styles.playButtonHover,
          pressed && !disabled && styles.playButtonPressed,
          disabled && styles.disabled,
        ]}
      >
        {/* U+FE0E asks for the text form of the play triangle, which some systems would
            otherwise draw as a coloured emoji; the stop square has no emoji form. */}
        <Text aria-hidden style={styles.playGlyph}>
          {active ? '■' : '▶\uFE0E'}
        </Text>
      </Pressable>
      <View style={styles.barArea}>
        <View
          role="progressbar"
          aria-label={t('snippet.progress')}
          aria-valuemin={0}
          aria-valuemax={fillSeconds}
          aria-valuenow={Math.min(view.position, fillSeconds)}
          style={styles.track}
        >
          <View aria-hidden style={[styles.unlocked, { width: `${(seconds / MAX_SECONDS) * 100}%` }]} />
          <Animated.View nativeID={PROGRESS_FILL_ID} aria-hidden style={[styles.progress, { width: fillWidth }]} />
          {SNIPPET_SECONDS.slice(0, -1).map((s) => (
            <View key={s} aria-hidden style={[styles.tick, { left: `${(s / MAX_SECONDS) * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.label}>{notice ?? statusLine}</Text>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const dims = theme.scheme === 'dark';
  return StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
    playButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.primary,
      // Invisible here; forced-colours mode draws it as the circle's outline (see Button).
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    playButtonHover: dims ? { opacity: 0.9 } : { backgroundColor: theme.primaryHover },
    playButtonPressed: dims ? { opacity: 0.8 } : { backgroundColor: theme.primaryPressed },
    disabled: { opacity: 0.45 },
    playGlyph: { color: theme.onPrimary, fontSize: 22, lineHeight: 26 },
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
