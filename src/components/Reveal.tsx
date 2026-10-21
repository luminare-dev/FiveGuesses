import React, { useState } from 'react';
import { Image, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GuessEntry, RoundStatus, shareText, Song, songLabel } from '../game';
import { colors, radius } from '../theme';

type Props = {
  song: Song;
  status: RoundStatus;
  entries: GuessEntry[];
  puzzle: number | null; // null = free play (no share)
  onFreePlay: () => void;
};

export function Reveal({ song, status, entries, puzzle, onFreePlay }: Props) {
  const [copied, setCopied] = useState(false);
  const won = status === 'won';

  const doShare = async () => {
    if (puzzle == null) return;
    // The board stores the winning row; the share builder adds it back on a win.
    const text = shareText(puzzle, entries.filter((e) => e.kind !== 'correct'), won);
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    } else {
      try {
        await Share.share({ message: text });
      } catch {}
    }
  };

  return (
    <View style={styles.card}>
      <Text style={[styles.headline, { color: won ? colors.green : colors.red }]}>
        {won ? 'Got it! 🙌' : 'Out of guesses'}
      </Text>
      {!!song.artworkUrl && <Image source={{ uri: song.artworkUrl }} style={styles.art} />}
      <Text style={styles.title}>{songLabel(song)}</Text>
      <Text style={styles.year}>{song.year}</Text>

      {!!song.appleMusicUrl && (
        <Pressable onPress={() => Linking.openURL(song.appleMusicUrl!)} style={styles.appleBtn}>
          <Text style={styles.appleBtnText}> Listen on Apple Music</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        {puzzle != null && (
          <Pressable onPress={doShare} style={[styles.btn, styles.btnPrimary]}>
            <Text style={styles.btnPrimaryText}>{copied ? 'Copied!' : 'Share result'}</Text>
          </Pressable>
        )}
        <Pressable onPress={onFreePlay} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Play a free round</Text>
        </Pressable>
      </View>

      <Text style={styles.attribution}>Song previews courtesy of Apple Music</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  headline: { fontSize: 20, fontWeight: '800' },
  art: { width: 160, height: 160, borderRadius: radius.md, marginTop: 6 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  year: { color: colors.dim, fontSize: 14 },
  appleBtn: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  appleBtnText: { color: '#111', fontWeight: '700', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: '600' },
  attribution: { color: colors.dim, fontSize: 11, marginTop: 10 },
});
