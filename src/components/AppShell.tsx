import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAnnouncer } from '../a11y/useAnnouncer';
import { t } from '../i18n';
import { SONGS } from '../songs';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { useGame } from '../useGame';
import { AboutSheet } from './AboutSheet';
import { Board } from './Board';
import { Button } from './Button';
import { Countdown } from './Countdown';
import { Footer } from './Footer';
import { GuessCombobox } from './GuessCombobox';
import { Header } from './Header';
import { LiveRegion } from './LiveRegion';
import { Reveal } from './Reveal';
import { SnippetBar } from './SnippetBar';
import { StatsSheet } from './StatsSheet';

type SheetName = 'stats' | 'about' | null;

// True when the focused element was removed and the browser fell back to the page body.
function focusWasDropped(): boolean {
  if (typeof document === 'undefined') return false;
  return document.activeElement === null || document.activeElement === document.body;
}

// The one screen: header, live region, the main column and the footer, with the two sheets
// on top. The only consumer of useGame; every announcement goes through one announcer.
export function AppShell() {
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
                  entries={round.entries}
                  puzzle={round.puzzle}
                  onFreePlay={game.startFreePlay}
                />
              )}
              {restored && over && daily && <Countdown time={game.countdownText} />}
              {restored && over && !daily && (
                <Button variant="secondary" label={t('reveal.backToDaily')} onPress={game.backToDaily} style={styles.stretch} />
              )}
            </View>
            <Footer onOpenAbout={openAboutFromFooter} aboutButtonRef={footerAbout} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <StatsSheet
        visible={sheet === 'stats'}
        onClose={closeSheet}
        openerRef={statsButton}
        stats={stats}
        todayPuzzle={game.puzzle}
        countdownText={over && daily ? game.countdownText : null}
      />
      <AboutSheet
        visible={sheet === 'about'}
        onClose={closeSheet}
        openerRef={aboutOpener}
        preference={preference}
        onPreferenceChange={setPreference}
        onReset={reset}
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
    stretch: { alignSelf: 'stretch' },
  });
}
