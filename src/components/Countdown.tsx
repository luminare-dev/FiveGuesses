import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { t } from '../i18n';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  // HH:MM:SS from useCountdown.
  time: string;
  style?: StyleProp<TextStyle>;
};

// The time until the next daily song. A ticking timer is never announced; the live region
// says when the new song is ready.
export function Countdown({ time, style }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Text role="timer" aria-live="off" style={[styles.timer, style]}>
      {t('countdown.label', { time })}
    </Text>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    timer: { ...text(13, '500'), ...tabularNums, color: theme.textSecondary, textAlign: 'center' },
  });
}
