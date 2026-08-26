import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import songsData from './assets/songs.json';
import { Board } from './src/components/Board';
import { GuessInput } from './src/components/GuessInput';
import { Reveal } from './src/components/Reveal';
import { SnippetBar } from './src/components/SnippetBar';
import { StatsCard } from './src/components/StatsCard';
import {
  dailySongIndex,
  GuessEntry,
  isCorrect,
  MAX_GUESSES,
  puzzleNumber,
  randomSongIndex,
  RoundStatus,
  Song,
  songLabel,
} from './src/game';
import { useSnippetPlayer } from './src/player';
import { loadRound, loadStats, recordResult, saveRound, Stats } from './src/storage';
import { colors } from './src/theme';

const SONGS: Song[] = (songsData as { songs: Song[] }).songs;

export default function App() {
  const puzzle = useMemo(() => puzzleNumber(), []);
  const dailyIdx = useMemo(() => dailySongIndex(puzzle, SONGS.length), [puzzle]);

  const [mode, setMode] = useState<'daily' | 'free'>('daily');
  const [freeIdx, setFreeIdx] = useState<number>(() => randomSongIndex(SONGS.length, dailyIdx));
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [status, setStatus] = useState<RoundStatus>('playing');
  const [stats, setStats] = useState<Stats | null>(null);
  const [restored, setRestored] = useState(false);

  const answer = SONGS[mode === 'daily' ? dailyIdx : freeIdx];
  const { play, stop, playingSeconds } = useSnippetPlayer(answer?.previewUrl ?? null);

  // Restore today's round + stats once.
  useEffect(() => {
    (async () => {
      const [saved, s] = await Promise.all([loadRound(puzzle), loadStats()]);
      if (saved) {
        setGuesses(saved.guesses);
        setStatus(saved.status);
      }
      setStats(s);
      setRestored(true);
    })();
  }, [puzzle]);

  const persistDaily = (g: GuessEntry[], st: RoundStatus) => {
    if (mode === 'daily') saveRound({ puzzle, guesses: g, status: st });
  };

  const finish = async (won: boolean, g: GuessEntry[]) => {
    stop();
    if (mode === 'daily') {
      const used = won ? g.length + 1 : g.length;
      const s = await recordResult(puzzle, won, used);
      setStats(s);
    }
  };

  const onGuess = (song: Song) => {
    if (status !== 'playing') return;
    if (isCorrect(song, answer)) {
      setStatus('won');
      persistDaily(guesses, 'won');
      finish(true, guesses);
      return;
    }
    const g: GuessEntry[] = [...guesses, { kind: 'wrong', text: songLabel(song) }];
    setGuesses(g);
    const st: RoundStatus = g.length >= MAX_GUESSES ? 'lost' : 'playing';
    setStatus(st);
    persistDaily(g, st);
    if (st === 'lost') finish(false, g);
  };

  const onSkip = () => {
    if (status !== 'playing') return;
    const g: GuessEntry[] = [...guesses, { kind: 'skip' }];
    setGuesses(g);
    const st: RoundStatus = g.length >= MAX_GUESSES ? 'lost' : 'playing';
    setStatus(st);
    persistDaily(g, st);
    if (st === 'lost') finish(false, g);
  };

  const startFreePlay = () => {
    stop();
    setMode('free');
    setFreeIdx(randomSongIndex(SONGS.length, mode === 'daily' ? dailyIdx : freeIdx));
    setGuesses([]);
    setStatus('playing');
  };

  const over = status !== 'playing';
  const unlockedIndex = Math.min(guesses.length, MAX_GUESSES - 1);

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
              <Text style={styles.logo}>
                ✋ Five<Text style={{ color: colors.accent }}>Guesses</Text>
              </Text>
              <Text style={styles.subtitle}>
                {mode === 'daily' ? `Daily #${puzzle} · Name the song` : 'Free play · Name the song'}
              </Text>
            </View>

            {over && stats && mode === 'daily' && <StatsCard stats={stats} />}

            <SnippetBar
              unlockedIndex={unlockedIndex}
              playingSeconds={playingSeconds}
              onPlay={() => play([1, 2, 4, 8, 16][unlockedIndex])}
              onStop={stop}
              disabled={over}
            />

            <Board guesses={guesses} winningLabel={status === 'won' ? songLabel(answer) : null} />

            {over ? (
              <Reveal
                song={answer}
                won={status === 'won'}
                guesses={guesses}
                puzzle={mode === 'daily' ? puzzle : null}
                onFreePlay={startFreePlay}
              />
            ) : (
              <GuessInput songs={SONGS} onGuess={onGuess} onSkip={onSkip} />
            )}

            <Text style={styles.footer}>Previews courtesy of Apple Music · fiveguesses.app</Text>
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
  footer: { color: colors.dim, fontSize: 11, marginTop: 8 },
});
