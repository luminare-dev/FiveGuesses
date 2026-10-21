import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Board } from './src/components/Board';
import { Button } from './src/components/Button';
import { Countdown } from './src/components/Countdown';
import { GuessCombobox } from './src/components/GuessCombobox';
import { Reveal } from './src/components/Reveal';
import { SnippetBar } from './src/components/SnippetBar';
import { StatsCard } from './src/components/StatsCard';
import { PROJECT_PAGE_URL } from './src/config';
import { t, tNodes } from './src/i18n';
import { SONGS } from './src/songs';
import type { Theme } from './src/theme';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { display, tabularNums, text } from './src/theme/typography';
import { useTheme } from './src/theme/useTheme';
import { useGame } from './src/useGame';

export default function App() {
  return (
    <ThemeProvider>
      <Game />
    </ThemeProvider>
  );
}

function Game() {
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [live, setLive] = useState('');
  const announce = useCallback((message: string) => setLive(message), []);
  const game = useGame({ announce });
  const { round, over, stats } = game;
  const daily = round.mode === 'daily' && round.puzzle !== null;

  if (!game.restored) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.logo}>{t('app.title')}</Text>
              <Text style={styles.subtitle}>
                {daily ? t('app.subtitle.daily', { puzzle: round.puzzle as number }) : t('app.subtitle.free')}
              </Text>
            </View>

            <Text role="status" aria-live="polite" aria-atomic style={styles.live}>
              {live}
            </Text>

            {over && stats && daily && <StatsCard stats={stats} />}

            <SnippetBar
              unlockedIndex={game.unlockedIndex}
              view={game.snippet}
              onPlay={game.play}
              onStop={game.stop}
              disabled={over}
              announce={announce}
            />

            <Board entries={round.entries} activeIndex={over ? null : round.entries.length} />

            {over ? (
              <Reveal
                song={game.answer}
                status={round.status}
                entries={round.entries}
                puzzle={round.puzzle}
                onFreePlay={game.startFreePlay}
              />
            ) : (
              <GuessCombobox
                songs={SONGS}
                nextSeconds={game.nextSeconds}
                isLastGuess={game.isLastGuess}
                onGuess={game.guess}
                onSkip={game.skip}
                announce={announce}
              />
            )}

            {over && daily && <Countdown time={game.countdownText} />}
            {over && !daily && (
              <Button variant="secondary" label={t('reveal.backToDaily')} onPress={game.backToDaily} style={styles.back} />
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('footer.previews')}</Text>
              <Text style={styles.footerText}>
                {tNodes('footer.copyright', {
                  studio: (
                    <Text
                      style={styles.footerLink}
                      role="link"
                      href={PROJECT_PAGE_URL}
                      hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
                      aria-label={t('footer.projectPage')}
                    >
                      {t('about.studio')}
                    </Text>
                  ),
                })}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    fill: { flex: 1 },
    scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
    container: { width: '100%', maxWidth: 480, gap: 16, alignItems: 'center' },
    header: { alignItems: 'center', gap: 4, marginBottom: 4 },
    logo: { ...display(26, '700'), color: theme.text },
    subtitle: { ...text(13, '600'), ...tabularNums, color: theme.textSecondary },
    live: { ...text(13, '500'), color: theme.textSecondary, minHeight: 20, textAlign: 'center' },
    back: { alignSelf: 'stretch' },
    footer: { alignItems: 'center', gap: 2, marginTop: 8 },
    footerText: { ...text(12, '500'), color: theme.textMuted, textAlign: 'center' },
    footerLink: { color: theme.link },
  });
}
