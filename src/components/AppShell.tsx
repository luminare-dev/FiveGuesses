import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { focusWasDropped } from '../a11y/focus';
import { useAnnouncer } from '../a11y/useAnnouncer';
import { createRoom } from '../api';
import { t } from '../i18n';
import { parseRoute, roomPath } from '../route';
import { SONGS } from '../songs';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { useGame } from '../useGame';
import { AboutSheet } from './AboutSheet';
import { Board } from './Board';
import { Footer } from './Footer';
import { GuessCombobox } from './GuessCombobox';
import { Header } from './Header';
import { LiveRegion } from './LiveRegion';
import { Reveal } from './Reveal';
import { RoomScreen } from './RoomScreen';
import { SnippetBar } from './SnippetBar';
import { SourceSheet } from './SourceSheet';
import { StatsSheet } from './StatsSheet';

type SheetName = 'stats' | 'about' | 'sources' | null;

// Creates a room and opens it; false when the service did not answer.
async function openNewRoom(): Promise<boolean> {
  try {
    const code = await createRoom();
    if (typeof window !== 'undefined') window.location.assign(roomPath(code));
    return true;
  } catch {
    return false;
  }
}

function currentPath(): string {
  return typeof window !== 'undefined' && window.location !== undefined ? window.location.pathname : '/';
}

// /r/<CODE> is a room; every other path is the game.
export function AppShell() {
  const route = useMemo(() => parseRoute(currentPath()), []);
  return route.kind === 'room' ? <RoomScreen code={route.code} /> : <GameScreen />;
}

// The game screen: header, live region, the main column and the footer, with the sheets on
// top. The only consumer of useGame; every announcement goes through one announcer.
function GameScreen() {
  const { theme, scheme, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { message, nonce, announce, withdraw } = useAnnouncer();
  const game = useGame({ announce });
  const { round, over, stats, restored } = game;
  const daily = round.mode === 'daily' && round.puzzle !== null;

  const [sheet, setSheet] = useState<SheetName>(null);
  const statsButton = useRef<View>(null);
  const headerAbout = useRef<View>(null);
  const footerAbout = useRef<View>(null);
  // Whichever About control was pressed last; it takes focus back when the sheet closes.
  const aboutOpener = useRef<View | null>(null);

  const openStats = useCallback(() => setSheet('stats'), []);
  const openAboutFromHeader = useCallback(() => {
    aboutOpener.current = headerAbout.current;
    setSheet('about');
  }, []);
  const openAboutFromFooter = useCallback(() => {
    aboutOpener.current = footerAbout.current;
    setSheet('about');
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const chooseButton = useRef<View>(null);
  const openSources = useCallback(() => setSheet('sources'), []);
  const playWithFriends = useCallback(() => {
    void openNewRoom().then((ok) => {
      if (!ok) announce(t('rooms.createFailed'));
    });
  }, [announce]);

  // A round that ends removes the guess box, and a round that starts removes the result card,
  // so the control that had focus is gone. Focus then moves to the result heading or to the play
  // button instead of falling back to the start of the page. Nothing moves on the first render
  // after loading, nor when focus is somewhere else (a sheet, the header).
  const playButton = useRef<View>(null);
  const revealHeading = useRef<Text>(null);
  const phase = restored ? `${over ? 'over' : 'playing'}:${round.mode}:${round.puzzle ?? ''}` : null;
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (phase === null) return;
    const previous = lastPhase.current;
    lastPhase.current = phase;
    if (previous === null || previous === phase || !focusWasDropped()) return;
    (over ? revealHeading : playButton).current?.focus();
  }, [phase, over]);

  const { resetData } = game;
  const reset = useCallback(() => {
    setPreference('system');
    void resetData();
  }, [setPreference, resetData]);

  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <Header
              mode={round.mode}
              puzzle={round.puzzle}
              source={game.sourceLabel}
              onOpenStats={openStats}
              onOpenAbout={openAboutFromHeader}
              statsButtonRef={statsButton}
              aboutButtonRef={headerAbout}
            />
            <LiveRegion message={message} nonce={nonce} />
            <View role="main" aria-busy={!restored} style={styles.main}>
              {!restored && <Text style={styles.loading}>{t('app.loading')}</Text>}
              {restored && (
                <SnippetBar
                  unlockedIndex={game.unlockedIndex}
                  view={game.snippet}
                  onPlay={game.play}
                  onStop={game.stop}
                  disabled={over}
                  announce={announce}
                  withdraw={withdraw}
                  playButtonRef={playButton}
                />
              )}
              {restored && <Board entries={round.entries} activeIndex={over ? null : round.entries.length} />}
              {restored && !over && (
                <GuessCombobox
                  songs={SONGS}
                  live={round.mode === 'free'}
                  nextSeconds={game.nextSeconds}
                  isLastGuess={game.isLastGuess}
                  onGuess={game.guess}
                  onSkip={game.skip}
                  announce={announce}
                  withdraw={withdraw}
                />
              )}
              {restored && over && (
                <Reveal
                  song={game.answer}
                  status={round.status}
                  mode={round.mode}
                  shareText={game.shareText}
                  shareOutcome={game.shareOutcome}
                  onShare={game.share}
                  onFreePlay={game.startFreePlay}
                  onBackToDaily={game.backToDaily}
                  onChooseSongs={openSources}
                  onPlayWithFriends={openNewRoom}
                  chooseButtonRef={chooseButton}
                  headingRef={revealHeading}
                />
              )}
            </View>
            <Footer
              onOpenAbout={openAboutFromFooter}
              aboutButtonRef={footerAbout}
              onPlayWithFriends={playWithFriends}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <StatsSheet
        visible={sheet === 'stats'}
        onClose={closeSheet}
        openerRef={statsButton}
        stats={stats}
        todayPuzzle={game.puzzle}
        showCountdown={over && daily}
      />
      <AboutSheet
        visible={sheet === 'about'}
        onClose={closeSheet}
        openerRef={aboutOpener}
        preference={preference}
        onPreferenceChange={setPreference}
        onReset={reset}
      />
      <SourceSheet
        visible={sheet === 'sources'}
        onClose={closeSheet}
        openerRef={chooseButton}
        mode="free"
        onChoose={game.chooseSource}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    fill: { flex: 1 },
    scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
    column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
    main: { alignSelf: 'stretch', gap: 16 },
    loading: { ...text(16), color: theme.textSecondary, textAlign: 'center', paddingVertical: 24 },
  });
}
