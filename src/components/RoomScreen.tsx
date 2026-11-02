import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { focusWasDropped } from '../a11y/focus';
import { useAnnouncer } from '../a11y/useAnnouncer';
import { useSnippetPlayer } from '../audio/useSnippetPlayer';
import { MAX_GUESSES, SNIPPET_SECONDS, songLabel } from '../game';
import type { Song } from '../game';
import { t } from '../i18n';
import type { ClosedReason } from '../rooms/reconnect';
import { DEFAULT_ROUNDS, DEFAULT_SOURCE } from '../rooms/types';
import type { GameView, RoomSource, RoomView } from '../rooms/types';
import { useRoom } from '../rooms/useRoom';
import { SONGS } from '../songs';
import { resetAllData } from '../storage';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import type { SourceChoice } from '../useGame';
import { AboutSheet } from './AboutSheet';
import { AnswerCard } from './AnswerCard';
import { Board } from './Board';
import { Button } from './Button';
import { Footer } from './Footer';
import { GuessCombobox } from './GuessCombobox';
import { Wordmark } from './Header';
import { LiveRegion } from './LiveRegion';
import { RoomSettings, RoomShare } from './RoomLobby';
import { RoomPlayers } from './RoomPlayers';
import { RoundResults, Standings } from './RoomResults';
import { SnippetBar } from './SnippetBar';
import { SourceSheet } from './SourceSheet';

type Props = { code: string };
type SheetName = 'about' | 'sources' | null;

function closedMessage(reason: ClosedReason): string {
  switch (reason) {
    case 'not_found':
      return t('rooms.closed.notFound');
    case 'kicked':
      return t('rooms.closed.kicked');
    case 'replaced':
      return t('rooms.closed.replaced');
    case 'left':
      return t('rooms.closed.left');
    case 'closed':
      return t('rooms.closed.ended');
  }
}

function errorMessage(code: string): string | null {
  switch (code) {
    case 'source_failed':
      return t('rooms.error.sourceFailed');
    case 'source_empty':
      return t('rooms.error.sourceEmpty');
    case 'slow_down':
      return t('rooms.error.slowDown');
    case 'not_host':
      return t('rooms.error.notHost');
    case 'bad_request':
      return t('rooms.error.badRequest');
    default:
      return null;
  }
}

function subtitle(code: string, view: RoomView | null): string {
  const game = view?.game;
  switch (view?.phase) {
    case 'lobby':
      return t('rooms.subtitle.lobby', { code });
    case 'playing':
    case 'reveal':
      return game
        ? t('rooms.subtitle.round', { code, round: game.round, rounds: game.rounds })
        : t('rooms.subtitle.room', { code });
    case 'finished':
      return t('rooms.subtitle.finished', { code });
    default:
      return t('rooms.subtitle.room', { code });
  }
}

function toStart(source: RoomSource) {
  return source.kind === 'category'
    ? { kind: 'category' as const, id: source.id }
    : { kind: 'ids' as const, label: source.label, ids: source.ids };
}

// A duel room at /r/<CODE>: the name form, the lobby, the rounds, the results and the closed
// states, with its own header, the live region, the footer and the About and song sheets.
export function RoomScreen({ code }: Props) {
  const { theme, scheme, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { message, nonce, announce, withdraw } = useAnnouncer();
  const room = useRoom(code);
  const { view, connection, send } = room;
  const game: GameView | null = view?.game ?? null;
  const me = game?.me ?? null;
  const you = view?.you ?? null;
  const isHost = view !== null && you !== null && view.hostId === you;
  const phase = view?.phase ?? null;

  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [source, setSource] = useState<RoomSource>(DEFAULT_SOURCE);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [name, setName] = useState('');
  const footerAbout = useRef<View>(null);
  const songsButton = useRef<View>(null);
  const heading = useRef<Text>(null);

  const snippet = useSnippetPlayer(game?.previewUrl ?? null);
  const { stop } = snippet;
  const stage = me?.stage ?? 0;
  const myStatus = me?.status ?? null;
  const roundNo = game?.round ?? 0;

  // A new round or the end of my turn stops a snippet that is still playing.
  useEffect(() => {
    stop();
  }, [roundNo, myStatus, phase, stop]);

  // Focus follows the screen when the control that had it is gone.
  const screenKey = `${connection}:${phase ?? ''}:${roundNo}:${myStatus ?? ''}`;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastKey.current;
    lastKey.current = screenKey;
    if (previous === null || previous === screenKey || !focusWasDropped()) return;
    heading.current?.focus();
  }, [screenKey]);

  // The room's events for the live region.
  const seen = useRef<{ round: number; phase: string | null; host: boolean; entries: number } | null>(null);
  useEffect(() => {
    if (view === null || you === null) return;
    const before = seen.current;
    const entries = me?.entries.length ?? 0;
    seen.current = { round: roundNo, phase, host: isHost, entries };
    if (before === null) return;
    if (phase === 'playing' && (before.phase !== 'playing' || before.round !== roundNo) && game !== null) {
      announce(t('rooms.live.roundStarted', { round: game.round, rounds: game.rounds }));
    } else if (phase === 'reveal' && before.phase === 'playing' && game?.answer) {
      announce(t('rooms.live.roundOver', { song: songLabel(game.answer) }));
    } else if (phase === 'finished' && before.phase !== 'finished') {
      announce(t('rooms.live.gameOver'));
    } else if (phase === 'playing' && before.round === roundNo && entries > before.entries && me !== null) {
      const last = me.entries[me.entries.length - 1];
      const seconds = SNIPPET_SECONDS[Math.min(me.stage, MAX_GUESSES - 1)];
      if (me.status === 'won') announce(t('rooms.live.solved'));
      else if (me.status === 'lost' && game?.answer) announce(t('live.lost', { song: songLabel(game.answer) }));
      else if (last?.kind === 'partial') announce(t('live.partial', { seconds }));
      else if (last?.kind === 'skip') announce(t('live.skipped', { seconds }));
      else announce(t('live.wrong', { seconds }));
    }
    if (isHost && !before.host) announce(t('rooms.live.youAreHost'));
  }, [view, you, me, game, phase, roundNo, isHost, announce]);

  // Errors the room sent; the name errors show in the form instead.
  const lastError = room.error;
  const errorText = lastError !== null ? errorMessage(lastError.code) : null;
  useEffect(() => {
    if (errorText !== null) announce(errorText);
  }, [lastError, errorText, announce]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const openAbout = useCallback(() => setSheet('about'), []);
  const openSources = useCallback(() => setSheet('sources'), []);
  const chooseSource = useCallback(
    (choice: SourceChoice) => {
      if (choice.kind === 'category') setSource({ kind: 'category', id: choice.id, label: choice.label });
      else if (choice.kind === 'tracks') {
        setSource({
          kind: 'ids',
          label: choice.label.slice(0, 60),
          ids: choice.tracks.slice(0, 30).map((track) => ({ id: track.id, country: track.country })),
        });
      }
      announce(t('rooms.live.songsChosen', { source: choice.kind === 'builtin' ? '' : choice.label }));
    },
    [announce]
  );
  const reset = useCallback(() => {
    setPreference('system');
    void resetAllData().then(() => announce(t('about.resetDone')));
  }, [setPreference, announce]);

  const start = () => send({ t: 'start', rounds, source: toStart(source) });
  const guess = (song: Song) => send({ t: 'guess', round: roundNo, id: song.id, artist: song.artist, title: song.title });
  const skip = () => send({ t: 'skip', round: roundNo });
  const play = () => snippet.play(SNIPPET_SECONDS[Math.min(stage, MAX_GUESSES - 1)]);
  const join = () => {
    const value = name.trim();
    if (value !== '') room.join(value);
  };
  const backHome = (
    <Text role="link" href="/" style={styles.homeLink}>
      {t('rooms.backToDaily')}
    </Text>
  );

  const sittingOut = view?.players.find((p) => p.id === you)?.sittingOut ?? false;
  const entries = me?.entries ?? [];
  const nameError =
    connection === 'need_name' && lastError !== null
      ? lastError.code === 'name_taken'
        ? t('rooms.nameTaken')
        : lastError.code === 'name_invalid'
          ? t('rooms.nameInvalid')
          : null
      : null;

  const sectionHeading = (label: string) => (
    <Text ref={heading} role="heading" aria-level={2} tabIndex={-1} style={styles.heading}>
      {label}
    </Text>
  );

  let body: React.ReactNode;
  if (connection === 'closed' && room.closed !== null) {
    body = (
      <View style={styles.card}>
        {sectionHeading(closedMessage(room.closed))}
        {backHome}
      </View>
    );
  } else if (connection === 'unreachable') {
    body = (
      <View style={styles.card}>
        {sectionHeading(t('rooms.unreachable'))}
        <Button label={t('rooms.retry')} onPress={room.retry} />
        {backHome}
      </View>
    );
  } else if (connection === 'need_name') {
    body = (
      <View style={styles.card}>
        {sectionHeading(t('rooms.joinTitle'))}
        <TextInput
          aria-label={t('rooms.nameLabel')}
          placeholder={t('rooms.nameLabel')}
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={join}
          maxLength={40}
          autoComplete="off"
          autoCorrect={false}
          enterKeyHint="go"
          style={styles.input}
        />
        {nameError !== null && <Text style={styles.error}>{nameError}</Text>}
        <Button label={t('rooms.join')} onPress={join} disabled={name.trim() === ''} />
      </View>
    );
  } else if (view === null || you === null) {
    body = (
      <View style={styles.card}>
        {sectionHeading(t('rooms.connecting'))}
      </View>
    );
  } else {
    const players = (
      <View style={styles.section}>
        <Text role="heading" aria-level={2} style={styles.subheading}>
          {t('rooms.players')}
        </Text>
        <RoomPlayers
          players={view.players}
          you={you}
          isHost={isHost}
          playing={phase === 'playing'}
          onSkipPlayer={(player) => send({ t: 'skipPlayer', player })}
          onKick={(player) => send({ t: 'kick', player })}
        />
      </View>
    );
    const settings = isHost ? (
      <RoomSettings
        rounds={rounds}
        onRounds={setRounds}
        sourceLabel={source.label}
        onChooseSongs={openSources}
        songsButtonRef={songsButton}
        startLabel={phase === 'finished' ? t('rooms.playAgain') : t('rooms.start')}
        onStart={start}
      />
    ) : (
      <Text style={styles.note}>
        {t('rooms.waitingForHost', { name: view.players.find((p) => p.host)?.name ?? '' })}
      </Text>
    );
    const sitOut = (
      <Button
        variant="secondary"
        label={sittingOut ? t('rooms.sitIn') : t('rooms.sitOut')}
        onPress={() => send({ t: 'sitOut', on: !sittingOut })}
      />
    );

    if (phase === 'lobby') {
      body = (
        <>
          <View style={styles.card}>
            {sectionHeading(t('rooms.lobbyTitle'))}
            <RoomShare code={code} announce={announce} />
            {settings}
          </View>
          {players}
        </>
      );
    } else if (phase === 'starting') {
      body = (
        <>
          <View style={styles.card}>{sectionHeading(t('rooms.loadingSongs'))}</View>
          {players}
        </>
      );
    } else if (phase === 'playing' && game !== null) {
      const playingNow = myStatus === 'playing';
      body = (
        <>
          {sectionHeading(t('rooms.roundTitle', { round: game.round, rounds: game.rounds }))}
          <Text style={styles.note}>{game.label}</Text>
          {playingNow && (
            <>
              <SnippetBar
                unlockedIndex={stage}
                view={snippet.view}
                onPlay={play}
                onStop={stop}
                announce={announce}
                withdraw={withdraw}
              />
              <Board entries={entries} activeIndex={entries.length} />
              <GuessCombobox
                key={game.round}
                songs={SONGS}
                live
                nextSeconds={stage + 1 < SNIPPET_SECONDS.length ? SNIPPET_SECONDS[stage + 1] : null}
                isLastGuess={entries.length === MAX_GUESSES - 1}
                onGuess={guess}
                onSkip={skip}
                announce={announce}
                withdraw={withdraw}
              />
            </>
          )}
          {!playingNow && (
            <View style={styles.card}>
              <Text style={[styles.outcome, myStatus === 'won' && styles.outcomeWon]}>
                {myStatus === 'won'
                  ? t('reveal.won')
                  : myStatus === 'out'
                    ? t('rooms.youSitOut')
                    : myStatus === 'waiting' || myStatus === null
                      ? t('rooms.youWait')
                      : myStatus === 'skipped'
                        ? t('rooms.youSkipped')
                        : t('reveal.lost')}
              </Text>
              {entries.length > 0 && <Board entries={entries} activeIndex={null} />}
              {game.answer !== null && <AnswerCard song={game.answer} />}
              <Text style={styles.note}>{t('rooms.waitingForOthers')}</Text>
              <Text style={styles.attribution}>{t('reveal.previewsCredit')}</Text>
            </View>
          )}
          <View style={styles.row}>
            {sitOut}
            {isHost && (
              <>
                <Button variant="secondary" label={t('rooms.endRound')} onPress={() => send({ t: 'endRound' })} />
                <Button variant="secondary" label={t('rooms.endGame')} onPress={() => send({ t: 'endGame' })} />
              </>
            )}
          </View>
          {players}
        </>
      );
    } else if (phase === 'reveal' && game !== null) {
      body = (
        <>
          <View style={styles.card}>
            {sectionHeading(t('rooms.roundOver', { round: game.round, rounds: game.rounds }))}
            {game.answer !== null && <AnswerCard song={game.answer} />}
            <Text style={styles.attribution}>{t('reveal.previewsCredit')}</Text>
          </View>
          {game.results !== null && <RoundResults results={game.results} players={view.players} />}
          <Text style={styles.note}>{t('rooms.nextSoon')}</Text>
          <View style={styles.row}>
            {sitOut}
            {isHost && (
              <>
                <Button label={t('rooms.nextRound')} onPress={() => send({ t: 'next' })} />
                <Button variant="secondary" label={t('rooms.endGame')} onPress={() => send({ t: 'endGame' })} />
              </>
            )}
          </View>
          {players}
        </>
      );
    } else {
      body = (
        <>
          <View style={styles.card}>
            {sectionHeading(t('rooms.finishedTitle'))}
            {view.standings !== null && <Standings standings={view.standings} />}
            {game?.answer && (
              <Text style={styles.note}>{t('rooms.lastSong', { song: songLabel(game.answer) })}</Text>
            )}
          </View>
          {settings}
          {backHome}
          {players}
        </>
      );
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <View role="banner" style={styles.header}>
              <View style={styles.headerRow}>
                <Wordmark />
                {connection !== 'closed' && you !== null && (
                  <Button variant="secondary" label={t('rooms.leave')} onPress={room.leave} style={styles.push} />
                )}
              </View>
              <Text style={styles.subtitle}>{subtitle(code, view)}</Text>
            </View>
            <LiveRegion message={message} nonce={nonce} />
            {connection === 'connecting' && view !== null && <Text style={styles.note}>{t('rooms.reconnecting')}</Text>}
            {errorText !== null && connection === 'joined' && <Text style={styles.error}>{errorText}</Text>}
            <View role="main" style={styles.main}>
              {body}
            </View>
            <Footer onOpenAbout={openAbout} aboutButtonRef={footerAbout} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <AboutSheet
        visible={sheet === 'about'}
        onClose={closeSheet}
        openerRef={footerAbout}
        preference={preference}
        onPreferenceChange={setPreference}
        onReset={reset}
      />
      <SourceSheet
        visible={sheet === 'sources'}
        onClose={closeSheet}
        openerRef={songsButton}
        mode="room"
        onChoose={chooseSource}
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
    header: { alignSelf: 'stretch', gap: 6 },
    headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    push: { marginLeft: 'auto' },
    subtitle: { ...text(13, '600'), ...tabularNums, color: theme.textSecondary },
    main: { alignSelf: 'stretch', gap: 16 },
    section: { alignSelf: 'stretch', gap: 8 },
    card: {
      alignSelf: 'stretch',
      alignItems: 'stretch',
      backgroundColor: theme.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
      gap: 12,
    },
    heading: { ...text(20, '700'), color: theme.text },
    subheading: { ...text(17, '700'), color: theme.text },
    outcome: { ...text(20, '700'), color: theme.textSecondary, textAlign: 'center' },
    outcomeWon: { color: theme.correct },
    note: { ...text(14, '500'), color: theme.textSecondary },
    error: { ...text(14, '600'), color: theme.partial },
    attribution: { ...text(12, '500'), color: theme.textMuted, textAlign: 'center' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch' },
    homeLink: {
      ...text(16, '600'),
      color: theme.link,
      textDecorationLine: 'underline',
      minHeight: 44,
      lineHeight: 44,
      alignSelf: 'flex-start',
    },
    input: {
      ...text(16),
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
  });
}
