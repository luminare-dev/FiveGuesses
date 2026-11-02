import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Track } from './api';
import type { SnippetView } from './audio/snippetLogic';
import { useSnippetPlayer } from './audio/useSnippetPlayer';
import { loadSongs } from './catalog/sources';
import { SITE_HOST } from './config';
import { pickFreePlayIndex } from './freePlay';
import { dailySongIndex, MAX_GUESSES, SNIPPET_SECONDS, songLabel } from './game';
import type { GuessEntry, RoundStatus, Song } from './game';
import { t } from './i18n';
import { isOver, roundAnswer, roundReducer, unlockedIndex } from './round';
import type { RoundEvent, RoundState } from './round';
import { shareOutcomeMessage, shareResult, shareText as buildShareText } from './share';
import type { ShareOutcome } from './share';
import { SONGS, SONG_COUNT } from './songs';
import { applyResult, emptyStats } from './stats';
import type { Stats } from './stats';
import {
  loadRound,
  loadStats,
  migrateRound,
  pruneRounds,
  resetAllData,
  saveRound,
  saveStats,
  STORAGE_PREFIX,
} from './storage';
import { useDailyPuzzle } from './useDailyPuzzle';

// Where free rounds take their songs from. A pool lives in memory only.
export type FreeSource =
  | { kind: 'builtin' }
  | { kind: 'pool'; id: string | null; label: string; tracks: Track[]; next: number; played: number[] };

// What the song sheet hands over: the built-in songs, a category or chart, or resolved tracks.
export type SourceChoice =
  | { kind: 'builtin' }
  | { kind: 'category'; id: string; label: string }
  | { kind: 'tracks'; label: string; tracks: Track[] };

type Pool = Extract<FreeSource, { kind: 'pool' }>;

// Songs fetched per pool; a used-up pool fetches again without the last 100 played.
const POOL_SIZE = 20;
const EXCLUDE_MAX = 100;

export type GameOptions = {
  // Receives every message for the polite live region.
  announce?: (message: string) => void;
};

export type Game = {
  round: RoundState;
  // Today's puzzle number, also while a free round is on.
  puzzle: number;
  dailyIndex: number;
  answer: Song;
  stats: Stats | null;
  // False until today's round and the stats have been read from storage.
  restored: boolean;
  over: boolean;
  unlockedIndex: number;
  // Snippet length of the open tier in seconds.
  seconds: number;
  // Seconds a skip unlocks; null on the last tier.
  nextSeconds: number | null;
  isLastGuess: boolean;
  snippet: SnippetView;
  play: () => void;
  stop: () => void;
  guess: (song: Song) => void;
  skip: () => void;
  startFreePlay: () => void;
  // Starts a free round from the chosen songs; on any failure a built-in round instead.
  chooseSource: (choice: SourceChoice) => void;
  // The label of the free songs in use; null for the built-in songs.
  sourceLabel: string | null;
  backToDaily: () => void;
  // The share ladder of a finished daily round; null while playing and in free play.
  shareText: string | null;
  // How the last share attempt of this round ended; null before the first attempt.
  shareOutcome: ShareOutcome | null;
  // Hands the ladder to the share sheet or the clipboard and announces the outcome.
  share: () => void;
  // Removes everything stored, starts today's round afresh and forgets the free rounds played.
  resetData: () => Promise<void>;
};

// The live region's text after a miss: the outcome and the seconds the next snippet plays.
function missMessage(state: RoundState): string | null {
  const last = state.entries[state.entries.length - 1];
  if (last === undefined) return null;
  const seconds = SNIPPET_SECONDS[unlockedIndex(state)];
  switch (last.kind) {
    case 'wrong':
      return t('live.wrong', { seconds });
    case 'partial':
      return t('live.partial', { seconds });
    case 'skip':
      return t('live.skipped', { seconds });
    case 'correct':
      return null;
  }
}

// The live region's text for a round as it now stands: the result once it is over, else the
// outcome of the last move.
function roundMessage(state: RoundState): string | null {
  if (!isOver(state)) return missMessage(state);
  const song = songLabel(roundAnswer(state));
  return state.status === 'won' ? t('live.won', { song }) : t('live.lost', { song });
}

function reduce(state: RoundState, event: RoundEvent): RoundState {
  return roundReducer(state, event, roundAnswer(state));
}

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dailyStart(puzzle: number): RoundState {
  return { mode: 'daily', puzzle, songIndex: dailySongIndex(puzzle, SONG_COUNT), entries: [], status: 'playing' };
}

// True when the stored round is further on than the round on screen, which only another tab can
// cause: it finished the round or made more moves. A stored round that is behind (a save that
// failed) never replaces the board.
function storedIsAhead(stored: { entries: GuessEntry[]; status: RoundStatus }, shown: RoundState): boolean {
  if (isOver(shown)) return false;
  return stored.status !== 'playing' || stored.entries.length > shown.entries.length;
}

// The one place where the round, the stored state, the snippet player and the clock meet.
// Everything it combines is pure or a hook of its own; the screen only renders what comes back.
export function useGame(options: GameOptions = {}): Game {
  const announceRef = useRef(options.announce);
  announceRef.current = options.announce;
  const announce = useCallback((message: string) => {
    announceRef.current?.(message);
  }, []);

  const { puzzle } = useDailyPuzzle();
  const dailyIndex = useMemo(() => dailySongIndex(puzzle, SONG_COUNT), [puzzle]);
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;

  const [round, dispatch] = useReducer(reduce, puzzle, dailyStart);
  const roundRef = useRef(round);
  roundRef.current = round;
  const [stats, setStats] = useState<Stats | null>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const [restored, setRestored] = useState(false);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null);
  // Free rounds served in this session; forgotten on reload.
  const playedFree = useRef(new Set<number>());
  const [source, setSource] = useState<FreeSource>({ kind: 'builtin' });
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const answer = roundAnswer(round);
  const snippet = useSnippetPlayer(answer.previewUrl);
  const { stop } = snippet;

  // Mount and every rollover: read the saved round and the stats for this puzzle. A daily
  // board is replaced by the new day's; a free round keeps going underneath the new puzzle,
  // unless its song is the new daily song: free play never serves that, so a new free round
  // takes its place.
  const restoredOnce = useRef(false);
  // Grows with every restore, so a sync that started before it drops its stale reads.
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    generation.current += 1;
    stop();
    setShareOutcome(null);
    (async () => {
      await migrateRound(puzzle, songLabel(SONGS[dailyIndex]));
      const saved = await loadRound(puzzle);
      const loaded = await loadStats();
      await pruneRounds(puzzle);
      if (cancelled) return;
      if (roundRef.current.mode === 'daily') {
        dispatch({
          type: 'startDaily',
          puzzle,
          songIndex: dailyIndex,
          saved: saved ? { entries: saved.entries, status: saved.status } : null,
        });
      } else if (roundRef.current.track === undefined && roundRef.current.songIndex === dailyIndex) {
        const songIndex = pickFreePlayIndex(SONG_COUNT, new Set<number>([dailyIndex, ...playedFree.current]));
        playedFree.current.add(songIndex);
        dispatch({ type: 'startFree', songIndex });
      }
      setStats(loaded);
      setRestored(true);
      if (restoredOnce.current) {
        announce(t('countdown.ready'));
      }
      restoredOnce.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzle, dailyIndex, stop, announce]);

  // Another tab, or this one before the browser froze it, may have moved today's round on or
  // recorded a result. The stored round replaces the board when it is ahead; the stored stats
  // replace the shown ones when they are at least as recent. An empty read changes nothing,
  // because blocked storage reads as empty too.
  const resync = useCallback(async () => {
    if (!restoredOnce.current) return;
    const started = generation.current;
    const target = puzzleRef.current;
    const saved = await loadRound(target);
    const loaded = await loadStats();
    if (generation.current !== started || puzzleRef.current !== target) return;
    const shown = statsRef.current;
    if (
      loaded.lastPuzzlePlayed !== null &&
      (shown === null || shown.lastPuzzlePlayed === null || loaded.lastPuzzlePlayed >= shown.lastPuzzlePlayed) &&
      JSON.stringify(loaded) !== JSON.stringify(shown)
    ) {
      statsRef.current = loaded;
      setStats(loaded);
    }
    const current = roundRef.current;
    if (current.mode !== 'daily' || current.puzzle !== target || saved === null || !storedIsAhead(saved, current)) {
      return;
    }
    const event: RoundEvent = {
      type: 'startDaily',
      puzzle: target,
      songIndex: current.songIndex,
      saved: { entries: saved.entries, status: saved.status },
    };
    const next = roundReducer(current, event, roundAnswer(current));
    stop();
    setShareOutcome(null);
    dispatch(event);
    roundRef.current = next;
    const message = roundMessage(next);
    if (message !== null) announce(message);
  }, [stop, announce]);

  // On the web: another tab wrote one of this app's keys, or this tab is looked at again.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const sync = () => {
      void resync();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) sync();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resync]);

  // A guess or a skip on the round on screen: the reducer decides, storage and the stats follow.
  const commit = useCallback(
    (current: RoundState, event: RoundEvent) => {
      const next = roundReducer(current, event, roundAnswer(current));
      if (next === current) return;
      dispatch(event);
      roundRef.current = next;
      const daily = next.mode === 'daily' && next.puzzle !== null;
      if (daily) {
        void saveRound({ puzzle: next.puzzle as number, entries: next.entries, status: next.status });
      }
      const over = isOver(next);
      if (over) stop();
      const message = roundMessage(next);
      if (message !== null) announce(message);
      if (!over || !daily) return;
      // The stats are read again first: when another tab already recorded this puzzle,
      // applyResult changes nothing.
      void loadStats().then((latest) => {
        const updated = applyResult(latest, next.puzzle as number, next.status === 'won', next.entries.length);
        if (updated !== latest) void saveStats(updated);
        statsRef.current = updated;
        setStats(updated);
      });
    },
    [stop, announce]
  );

  // A daily move first looks at the stored round: when another tab finished it or moved further,
  // that board is shown instead and this move is dropped, so a round is never played twice.
  const apply = useCallback(
    (event: RoundEvent) => {
      const current = roundRef.current;
      if (isOver(current)) return;
      if (current.mode !== 'daily' || current.puzzle === null) {
        commit(current, event);
        return;
      }
      void loadRound(current.puzzle).then((stored) => {
        if (roundRef.current !== current) return;
        if (stored !== null && storedIsAhead(stored, current)) {
          void resync();
          return;
        }
        commit(current, event);
      });
    },
    [commit, resync]
  );

  const guess = useCallback((song: Song) => apply({ type: 'guess', song }), [apply]);
  const skip = useCallback(() => apply({ type: 'skip' }), [apply]);

  const startBuiltin = useCallback(() => {
    stop();
    const excluded = new Set<number>([dailySongIndex(puzzleRef.current, SONG_COUNT), ...playedFree.current]);
    const songIndex = pickFreePlayIndex(SONG_COUNT, excluded);
    playedFree.current.add(songIndex);
    setShareOutcome(null);
    dispatch({ type: 'startFree', songIndex });
    announce(t('live.freeStarted'));
  }, [stop, announce]);

  // The pool's next track, refilled when it is used up: a category or chart fetches more songs
  // it has not played yet (or reshuffles when that fails), an imported list starts over.
  const playFromPool = useCallback(
    async (pool: Pool) => {
      let current = pool;
      if (current.next >= current.tracks.length) {
        let tracks: Track[] = [];
        if (current.id !== null) {
          try {
            tracks = (await loadSongs(current.id, POOL_SIZE, current.played.slice(-EXCLUDE_MAX))).tracks;
          } catch {
            tracks = [];
          }
        }
        current = { ...current, tracks: tracks.length > 0 ? tracks : shuffled(current.tracks), next: 0 };
      }
      if (sourceRef.current !== pool) return;
      const track = current.tracks[current.next];
      const updated = { ...current, next: current.next + 1, played: [...current.played, track.id].slice(-EXCLUDE_MAX) };
      sourceRef.current = updated;
      setSource(updated);
      stop();
      setShareOutcome(null);
      dispatch({ type: 'startFree', songIndex: -1, track });
      announce(t('live.freeStarted'));
    },
    [stop, announce]
  );

  const startFreePlay = useCallback(() => {
    const current = sourceRef.current;
    if (current.kind === 'builtin') startBuiltin();
    else void playFromPool(current);
  }, [startBuiltin, playFromPool]);

  const chooseSource = useCallback(
    (choice: SourceChoice) => {
      const builtin = (failed: boolean) => {
        const next: FreeSource = { kind: 'builtin' };
        sourceRef.current = next;
        setSource(next);
        startBuiltin();
        if (failed) announce(t('sources.loadFailed'));
      };
      if (choice.kind === 'builtin') {
        builtin(false);
        return;
      }
      announce(t('sources.loading'));
      void (async () => {
        let label = choice.label;
        let tracks: Track[];
        try {
          if (choice.kind === 'category') {
            const list = await loadSongs(choice.id, POOL_SIZE);
            label = list.label || label;
            tracks = list.tracks;
          } else {
            tracks = shuffled(choice.tracks);
          }
        } catch {
          tracks = [];
        }
        if (tracks.length === 0) {
          builtin(true);
          return;
        }
        const pool: Pool = {
          kind: 'pool',
          id: choice.kind === 'category' ? choice.id : null,
          label,
          tracks,
          next: 0,
          played: [],
        };
        sourceRef.current = pool;
        setSource(pool);
        await playFromPool(pool);
        announce(t('live.sourceStarted', { source: label }));
      })();
    },
    [startBuiltin, playFromPool, announce]
  );

  const backToDaily = useCallback(() => {
    stop();
    (async () => {
      // Read again when the puzzle rolled over while the saved round was loading.
      let target = puzzleRef.current;
      let saved = await loadRound(target);
      while (puzzleRef.current !== target) {
        target = puzzleRef.current;
        saved = await loadRound(target);
      }
      setShareOutcome(null);
      dispatch({
        type: 'startDaily',
        puzzle: target,
        songIndex: dailySongIndex(target, SONG_COUNT),
        saved: saved ? { entries: saved.entries, status: saved.status } : null,
      });
      announce(t('live.dailyRestored'));
    })();
  }, [stop, announce]);

  // The About sheet's reset: storage, stats, today's board and the free-play history go; the
  // theme preference is reset by the screen through the theme provider.
  const resetData = useCallback(async () => {
    stop();
    await resetAllData();
    const fresh = emptyStats();
    statsRef.current = fresh;
    setStats(fresh);
    const puzzle = puzzleRef.current;
    setShareOutcome(null);
    dispatch({ type: 'startDaily', puzzle, songIndex: dailySongIndex(puzzle, SONG_COUNT), saved: null });
    playedFree.current.clear();
    sourceRef.current = { kind: 'builtin' };
    setSource(sourceRef.current);
    announce(t('about.resetDone'));
  }, [stop, announce]);

  const over = isOver(round);
  const unlocked = unlockedIndex(round);
  const seconds = SNIPPET_SECONDS[unlocked];
  const nextSeconds = unlocked + 1 < SNIPPET_SECONDS.length ? SNIPPET_SECONDS[unlocked + 1] : null;
  const isLastGuess = !over && round.entries.length === MAX_GUESSES - 1;

  const play = useCallback(() => {
    snippet.play(SNIPPET_SECONDS[unlockedIndex(roundRef.current)]);
  }, [snippet.play]);

  const shareText = useMemo(
    () =>
      over && round.mode === 'daily' && round.puzzle !== null
        ? buildShareText({ puzzle: round.puzzle, entries: round.entries, status: round.status, host: SITE_HOST })
        : null,
    [over, round]
  );

  // Called from the share button's press handler, so the share sheet still sees the gesture.
  // A dismissed sheet leaves the outcome and the live region as they were.
  const share = useCallback(() => {
    if (shareText === null) return;
    void shareResult(shareText).then((outcome) => {
      if (outcome === 'cancelled') return;
      setShareOutcome(outcome);
      announce(shareOutcomeMessage(outcome));
    });
  }, [shareText, announce]);

  return {
    round,
    puzzle,
    dailyIndex,
    answer,
    stats,
    restored,
    over,
    unlockedIndex: unlocked,
    seconds,
    nextSeconds,
    isLastGuess,
    snippet: snippet.view,
    play,
    stop,
    guess,
    skip,
    startFreePlay,
    chooseSource,
    sourceLabel: round.mode === 'free' && round.track !== undefined && source.kind === 'pool' ? source.label : null,
    backToDaily,
    shareText,
    shareOutcome,
    share,
    resetData,
  };
}
