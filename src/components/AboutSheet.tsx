import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LEGAL_PATH, PROJECT_PAGE_URL, SOURCE_URL } from '../config';
import { t, tNodes } from '../i18n';
import { radius } from '../theme';
import type { Theme, ThemePreference } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { ThemeChoice } from './ThemeChoice';

type Props = {
  visible: boolean;
  onClose: () => void;
  openerRef: RefObject<View | null>;
  preference: ThemePreference;
  onPreferenceChange: (preference: ThemePreference) => void;
  // Deletes everything the app stored; the result is announced by the caller.
  onReset: () => void;
};

const TITLE_ID = 'about-title';
const RESET_QUESTION_ID = 'about-reset-question';
const LOCKUP = {
  dark: require('../../assets/brand/luminare-lockup-compact-dark.png') as number,
  light: require('../../assets/brand/luminare-lockup-compact-light.png') as number,
};

// The studio lockup, the previews note, the theme choice, the two links and the data reset
// with an inline confirmation, since the platform alert is a no-op on web.
export function AboutSheet({ visible, onClose, openerRef, preference, onPreferenceChange, onReset }: Props) {
  const { theme, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      openerRef={openerRef}
      title={t('about.title')}
      titleId={TITLE_ID}
      closeLabel={t('about.close')}
    >
      {/* One image node: the wrapper is named, the picture with its own inner <img> is hidden. */}
      <View role="img" aria-label={t('about.lockupAlt')} style={styles.lockup}>
        <Image source={LOCKUP[scheme]} aria-hidden resizeMode="contain" style={styles.lockupImage} />
      </View>
      <Text style={styles.body}>
        {tNodes('about.builtBy', {
          studio: (
            <Text
              role="link"
              href={PROJECT_PAGE_URL}
              hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
              style={styles.inlineLink}
            >
              {t('about.studio')}
            </Text>
          ),
        })}
      </Text>
      <Text style={styles.body}>{t('about.previews')}</Text>
      <ThemeChoice value={preference} onChange={onPreferenceChange} />
      <Text
        role="link"
        href={SOURCE_URL}
        hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
        style={styles.linkRow}
      >
        {t('about.source')}
      </Text>
      <Text role="link" href={LEGAL_PATH} style={styles.linkRow}>
        {t('about.privacy')}
      </Text>
      <ResetControls
        styles={styles}
        onConfirm={() => {
          onReset();
          onClose();
        }}
      />
    </Sheet>
  );
}

// Lives inside the sheet content, so closing the sheet forgets an open confirmation. The
// pressed button is replaced, so focus follows by hand: to Cancel when the question opens, back
// to Reset my data when it is cancelled; opening the sheet moves nothing.
function ResetControls({ styles, onConfirm }: { styles: ReturnType<typeof makeStyles>; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const toggled = useRef(false);
  const resetButton = useRef<View>(null);
  const cancelButton = useRef<View>(null);
  const toggle = (next: boolean) => {
    toggled.current = true;
    setConfirming(next);
  };
  useEffect(() => {
    if (!toggled.current) return;
    (confirming ? cancelButton : resetButton).current?.focus();
  }, [confirming]);

  if (!confirming) {
    return <Button ref={resetButton} variant="secondary" label={t('about.reset')} onPress={() => toggle(true)} />;
  }
  return (
    <View style={styles.resetBox}>
      <Text nativeID={RESET_QUESTION_ID} style={styles.body}>
        {t('about.resetQuestion')}
      </Text>
      <View style={styles.resetButtons}>
        <Button
          label={t('about.resetConfirm')}
          onPress={onConfirm}
          style={styles.half}
          aria-describedby={RESET_QUESTION_ID}
        />
        <Button
          ref={cancelButton}
          variant="secondary"
          label={t('about.resetCancel')}
          onPress={() => toggle(false)}
          style={styles.half}
          aria-describedby={RESET_QUESTION_ID}
        />
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    lockup: { width: 140, height: 46 },
    lockupImage: { width: '100%', height: '100%' },
    body: { ...text(16), color: theme.text },
    inlineLink: { color: theme.link, textDecorationLine: 'underline' },
    linkRow: {
      ...text(16, '600'),
      color: theme.link,
      minHeight: 44,
      lineHeight: 44,
      paddingHorizontal: 4,
      textDecorationLine: 'underline',
    },
    resetBox: {
      gap: 10,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.borderStrong,
    },
    resetButtons: { flexDirection: 'row', gap: 10 },
    half: { flex: 1 },
  });
}
