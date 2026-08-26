import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

/**
 * Plays the first N seconds of a preview URL, then pauses.
 * Snippet timing is wall-clock based — precise enough for a guessing game.
 */
export function useSnippetPlayer(url: string | null) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const [playingSeconds, setPlayingSeconds] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      player.pause();
    } catch {}
    setPlayingSeconds(null);
  };

  const play = (seconds: number) => {
    if (!url) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      player.seekTo(0);
      player.play();
    } catch {
      return;
    }
    setPlayingSeconds(seconds);
    timer.current = setTimeout(() => {
      try {
        player.pause();
      } catch {}
      setPlayingSeconds(null);
    }, seconds * 1000);
  };

  return { play, stop, playingSeconds };
}
