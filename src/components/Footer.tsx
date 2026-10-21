import React, { useMemo } from 'react';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LEGAL_PATH, PROJECT_PAGE_URL } from '../config';
import { t, tNodes } from '../i18n';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

type Props = {
  onOpenAbout: () => void;
  // The About control here; focus returns to it when the sheet closes.
  aboutButtonRef: Ref<View>;
};

// Two lines on every screen: the previews attribution and the studio line with the project
// page link, the About opener and the legal page link. The separators are decorative. The About
// opener and the legal link get a 44 px target around their 12 px text, like every other
// control; the studio link stays inline in its sentence.
export function Footer({ onOpenAbout, aboutButtonRef }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View role="contentinfo" style={styles.footer}>
      <Text style={styles.line}>{t('footer.previews')}</Text>
      <View style={styles.row}>
        <Text style={styles.line}>
          {tNodes('footer.copyright', {
            studio: (
              <Text
                role="link"
                href={PROJECT_PAGE_URL}
                hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
                aria-label={t('footer.projectPage')}
                style={styles.link}
              >
                {t('about.studio')}
              </Text>
            ),
          })}
        </Text>
        <Text aria-hidden style={styles.line}>
          {' · '}
        </Text>
        <Pressable ref={aboutButtonRef} role="button" onPress={onOpenAbout} style={styles.button}>
          <Text style={[styles.line, styles.link]}>{t('footer.about')}</Text>
        </Pressable>
        <Text aria-hidden style={styles.line}>
          {' · '}
        </Text>
        <Text role="link" href={LEGAL_PATH} style={[styles.line, styles.link, styles.target]}>
          {t('footer.legal')}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    footer: { alignSelf: 'stretch', alignItems: 'center', gap: 2, marginTop: 8 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
    line: { ...text(12, '500'), color: theme.textMuted, textAlign: 'center' },
    // Underlined, not told apart by colour alone: the studio link sits inside its sentence.
    link: { color: theme.link, textDecorationLine: 'underline' },
    // Taller, not wider: the line still fits one row from 390 px.
    button: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
    target: { minHeight: 44, lineHeight: 44 },
  });
}
