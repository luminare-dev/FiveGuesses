import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { card } from '../theme/surface';
import { fluid, tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

// The rules in three steps, for the side column of the two-column layout.
export function HowTo() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const steps = [t('howto.listen'), t('howto.guess'), t('howto.double')];
  return (
    <View style={styles.card}>
      <Text role="heading" aria-level={2} style={styles.title}>
        {t('howto.title')}
      </Text>
      <View role="list" style={styles.list}>
        {steps.map((step, index) => (
          <View key={step} role="listitem" style={styles.item}>
            <Text aria-hidden style={styles.number}>
              {String(index + 1)}
            </Text>
            <Text style={styles.step}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: { ...card(theme), padding: fluid(16, 22), gap: 10 },
    title: { ...text(15, '700'), color: theme.text },
    list: { gap: 8 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    number: {
      ...text(12, '700'),
      ...tabularNums,
      width: 22,
      height: 22,
      lineHeight: 22,
      borderRadius: radius.pill,
      textAlign: 'center',
      color: theme.primary,
      borderWidth: 1,
      borderColor: theme.primary,
      overflow: 'hidden',
    },
    step: { ...text(14), color: theme.textSecondary, flex: 1 },
  });
}
