import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useOnline } from '../useOnline';
import { clampPosition, nextSnippetAction } from './snippetLogic';
import type { SnippetAnchor, SnippetState, SnippetView } from './snippetLogic';

// Grace on top of the snippet length before a load counts as failed, in milliseconds.
const SAFETY_MARGIN_MS = 2000;

// How far short of the snippet length the element may stand when the stop timer fires and still
// be paused at once, in seconds: timer jitter only. The anchor can come from a status whose
// clock has not started moving yet (the seeked status of a replay), so the timer may fire a
// tenth of a second early; anything further short waits for the rest.
const STOP_EPSILON = 0.01;

// A timer handle as clearTimeout accepts it, so the same code types on web and in Node.
type Timer = Parameters<typeof clearTimeout>[0];

// The controller's own fields. They live in a ref because the status handler, the timers and
// the press handlers all read and write them between renders; the published part is state.
type Controller = {
  state: SnippetState;
  seconds: number | null;
  anchor: SnippetAnchor | null;
  // Stop was pressed while loading: the pause waits for the first reported position so the
  // pending media play() promise is not interrupted.
  pendingStop: boolean;
  // The preview the audio element holds and can play again; a changed URL, or null after a
  // failure, makes the next press load the preview afresh.
  loadedUrl: string | null;
  // Play presses so far, published so a repeated notice is announced again.
  attempt: number;
  stopTimer: Timer;
  safetyTimer: Timer;
};

type Published = Pick<SnippetView, 'state' | 'seconds' | 'anchor' | 'attempt'>;

export type SnippetPlayer = {
  view: SnippetView;
  play: (seconds: number) => void;
  stop: () => void;
};

// expo-audio's web player starts its audio element with media.play() and drops the promise that
// call returns, so a load that fails or is aborted rejects with nobody listening and the page logs
// an uncaught error. The failure reaches the controller as an error status, or through the safety
// timer, all the same; the element's play() therefore gets a handler that only marks the
// rejection as handled. Once per element: a replaced preview brings a new one.
function handlePlayRejections(player: AudioPlayer): void {
  if (Platform.OS !== 'web' || typeof HTMLMediaElement === 'undefined') return;
  const media: unknown = (player as unknown as { media?: unknown }).media;
  if (!(media instanceof HTMLMediaElement) || Object.prototype.hasOwnProperty.call(media, 'play')) return;
  const play = HTMLMediaElement.prototype.play;
  media.play = function playHandled(this: HTMLMediaElement): Promise<void> {
    const started = play.call(this);
    started.catch(() => {});
    return started;
  };
}

function clearTimers(c: Controller): void {
  clearTimeout(c.stopTimer);
  clearTimeout(c.safetyTimer);
  c.stopTimer = undefined;
  c.safetyTimer = undefined;
}

// Plays the first N seconds of the current preview. The preview is requested only when play is
// pressed (never at mount), the stop is driven by the position the media element reports, and a
// wall-clock safety timer ends a load that never starts.
export function useSnippetPlayer(previewUrl: string | null): SnippetPlayer {
  // One player per mount, created without a source so no request leaves the page at load time.
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const online = useOnline();

  const controller = useRef<Controller>({
    state: 'idle',
    seconds: null,
    anchor: null,
    pendingStop: false,
    loadedUrl: null,
    attempt: 0,
    stopTimer: undefined,
    safetyTimer: undefined,
  });
  const [published, setPublished] = useState<Published>({ state: 'idle', seconds: null, anchor: null, attempt: 0 });
  const urlRef = useRef(previewUrl);
  urlRef.current = previewUrl;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
  }, []);

  const publish = useCallback(() => {
    const c = controller.current;
    setPublished({ state: c.state, seconds: c.seconds, anchor: c.anchor, attempt: c.attempt });
  }, []);

  const stop = useCallback(() => {
    const c = controller.current;
    clearTimers(c);
    if (c.state === 'loading') {
      c.pendingStop = true;
    } else if (!c.pendingStop) {
      player.pause();
    }
    c.state = 'idle';
    c.anchor = null;
    publish();
  }, [player, publish]);

  // A media element that reported an error, or whose load stalled, never fetches again on
  // play(); forgetting the loaded URL makes the next press replace it, so a retry is a request.
  const fail = useCallback(() => {
    const c = controller.current;
    player.pause();
    clearTimers(c);
    c.state = 'failed';
    c.anchor = null;
    c.pendingStop = false;
    c.loadedUrl = null;
    publish();
  }, [player, publish]);

  // The wall-clock backstop: a load that never reports a position has failed; playback that
  // outlived its stop timer ends here.
  const onSafety = useCallback(() => {
    const c = controller.current;
    c.safetyTimer = undefined;
    if (c.state === 'loading') {
      fail();
    } else if (c.state === 'playing') {
      stop();
    }
  }, [fail, stop]);

  const armSafety = useCallback(
    (ms: number) => {
      const c = controller.current;
      clearTimeout(c.safetyTimer);
      c.safetyTimer = setTimeout(onSafety, ms);
    },
    [onSafety]
  );

  // The anchored stop: armed from the reported position, so the snippet is as long as promised.
  // When it fires, the element's own position decides: short of the snippet length, the timer is
  // armed again for the rest instead of cutting the snippet short. That covers an anchor taken
  // before the audio clock ran and a stall still going at the planned stop (a stalled element
  // reports nothing while it waits for data, so it shows up only here); the safety timer bounds
  // the wait.
  const armStop = useCallback(
    (ms: number) => {
      const c = controller.current;
      clearTimeout(c.stopTimer);
      const onStop = () => {
        c.stopTimer = undefined;
        const seconds = c.seconds ?? 0;
        const position = player.currentTime;
        if (c.state === 'playing' && Number.isFinite(position) && position < seconds - STOP_EPSILON) {
          c.stopTimer = setTimeout(onStop, (seconds - position) * 1000);
          return;
        }
        stop();
      };
      c.stopTimer = setTimeout(onStop, Math.max(0, ms));
    },
    [player, stop]
  );

  const play = useCallback(
    (seconds: number) => {
      const c = controller.current;
      const url = urlRef.current;
      clearTimers(c);
      c.attempt += 1;
      c.seconds = seconds;
      c.anchor = null;
      if (!onlineRef.current) {
        c.state = 'offline';
        publish();
        return;
      }
      if (url === null) {
        c.state = 'failed';
        publish();
        return;
      }
      if (c.loadedUrl !== url) {
        // A load stopped before it played is still pending on the old element; pause it first,
        // because replace() resumes a playing element and the new one has no rejection handler yet.
        if (c.pendingStop) player.pause();
        player.replace({ uri: url });
        c.loadedUrl = url;
      }
      // Everything up to play() runs inside the press handler, which is what the browsers'
      // autoplay rules ask for.
      void player.seekTo(0);
      handlePlayRejections(player);
      player.play();
      c.state = 'loading';
      c.pendingStop = false;
      armSafety(seconds * 1000 + SAFETY_MARGIN_MS);
      publish();
    },
    [armSafety, player, publish]
  );

  // Every status update goes through the pure decision, after two checks on playback the
  // controller did not ask for.
  useEffect(() => {
    const c = controller.current;
    if (c.pendingStop) {
      if (status.error) {
        // The load that was stopped failed after the stop (the round ended or the song changed
        // meanwhile): nobody waits for it, so there is no notice; the next press loads afresh.
        c.pendingStop = false;
        c.loadedUrl = null;
      } else if (status.playing && status.currentTime > 0) {
        player.pause();
        c.pendingStop = false;
      }
      return;
    }
    if (!status.error) {
      // A media key, the browser's or the system's media controls or a headset button resumed
      // the preview while the bar is stopped: the element is paused again at once, so only the
      // unlocked seconds are ever heard. An old playing status of an element that is already
      // paused changes nothing.
      const stopped = c.state === 'idle' || c.state === 'offline' || c.state === 'failed';
      if (stopped && status.playing && !player.paused) {
        player.pause();
        return;
      }
      // Every pause the controller makes leaves 'playing' first, so a paused element while
      // 'playing' was paused from outside (or ran out of audio): the bar stops with it.
      if (c.state === 'playing' && player.paused) {
        stop();
        return;
      }
    }
    const seconds = c.seconds ?? 0;
    const now = Date.now();
    switch (nextSnippetAction(c.state, status, seconds, c.anchor, now)) {
      case 'fail':
        // Only a load or playback the bar shows can fail; an error of an element nobody waits
        // for (after a stop, or under a notice already shown) only makes the next press load
        // the preview afresh.
        if (c.state === 'loading' || c.state === 'playing') fail();
        else c.loadedUrl = null;
        break;
      case 'start':
        c.state = 'playing';
        c.anchor = { startedAt: now, offsetSeconds: status.currentTime, seconds };
        armStop((seconds - status.currentTime) * 1000);
        armSafety((seconds - status.currentTime) * 1000 + SAFETY_MARGIN_MS);
        publish();
        break;
      case 'reanchor':
        c.anchor = { startedAt: now, offsetSeconds: status.currentTime, seconds };
        armStop((seconds - status.currentTime) * 1000);
        armSafety((seconds - status.currentTime) * 1000 + SAFETY_MARGIN_MS);
        publish();
        break;
      case 'stop':
        stop();
        break;
      case 'none':
        break;
    }
  }, [status, armSafety, armStop, fail, player, publish, stop]);

  // Back online: the notice goes away without a press.
  useEffect(() => {
    const c = controller.current;
    if (online && c.state === 'offline') {
      c.state = 'idle';
      publish();
    }
  }, [online, publish]);

  // A new song: whatever was playing stops; the next press loads the new preview.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    stop();
  }, [previewUrl, stop]);

  useEffect(() => {
    const c = controller.current;
    return () => clearTimers(c);
  }, []);

  const position = published.state === 'playing' ? clampPosition(status.currentTime, published.seconds) : 0;
  const view = useMemo<SnippetView>(
    () => ({
      state: published.state,
      seconds: published.seconds,
      anchor: published.anchor,
      position,
      attempt: published.attempt,
    }),
    [published, position]
  );

  return { view, play, stop };
}
