import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { SnippetView } from './audio/snippetLogic';
import { useSnippetPlayer } from './audio/useSnippetPlayer';
import { SITE_HOST } from './config';
import { pickFreePlayIndex } from './freePlay';
import { dailySongIndex, MAX_GUESSES, SNIPPET_SECONDS, songLabel } from './game';
import type { Song } from './game';
import { t } from './i18n';
import { isOver, roundReducer, unlockedIndex } from './round';
import type { RoundEvent, RoundState } from './round';
import { shareOutcomeMessage, shareResult, shareText as buildShareText } from './share';
import type { ShareOutcome } from './share';
import { SONGS, SONG_COUNT } from './songs';
import { applyResult, emptyStats } from './stats';
import type { Stats } from './stats';
import { loadRound, loadStats, migrateRound, pruneRounds, resetAllData, saveRound, saveStats } from './storage';
import { useDailyPuzzle } from './useDailyPuzzle';

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

function reduce(state: RoundState, event: RoundEvent): RoundState {
  return roundReducer(state, event, SONGS[state.songIndex]);
}

function dailyStart(puzzle: number): RoundState {
  return { mode: 'daily', puzzle, songIndex: dailySongIndex(puzzle, SONG_COUNT), entries: [], status: 'playing' };
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

  const answer = SONGS[round.songIndex];
  const snippet = useSnippetPlayer(answer.previewUrl);
  const { stop } = snippet;

  // Mount and every rollover: read the saved round and the stats for this puzzle. A daily
  // board is replaced by the new day's; a free round keeps going underneath the new puzzle.
  const restoredOnce = useRef(false);
  useEffect(() => {
    let cancelled = false;
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

  // A guess or a skip: the reducer decides, storage and the stats follow.
  const apply = useCallback(
    (event: RoundEvent) => {
      const current = roundRef.current;
      const next = roundReducer(current, event, SONGS[current.songIndex]);
      if (next === current) return;
      dispatch(event);
      roundRef.current = next;
      const daily = next.mode === 'daily' && next.puzzle !== null;
      if (daily) {
        void saveRound({ puzzle: next.puzzle as number, entries: next.entries, status: next.status });
      }
      if (!isOver(next)) {
        const message = missMessage(next);
        if (message !== null) announce(message);
        return;
      }
      stop();
      const song = songLabel(SONGS[next.songIndex]);
      announce(next.status === 'won' ? t('live.won', { song }) : t('live.lost', { song }));
      if (daily) {
        const updated = applyResult(
          statsRef.current ?? emptyStats(),
          next.puzzle as number,
          next.status === 'won',
          next.entries.length
        );
        if (updated !== statsRef.current) {
          statsRef.current = updated;
          setStats(updated);
          void saveStats(updated);
        }
      }
    },
    [stop, announce]
  );

  const guess = useCallback((song: Song) => apply({ type: 'guess', song }), [apply]);
  const skip = useCallback(() => apply({ type: 'skip' }), [apply]);

  const startFreePlay = useCallback(() => {
    stop();
    const excluded = new Set<number>([dailySongIndex(puzzleRef.current, SONG_COUNT), ...playedFree.current]);
    const songIndex = pickFreePlayIndex(SONG_COUNT, excluded);
    playedFree.current.add(songIndex);
    setShareOutcome(null);
    dispatch({ type: 'startFree', songIndex });
    announce(t('live.freeStarted'));
  }, [stop, announce]);

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
    backToDaily,
    shareText,
    shareOutcome,
    share,
    resetData,
  };
}
