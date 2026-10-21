import { act, createElement } from 'react';
import type { ReactElement } from 'react';
import type { AudioStatus } from 'expo-audio';
import { clampPosition, nextSnippetAction } from '../audio/snippetLogic';
import type { SnippetAnchor } from '../audio/snippetLogic';
import { useSnippetPlayer } from '../audio/useSnippetPlayer';
import type { SnippetPlayer } from '../audio/useSnippetPlayer';

// A stand-in for the expo-audio player and its status stream. The hook sees the same API
// surface it uses in the browser; the test pushes status updates by hand.
const mockPlayer = {
  id: '0',
  // The element's own position, read when the stop timer fires; NaN reads as unknown.
  currentTime: Number.NaN,
  // The element's paused flag as play() and pause() leave it; a test sets it by hand to act
  // like a media key or the system's media controls.
  paused: true,
  replace: jest.fn(() => {
    mockPlayer.paused = true;
  }),
  seekTo: jest.fn(() => Promise.resolve()),
  play: jest.fn(() => {
    mockPlayer.paused = false;
  }),
  pause: jest.fn(() => {
    mockPlayer.paused = true;
  }),
};

const mockStatusStore = {
  status: baseStatus(),
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockStatusStore.listeners.add(listener);
    return () => {
      mockStatusStore.listeners.delete(listener);
    };
  },
  read() {
    return mockStatusStore.status;
  },
  emit(partial: Partial<AudioStatus>) {
    mockStatusStore.status = { ...mockStatusStore.status, ...partial };
    for (const listener of mockStatusStore.listeners) listener();
  },
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () =>
    (require('react') as typeof import('react')).useSyncExternalStore(mockStatusStore.subscribe, mockStatusStore.read),
  setAudioModeAsync: () => Promise.resolve(),
}));

// react-test-renderer ships without type declarations; this is the part of its API the test uses.
type TestRenderer = { update: (element: ReactElement) => void; unmount: () => void };
const { create } = require('react-test-renderer') as { create: (element: ReactElement) => TestRenderer };

function baseStatus(): AudioStatus {
  return {
    id: '0',
    currentTime: 0,
    playbackState: '',
    timeControlStatus: 'paused',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 0,
    playing: false,
    loop: false,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: false,
    playbackRate: 1,
    shouldCorrectPitch: true,
    isLive: false,
    currentOffsetFromLive: null,
    error: null,
  };
}

const anchor = (startedAt: number, offsetSeconds: number, seconds = 1): SnippetAnchor => ({
  startedAt,
  offsetSeconds,
  seconds,
});

describe('nextSnippetAction', () => {
  it('ignores the play event that arrives before any data', () => {
    expect(nextSnippetAction('loading', { playing: true, currentTime: 0 }, 1, null, 0)).toBe('none');
  });
  it('starts once a position is reported', () => {
    expect(nextSnippetAction('loading', { playing: true, currentTime: 0.12 }, 1, null, 0)).toBe('start');
  });
  it('keeps playing while the position is inside the snippet and on schedule', () => {
    expect(nextSnippetAction('playing', { playing: true, currentTime: 0.9 }, 1, anchor(0, 0), 900)).toBe('none');
  });
  it('stops at the snippet length and beyond it', () => {
    expect(nextSnippetAction('playing', { playing: true, currentTime: 1.0 }, 1, anchor(0, 0), 1000)).toBe('stop');
    expect(nextSnippetAction('playing', { playing: true, currentTime: 1.3 }, 1, anchor(0, 0), 1300)).toBe('stop');
  });
  it('re-anchors when the reported position drifts from the estimate', () => {
    expect(
      nextSnippetAction(
        'playing',
        { playing: true, currentTime: 0.3 },
        4,
        { startedAt: 0, offsetSeconds: 0, seconds: 4 },
        1000
      )
    ).toBe('reanchor');
  });
  it('fails on an error in any state', () => {
    const error = { playing: false, currentTime: 0, error: 'Playback error (code 4)' };
    expect(nextSnippetAction('idle', error, 1, null, 0)).toBe('fail');
    expect(nextSnippetAction('loading', error, 1, null, 0)).toBe('fail');
    expect(nextSnippetAction('playing', error, 1, anchor(0, 0), 500)).toBe('fail');
    expect(nextSnippetAction('offline', error, 1, null, 0)).toBe('fail');
    expect(nextSnippetAction('failed', error, 1, null, 0)).toBe('fail');
  });
  it('ignores a stale event while idle', () => {
    expect(nextSnippetAction('idle', { playing: true, currentTime: 5 }, 1, null, 0)).toBe('none');
  });
  it('ignores a pause while loading and a stall inside the tolerance', () => {
    expect(nextSnippetAction('loading', { playing: false, currentTime: 0 }, 1, null, 0)).toBe('none');
    expect(nextSnippetAction('playing', { playing: true, currentTime: 0.5 }, 4, anchor(0, 0, 4), 600)).toBe('none');
  });
});

describe('clampPosition', () => {
  it('keeps the position inside the snippet', () => {
    expect(clampPosition(0.4, 1)).toBe(0.4);
    expect(clampPosition(1.3, 1)).toBe(1);
    expect(clampPosition(-0.2, 1)).toBe(0);
    expect(clampPosition(0.4, null)).toBe(0);
    expect(clampPosition(Number.NaN, 1)).toBe(0);
  });
});

describe('useSnippetPlayer', () => {
  const URL_A = 'https://audio-ssl.itunes.apple.com/a.m4a';
  const URL_B = 'https://audio-ssl.itunes.apple.com/b.m4a';
  let latest: SnippetPlayer;
  let renderer: TestRenderer;

  function Harness({ url }: { url: string | null }) {
    latest = useSnippetPlayer(url);
    return null;
  }

  function mount(url: string | null = URL_A) {
    act(() => {
      renderer = create(createElement(Harness, { url }));
    });
  }

  function emit(partial: Partial<AudioStatus>) {
    act(() => {
      mockStatusStore.emit(partial);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStatusStore.status = baseStatus();
    mockPlayer.currentTime = Number.NaN;
    mockPlayer.paused = true;
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
    jest.useRealTimers();
  });

  it('starts idle and requests nothing at mount', () => {
    mount();
    expect(latest.view).toEqual({ state: 'idle', seconds: null, anchor: null, position: 0, attempt: 0 });
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('loads the preview on the press and plays from the start', () => {
    mount();
    act(() => latest.play(1));
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: URL_A });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(latest.view.state).toBe('loading');
    expect(latest.view.seconds).toBe(1);
  });

  it('fails through the safety timer when no position is ever reported', () => {
    mount();
    act(() => latest.play(1));
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(latest.view.state).toBe('loading');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(latest.view.state).toBe('failed');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('defers the pause of a stop pressed while loading until playback reports a position', () => {
    mount();
    act(() => latest.play(1));
    act(() => latest.stop());
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    emit({ playing: true, currentTime: 0 });
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(latest.view.state).toBe('idle');
  });

  it('anchors the stop timer to the reported position', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0 });
    expect(latest.view.state).toBe('loading');
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    expect(latest.view.state).toBe('playing');
    expect(latest.view.anchor).toMatchObject({ offsetSeconds: 0.2, seconds: 1 });
    expect(latest.view.position).toBe(0.2);
    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(latest.view.state).toBe('playing');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(latest.view.state).toBe('idle');
    expect(latest.view.position).toBe(0);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('waits out a stall that is still going at the planned stop', () => {
    mount();
    act(() => latest.play(4));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    act(() => {
      jest.advanceTimersByTime(1800);
    });
    // On schedule, so no re-anchor; then the element stalls and reports nothing.
    emit({ currentTime: 2.0 });
    mockPlayer.currentTime = 2.0;
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(latest.view.state).toBe('playing');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    // Data arrives: the reported position re-anchors the stop for the remaining 1.5 s.
    mockPlayer.currentTime = 2.5;
    emit({ currentTime: 2.5 });
    act(() => {
      jest.advanceTimersByTime(1499);
    });
    expect(latest.view.state).toBe('playing');
    mockPlayer.currentTime = 4.0;
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('plays a replay anchored before the audio clock ran to its full length', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    emit({ playing: true, currentTime: 1.01 });
    expect(latest.view.state).toBe('idle');
    // The replay's seeked status already reads as playing, a tick past the start.
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.002 });
    expect(latest.view.state).toBe('playing');
    // The audio clock started a tenth of a second late: the timer fires at 0.907.
    mockPlayer.currentTime = 0.907;
    act(() => {
      jest.advanceTimersByTime(998);
    });
    expect(latest.view.state).toBe('playing');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(latest.view.state).toBe('playing');
    // The timer was armed again for the remaining 93 ms; by then the element is at the end.
    mockPlayer.currentTime = 1.0;
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
  });

  it('ends a stall longer than the safety margin through the safety timer', () => {
    mount();
    act(() => latest.play(4));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    mockPlayer.currentTime = 0.2;
    act(() => {
      jest.advanceTimersByTime(3800);
    });
    expect(latest.view.state).toBe('playing');
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('stops from the reported position before the timer', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.1, isLoaded: true });
    emit({ playing: true, currentTime: 1.02 });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('reports a playback error as failed and loads the preview afresh on the next press', () => {
    mount();
    act(() => latest.play(2));
    emit({ error: 'Playback error (code 4)', playing: false, isLoaded: false });
    expect(latest.view.state).toBe('failed');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    act(() => latest.play(2));
    expect(latest.view.state).toBe('loading');
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: URL_A });
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  });

  it('loads the preview afresh after the safety timer failed a stalled load', () => {
    mount();
    act(() => latest.play(1));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(latest.view.state).toBe('failed');
    act(() => latest.play(1));
    expect(latest.view.state).toBe('loading');
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded preview for a replay after a normal stop', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    emit({ playing: true, currentTime: 1.01 });
    expect(latest.view.state).toBe('idle');
    act(() => latest.play(1));
    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  });

  it('stops when the song changes and loads the new preview on the next press', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.3, isLoaded: true });
    expect(latest.view.state).toBe('playing');
    act(() => {
      renderer.update(createElement(Harness, { url: URL_B }));
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    act(() => latest.play(1));
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: URL_B });
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  });

  it('pauses playback resumed from outside while the bar is stopped', () => {
    mount();
    // An old playing status of an element that is already paused changes nothing.
    emit({ playing: true, currentTime: 2 });
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    // A media key resumes the element.
    mockPlayer.paused = false;
    emit({ playing: true, currentTime: 2.1 });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(latest.view.state).toBe('idle');
    // The same after a failed load: the notice stays and the element is paused.
    act(() => latest.play(1));
    emit({ error: 'Playback error (code 4)', playing: false, isLoaded: false });
    expect(latest.view.state).toBe('failed');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(2);
    mockPlayer.paused = false;
    emit({ error: null, playing: true, currentTime: 0.4 });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(3);
    expect(latest.view.state).toBe('failed');
  });

  it('returns to idle when the snippet is paused from outside', () => {
    mount();
    act(() => latest.play(4));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    expect(latest.view.state).toBe('playing');
    // The system's media controls pause the element half a second in.
    mockPlayer.paused = true;
    mockPlayer.currentTime = 0.5;
    emit({ playing: false, currentTime: 0.5 });
    expect(latest.view.state).toBe('idle');
    expect(latest.view.anchor).toBeNull();
    expect(latest.view.position).toBe(0);
    // No timer is left to act on the stopped bar.
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(latest.view.state).toBe('idle');
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('fails at once without a preview URL', () => {
    mount(null);
    act(() => latest.play(1));
    expect(latest.view.state).toBe('failed');
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('counts every press, also one that ends in the same notice as the press before', () => {
    mount(null);
    expect(latest.view.attempt).toBe(0);
    act(() => latest.play(1));
    expect(latest.view).toMatchObject({ state: 'failed', attempt: 1 });
    act(() => latest.play(1));
    expect(latest.view).toMatchObject({ state: 'failed', attempt: 2 });
  });

  it('shows no notice for a load that fails after a stop, and loads afresh on the next press', () => {
    mount();
    act(() => latest.play(1));
    // The round ends while the preview is still loading.
    act(() => latest.stop());
    emit({ error: 'Playback error (code 2)', playing: false, isLoaded: false });
    expect(latest.view.state).toBe('idle');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(latest.view.state).toBe('idle');
    act(() => latest.play(1));
    expect(latest.view.state).toBe('loading');
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  });

  it('shows no notice for an error of an element that was stopped normally', () => {
    mount();
    act(() => latest.play(1));
    emit({ playing: true, currentTime: 0.2, isLoaded: true });
    emit({ playing: true, currentTime: 1.01 });
    expect(latest.view.state).toBe('idle');
    emit({ error: 'Playback error (code 2)', playing: false, isLoaded: false });
    expect(latest.view.state).toBe('idle');
    act(() => latest.play(1));
    expect(latest.view.state).toBe('loading');
    expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  });
});
