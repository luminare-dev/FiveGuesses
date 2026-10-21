import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchSongs, Song, songLabel } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  songs: Song[];
  nextSeconds: number | null; // seconds a skip unlocks; null on the last guess
  onGuess: (song: Song) => void;
  onSkip: () => void;
  disabled?: boolean;
};

export function GuessInput({ songs, nextSeconds, onGuess, onSkip, disabled }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        placeholder={t('guess.placeholder')}
        placeholderTextColor={theme.textMuted}
        value={query}
        editable={!disabled}
        onChangeText={(value) => {
          setQuery(value);
          setSelected(null);
        }}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.buttons}>
        <Button
          variant="secondary"
          label={nextSeconds == null ? t('guess.skipLast') : t('guess.skip', { next: nextSeconds })}
          onPress={onSkip}
          disabled={disabled}
          style={styles.half}
        />
        <Button label={t('guess.submit')} onPress={commit} disabled={disabled || !selected} style={styles.half} />
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 10 },
    suggestions: {
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    suggestion: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
    suggestionPressed: { backgroundColor: theme.surfaceHover },
    suggestionText: { ...text(15), color: theme.text },
    input: {
      ...text(16),
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    buttons: { flexDirection: 'row', gap: 10 },
    half: { flex: 1 },
    disabled: { opacity: 0.45 },
  });
}
