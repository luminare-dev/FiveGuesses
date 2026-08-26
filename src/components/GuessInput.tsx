import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchSongs, Song, songLabel } from '../game';
import { colors, radius } from '../theme';

type Props = {
  songs: Song[];
  onGuess: (song: Song) => void;
  onSkip: () => void;
  disabled?: boolean;
};

export function GuessInput({ songs, onGuess, onSkip, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Song | null>(null);

  const suggestions = useMemo(
    () => (selected ? [] : searchSongs(songs, query)),
    [songs, query, selected]
  );

  const commit = () => {
    if (!selected) return;
    onGuess(selected);
    setQuery('');
    setSelected(null);
  };

  return (
    <View style={styles.wrap}>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => {
                setSelected(s);
                setQuery(songLabel(s));
              }}
              style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
            >
              <Text style={styles.suggestionText} numberOfLines={1}>
                {songLabel(s)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput
        style={[styles.input, disabled && styles.disabled]}
        placeholder="Know it? Search artist or title…"
        placeholderTextColor={colors.dim}
        value={query}
        editable={!disabled}
        onChangeText={(t) => {
          setQuery(t);
          setSelected(null);
        }}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.buttons}>
        <Pressable
          onPress={onSkip}
          disabled={disabled}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed, disabled && styles.disabled]}
        >
          <Text style={styles.btnGhostText}>Skip (+ more audio)</Text>
        </Pressable>
        <Pressable
          onPress={commit}
          disabled={disabled || !selected}
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            pressed && styles.pressed,
            (disabled || !selected) && styles.disabled,
          ]}
        >
          <Text style={styles.btnPrimaryText}>Guess</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 10 },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHi,
    overflow: 'hidden',
  },
  suggestion: { paddingVertical: 10, paddingHorizontal: 12 },
  suggestionPressed: { backgroundColor: colors.surface },
  suggestionText: { color: colors.text, fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  btnGhostText: { color: colors.dim, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
