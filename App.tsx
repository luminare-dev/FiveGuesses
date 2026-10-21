import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Board } from './src/components/Board';
import { GuessInput } from './src/components/GuessInput';
import { Reveal } from './src/components/Reveal';
import { SnippetBar } from './src/components/SnippetBar';
import { StatsCard } from './src/components/StatsCard';
import { pickFreePlayIndex } from './src/freePlay';
import { t } from './src/i18n';
import { dailySongIndex, puzzleNumber, SNIPPET_SECONDS, songLabel } from './src/game';
import { useSnippetPlayer } from './src/player';
import { isOver, roundReducer, RoundEvent, RoundState, unlockedIndex } from './src/round';
import { SONGS, SONG_COUNT } from './src/songs';
import { applyResult, emptyStats, Stats } from './src/stats';
import { loadRound, loadStats, migrateRound, pruneRounds, saveRound, saveStats } from './src/storage';
import { colors } from './src/theme';

export default function App() {
  const puzzle = useMemo(() => puzzleNumber(), []);
  const dailyIdx = useMemo(() => dailySongIndex(puzzle, SONG_COUNT), [puzzle]);
  const songList = useMemo(() => [...SONGS], []);

  const [round, setRound] = useState<RoundState>({
    mode: 'daily',
    puzzle,
    songIndex: dailyIdx,
    entries: [],
    status: 'playing',
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [restored, setRestored] = useState(false);
  // Free rounds played in this session; forgotten on reload.
  const playedFree = useRef(new Set<number>());

  const answer = SONGS[round.songIndex];
  const { play, stop, playingSeconds } = useSnippetPlayer(answer.previewUrl);

  // Restore today's round + stats once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateRound(puzzle, songLabel(SONGS[dailyIdx]));
      const [saved, s] = await Promise.all([loadRound(puzzle), loadStats()]);
      await pruneRounds(puzzle);
      if (cancelled) return;
      const event: RoundEvent = {
        type: 'startDaily',
        puzzle,
        songIndex: dailyIdx,
        saved: saved ? { entries: saved.entries, status: saved.status } : null,
      };
      setRound((r) => roundReducer(r, event, SONGS[r.songIndex]));
      setStats(s);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzle, dailyIdx]);

  const apply = (event: RoundEvent) => {
    const next = roundReducer(round, event, answer);
    if (next === round) return;
    setRound(next);
    const daily = next.mode === 'daily' && next.puzzle != null;
    if (daily) saveRound({ puzzle: next.puzzle as number, entries: next.entries, status: next.status });
    if (!isOver(next)) return;
    stop();
    if (daily) {
      const updated = applyResult(stats ?? emptyStats(), next.puzzle as number, next.status === 'won', next.entries.length);
      setStats(updated);
      saveStats(updated);
    }
  };

  const startFreePlay = () => {
    stop();
    const songIndex = pickFreePlayIndex(SONG_COUNT, new Set([dailyIdx, ...playedFree.current]));
    playedFree.current.add(songIndex);
    setRound((r) => roundReducer(r, { type: 'startFree', songIndex }, answer));
  };

  const over = isOver(round);
  const unlocked = unlockedIndex(round);
  const nextSeconds = unlocked + 1 < SNIPPET_SECONDS.length ? SNIPPET_SECONDS[unlocked + 1] : null;

  if (!restored) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.logo}>{t('app.title')}</Text>
              <Text style={styles.subtitle}>
                {round.mode === 'daily' && round.puzzle != null
                  ? t('app.subtitle.daily', { puzzle: round.puzzle })
                  : t('app.subtitle.free')}
              </Text>
            </View>

            {over && stats && round.mode === 'daily' && <StatsCard stats={stats} />}

            <SnippetBar
              unlockedIndex={unlocked}
              playingSeconds={playingSeconds}
              onPlay={() => play(SNIPPET_SECONDS[unlocked])}
              onStop={stop}
              disabled={over}
            />

            <Board entries={round.entries} activeIndex={over ? null : round.entries.length} />

            {over ? (
              <Reveal
                song={answer}
                status={round.status}
                entries={round.entries}
                puzzle={round.puzzle}
                onFreePlay={startFreePlay}
              />
            ) : (
              <GuessInput
                songs={songList}
                nextSeconds={nextSeconds}
                onGuess={(song) => apply({ type: 'guess', song })}
                onSkip={() => apply({ type: 'skip' })}
              />
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('footer.previews')}</Text>
              <Text style={styles.footerText}>{t('footer.copyright', { studio: t('about.studio') })}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  container: { width: '100%', maxWidth: 480, gap: 16, alignItems: 'center' },
  header: { alignItems: 'center', gap: 4, marginBottom: 4 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: colors.dim, fontSize: 13 },
  footer: { alignItems: 'center', gap: 2, marginTop: 8 },
  footerText: { color: colors.dim, fontSize: 12 },
});
