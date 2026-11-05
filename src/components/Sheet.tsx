import React, { useCallback, useMemo } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { palette, radius, withAlpha } from '../theme';
import type { Theme } from '../theme';
import { elevation } from '../theme/surface';
import { display, fluid } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  visible: boolean;
  onClose: () => void;
  // The control that opened the sheet; it takes focus back when the sheet closes.
  openerRef: RefObject<View | null>;
  title: string;
  // The id the dialog is named by; unique per sheet.
  titleId: string;
  closeLabel: string;
  children: ReactNode;
};

// Below this width the sheet is a full-width card at the bottom; above it a centred card.
const WIDE = 600;
const CARD_WIDTH = 520;

// A modal dialog named by its heading: the Modal traps focus, closes on Escape and gives focus
// back on unmount; on top of that the opener is focused once the dialog is gone (onDismiss, on
// every close path) so the return does not depend on the restore order. Not earlier: until the
// fade-out ends the focus trap is still active and pulls any focus outside the dialog back to
// its first control, which a screen reader would announce before the opener. The backdrop
// closes by pointer only; keyboard users press Escape or the Close button, which comes last. The
// backdrop is a plain view with a touch responder, not a pressable: a pressable always carries a
// tabindex, and the Modal's focus trap would then wrap Tab and Shift+Tab onto the hidden
// backdrop, where Enter closes the sheet.
export function Sheet({ visible, onClose, openerRef, title, titleId, closeLabel, children }: Props) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE;
  const styles = useMemo(() => makeStyles(theme, wide, height), [theme, wide, height]);

  const focusOpener = useCallback(() => {
    openerRef.current?.focus();
  }, [openerRef]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      onDismiss={focusOpener}
      aria-labelledby={titleId}
    >
      <View style={styles.layer}>
        <ScrollView style={styles.card} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text role="heading" aria-level={2} nativeID={titleId} style={styles.title}>
            {title}
          </Text>
          {children}
          <Button variant="secondary" label={closeLabel} onPress={onClose} style={styles.close} />
        </ScrollView>
        <View aria-hidden onStartShouldSetResponder={() => true} onResponderRelease={onClose} style={styles.backdrop} />
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, wide: boolean, height: number) {
  return StyleSheet.create({
    layer: { flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: withAlpha(palette.night, 0.6),
    },
    card: {
      zIndex: 1,
      flexGrow: 0,
      width: wide ? CARD_WIDTH : '100%',
      maxHeight: Math.round(height * 0.92),
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderBottomLeftRadius: wide ? radius.xl : 0,
      borderBottomRightRadius: wide ? radius.xl : 0,
      ...elevation(theme, true),
    },
    content: { padding: fluid(20, 28), gap: 12 },
    title: { ...display(20, '700'), color: theme.text },
    close: { marginTop: 4 },
  });
}
