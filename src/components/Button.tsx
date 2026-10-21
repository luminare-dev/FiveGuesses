import React, { useMemo, useState } from 'react';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

export type ButtonVariant = 'primary' | 'secondary';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<View>;
  'aria-describedby'?: string;
};

// The shared text button: a filled primary action or an outlined secondary one,
// at least 44 px high, with a role and a visible text label. Hover and pressed states follow
// the role map; the dark theme keeps its fill and dims it instead.
export function Button({ label, onPress, variant = 'primary', disabled = false, style, ref, ...a11y }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [hovered, setHovered] = useState(false);
  const primary = variant === 'primary';

  return (
    <Pressable
      ref={ref}
      role="button"
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        hovered && !pressed && !disabled && (primary ? styles.primaryHover : styles.secondaryHover),
        pressed && !disabled && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
        style,
      ]}
      {...a11y}
    >
      <Text style={primary ? styles.primaryLabel : styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  const dims = theme.scheme === 'dark';
  return StyleSheet.create({
    base: {
      minHeight: 44,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // The transparent border is invisible here; in forced-colours mode, where the fill turns into
    // the page colour, the browser draws it in the system text colour, so the button keeps its shape.
    primary: { backgroundColor: theme.primary, borderWidth: 1, borderColor: 'transparent' },
    primaryHover: dims ? { opacity: 0.9 } : { backgroundColor: theme.primaryHover },
    primaryPressed: dims ? { opacity: 0.8 } : { backgroundColor: theme.primaryPressed },
    primaryLabel: { ...text(16, '600'), color: theme.onPrimary },
    secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.borderStrong },
    secondaryHover: { backgroundColor: theme.surfaceHover },
    secondaryPressed: { backgroundColor: theme.surfaceHover, opacity: 0.9 },
    secondaryLabel: { ...text(16, '600'), color: theme.text },
    disabled: { opacity: 0.45 },
  });
}
