import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme, ThemePreference } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  value: ThemePreference;
  onChange: (preference: ThemePreference) => void;
};

const OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

function optionLabel(option: ThemePreference): string {
  switch (option) {
    case 'system':
      return t('about.theme.system');
    case 'light':
      return t('about.theme.light');
    case 'dark':
      return t('about.theme.dark');
  }
}

type KeyListener = (event: { key: string; preventDefault: () => void }) => void;
type Listening = {
  addEventListener?: (type: 'keydown', listener: KeyListener) => void;
  removeEventListener?: (type: 'keydown', listener: KeyListener) => void;
};

// A radio group with one tab stop: the chosen option is focusable, the arrow keys move to and
// choose the neighbours, Space and Enter choose the focused option. The key handling attaches
// to the group's element on web; elsewhere every option is a plain pressable. The chosen option
// shows a check mark as well as its fill, so the choice does not rest on colour alone (the fill is
// lost in forced-colours mode, where styles.css paints it in the system highlight colours).
export function ThemeChoice({ value, onChange }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const groupRef = useRef<View>(null);
  const optionRefs = useRef<(View | null)[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The option that has focus; Space chooses it.
  const focusedIndex = useRef<number | null>(null);

  useEffect(() => {
    const node = groupRef.current as unknown as Listening | null;
    if (node === null || typeof node.addEventListener !== 'function' || typeof node.removeEventListener !== 'function') {
      return undefined;
    }
    const target = node as Required<Listening>;
    const listener: KeyListener = (event) => {
      // Space would scroll the sheet: a role="radio" element gets no default action from the
      // browser, and the press handling reacts to Space only on buttons. Enter is handled there.
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        const focused = focusedIndex.current;
        if (focused !== null) onChangeRef.current(OPTIONS[focused]);
        return;
      }
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0;
      if (step === 0) return;
      event.preventDefault();
      const index = OPTIONS.indexOf(valueRef.current);
      const next = (index + step + OPTIONS.length) % OPTIONS.length;
      onChangeRef.current(OPTIONS[next]);
      optionRefs.current[next]?.focus();
    };
    target.addEventListener('keydown', listener);
    return () => target.removeEventListener('keydown', listener);
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('about.theme')}</Text>
      <View ref={groupRef} role="radiogroup" aria-label={t('about.theme')} style={styles.group}>
        {OPTIONS.map((option, index) => {
          const checked = option === value;
          return (
            <Pressable
              key={option}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onFocus={() => {
                focusedIndex.current = index;
              }}
              onBlur={() => {
                if (focusedIndex.current === index) focusedIndex.current = null;
              }}
              onPress={() => onChange(option)}
              style={({ pressed }) => [styles.option, checked && styles.optionChecked, pressed && styles.optionPressed]}
            >
              <Text style={[styles.optionText, checked && styles.optionTextChecked]}>
                {checked && <Text aria-hidden>{'✓ '}</Text>}
                {optionLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { ...text(13, '500'), color: theme.textSecondary },
    group: { flexDirection: 'row', gap: 8 },
    option: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      paddingHorizontal: 8,
    },
    optionChecked: { backgroundColor: theme.primary, borderColor: theme.primary },
    optionPressed: { opacity: 0.8 },
    optionText: { ...text(16, '600'), color: theme.text },
    optionTextChecked: { color: theme.onPrimary },
  });
}
