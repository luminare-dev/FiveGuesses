import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputKeyPressEvent } from 'react-native';
import { findExactMatch, normalize, searchSongs, songLabel } from '../game';
import type { Song } from '../game';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { LISTBOX_ROLE } from '../types/react-native-web';
import { Button } from './Button';

type Props = {
  songs: readonly Song[];
  // Seconds a skip unlocks; null on the last guess.
  nextSeconds: number | null;
  isLastGuess: boolean;
  onGuess: (song: Song) => void;
  onSkip: () => void;
  // Receives the suggestion count and the no-match notice for the live region.
  announce: (message: string) => void;
  // Takes that message back from the live region once it no longer holds.
  withdraw?: (message: string) => void;
};

const INPUT_ID = 'guess-input';
const LISTBOX_ID = 'guess-listbox';
const LAST_WARNING_ID = 'guess-last-warning';
const MAX_SUGGESTIONS = 8;
// Typing announces the number of matches once the keys have paused this long.
const ANNOUNCE_DELAY = 300;

const optionId = (song: Song) => `guess-option-${song.id}`;
// The threshold searchSongs uses: two characters left after normalisation. "a-" or "R." on the
// way to "a-ha" or "R.E.M." is not a query yet, so it gets no list and no "no match" verdict.
const isQuery = (value: string) => normalize(value).length >= 2;

// The guess box: a combobox whose listbox opens below the input after two typed characters.
// Arrow keys move the highlight, Home and End jump, Enter guesses the highlighted or the only
// match (or an exactly typed song), Escape closes the list and then clears the text. Focus
// stays in the input; the options are reachable by pointer and through aria-activedescendant.
// Only the keys move the highlight: a pointer resting where the list opens gets a hover from
// the browser without being moved, so hover only tints the option and never picks the guess.
export function GuessCombobox({ songs, nextSeconds, isLastGuess, onGuess, onSkip, announce, withdraw }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  // The song under the pointer, for the hover tint only.
  const [hovered, setHovered] = useState<number | null>(null);
  // Escape and Tab close the list until the text changes again.
  const [dismissed, setDismissed] = useState(false);

  const suggestions = useMemo(() => searchSongs(songs, query, MAX_SUGGESTIONS), [songs, query]);
  const typed = isQuery(query);
  const open = typed && !dismissed && suggestions.length > 0;
  const noMatches = typed && suggestions.length === 0;
  const activeId = open && highlight !== null && highlight < suggestions.length ? optionId(suggestions[highlight]) : undefined;

  // Focus stays in the input, so the browser does not scroll to the active option by itself;
  // below the fold (a phone with the on-screen keyboard up) it would be picked unseen.
  useEffect(() => {
    if (activeId === undefined || Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  // One pending announcement at a time. A guess, Enter, Escape, Tab, a skip or an unmount drops
  // it: the round's own message or the key's verdict must not be overwritten by a stale
  // suggestion count, and a closed list or a box the player has left has no count to announce.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = useCallback(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current);
      pending.current = null;
    }
  }, []);
  useEffect(() => cancelPending, [cancelPending]);
  // The count or verdict this box last sent to the live region. A closed list, an emptied box
  // and focus moving on take it back, so the region never tells the player to use the arrow keys
  // on a list that is gone; a guess or a skip replaces it with the round's own message.
  const shown = useRef<string | null>(null);
  const say = (message: string) => {
    shown.current = message;
    announce(message);
  };
  const takeBack = () => {
    if (shown.current !== null) withdraw?.(shown.current);
    shown.current = null;
  };

  const onChangeText = (value: string) => {
    setQuery(value);
    setHighlight(null);
    setDismissed(false);
    cancelPending();
    if (!isQuery(value)) {
      takeBack();
      return;
    }
    const count = searchSongs(songs, value, MAX_SUGGESTIONS).length;
    pending.current = setTimeout(() => {
      pending.current = null;
      if (count === 0) say(t('guess.noMatches'));
      else if (count === 1) say(t('live.suggestionOne'));
      else say(t('live.suggestions', { count }));
    }, ANNOUNCE_DELAY);
  };

  const submit = (song: Song) => {
    cancelPending();
    shown.current = null;
    onGuess(song);
    setQuery('');
    setHighlight(null);
    setDismissed(false);
    inputRef.current?.focus();
  };

  // Enter and the Guess button: the highlighted option, else the only suggestion, else an
  // exactly typed song; otherwise the no-match notice.
  const submitTyped = () => {
    cancelPending();
    if (open && highlight !== null && highlight < suggestions.length) {
      submit(suggestions[highlight]);
      return;
    }
    if (open && suggestions.length === 1) {
      submit(suggestions[0]);
      return;
    }
    const match = findExactMatch(songs, query);
    if (match !== null) submit(match);
    else say(t('guess.noMatches'));
  };

  const onKeyPress = (event: TextInputKeyPressEvent) => {
    const key = event.nativeEvent.key;
    const last = suggestions.length - 1;
    switch (key) {
      case 'ArrowDown':
        if (open) {
          setHighlight((current) => (current === null ? 0 : Math.min(current + 1, last)));
          event.preventDefault();
        } else if (typed && suggestions.length > 0) {
          setDismissed(false);
          setHighlight(0);
          event.preventDefault();
        }
        return;
      case 'ArrowUp':
        if (open) {
          setHighlight((current) => (current === null ? 0 : Math.max(current - 1, 0)));
          event.preventDefault();
        }
        return;
      case 'Home':
        if (open) {
          setHighlight(0);
          event.preventDefault();
        }
        return;
      case 'End':
        if (open) {
          setHighlight(last);
          event.preventDefault();
        }
        return;
      case 'Escape':
        cancelPending();
        takeBack();
        if (open) {
          setDismissed(true);
          setHighlight(null);
          event.preventDefault();
        } else {
          setQuery('');
          setHighlight(null);
        }
        return;
      case 'Tab':
        cancelPending();
        if (open) {
          takeBack();
          setDismissed(true);
          setHighlight(null);
        }
        return;
      default:
        return;
    }
  };

  const skip = () => {
    cancelPending();
    shown.current = null;
    onSkip();
  };

  const skipLabel = nextSeconds === null ? t('guess.skipLast') : t('guess.skip', { next: nextSeconds });

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        role="combobox"
        nativeID={INPUT_ID}
        aria-label={t('guess.label')}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={activeId}
        aria-haspopup="listbox"
        style={styles.input}
        placeholder={t('guess.placeholder')}
        placeholderTextColor={theme.textMuted}
        value={query}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        onSubmitEditing={submitTyped}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
      />
      {open && (
        <View role={LISTBOX_ROLE} nativeID={LISTBOX_ID} aria-label={t('guess.listLabel')} style={styles.listbox}>
          {suggestions.map((song, index) => {
            const highlighted = index === highlight;
            return (
              <Pressable
                key={song.id}
                role="option"
                nativeID={optionId(song)}
                aria-selected={highlighted}
                tabIndex={-1}
                onPress={() => submit(song)}
                onHoverIn={() => setHovered(song.id)}
                onHoverOut={() => setHovered((current) => (current === song.id ? null : current))}
                style={({ pressed }) => [
                  styles.option,
                  (pressed || hovered === song.id) && styles.optionHovered,
                  highlighted && styles.optionHighlighted,
                ]}
              >
                <Text style={styles.optionText}>{songLabel(song)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {noMatches && <Text style={styles.noMatches}>{t('guess.noMatches')}</Text>}
      {isLastGuess && (
        <Text nativeID={LAST_WARNING_ID} style={styles.hidden}>
          {t('guess.lastWarning')}
        </Text>
      )}
      <View style={styles.buttons}>
        <Button
          variant="secondary"
          label={skipLabel}
          onPress={skip}
          style={styles.half}
          aria-describedby={isLastGuess ? LAST_WARNING_ID : undefined}
        />
        <Button label={t('guess.submit')} onPress={submitTyped} disabled={query.length === 0} style={styles.half} />
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 10 },
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
    listbox: {
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    // Every option keeps a 2 px border so the highlight does not shift the text; the highlighted
    // option draws it in the active-row colour (above 3:1 on both fills) on top of the hover fill,
    // since the input keeps focus and this is the only sign of the active option. A hovered option
    // gets the fill alone. Long titles wrap instead of losing their end.
    option: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: radius.sm,
    },
    optionHovered: { backgroundColor: theme.surfaceHover },
    optionHighlighted: { backgroundColor: theme.surfaceHover, borderColor: theme.activeRow },
    optionText: { ...text(15), color: theme.text },
    noMatches: { ...text(13, '500'), color: theme.textSecondary, paddingHorizontal: 4 },
    // Read by assistive technology through aria-describedby, not shown.
    hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
    buttons: { flexDirection: 'row', gap: 10 },
    half: { flex: 1 },
  });
}
