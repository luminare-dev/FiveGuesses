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

// Three short lines on every screen, so none of them wraps on a 320 px phone: the previews
// attribution, the studio line with the project page link, and the About opener with the legal
// page link, at the foot of the page however short it is. The separator is decorative. The
// About button and the legal link get a 44 px target around their 13 px text, like every other
// control; the studio link stays inline in its sentence.
export function Footer({ onOpenAbout, aboutButtonRef }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View role="contentinfo" style={styles.footer}>
      <Text style={styles.line}>{t('footer.previews')}</Text>
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
      <View style={styles.row}>
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
    footer: { alignSelf: 'stretch', alignItems: 'center', gap: 2, marginTop: 'auto', paddingTop: 4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
    line: { ...text(13, '500'), color: theme.textMuted, textAlign: 'center' },
    // Underlined, not told apart by colour alone: the studio link sits inside its sentence.
    link: { color: theme.link, textDecorationLine: 'underline' },
    button: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
    target: { minHeight: 44, lineHeight: 44 },
  });
}
