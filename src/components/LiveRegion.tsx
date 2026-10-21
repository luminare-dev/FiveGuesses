import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  message: string;
  // From useAnnouncer: changes with every announcement, also when the text is the same.
  nonce: number;
};

// The polite live region, mounted once directly under the header and never remounted. For
// every announcement the text is cleared and set again on the next frame, so a message that
// repeats word for word is still read out. The text stays visible for sighted players too.
export function LiveRegion({ message, nonce }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [shown, setShown] = useState('');

  useEffect(() => {
    setShown('');
    const frame = requestAnimationFrame(() => setShown(message));
    return () => cancelAnimationFrame(frame);
  }, [message, nonce]);

  return (
    <Text role="status" aria-live="polite" aria-atomic style={styles.region}>
      {shown}
    </Text>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    region: {
      ...text(13, '500'),
      color: theme.textSecondary,
      minHeight: 20,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
  });
}
