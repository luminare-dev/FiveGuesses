import React, { useMemo, useState } from 'react';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SITE_URL } from '../config';
import { t } from '../i18n';
import { roomPath } from '../route';
import { MAX_ROUNDS, MIN_ROUNDS } from '../rooms/types';
import { shareOutcomeMessage, shareResult } from '../share';
import type { ShareOutcome } from '../share';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

// The link to the room and the share button.
export function RoomShare({ code, announce }: { code: string; announce: (message: string) => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const url = `${SITE_URL}${roomPath(code)}`;
  const share = () => {
    void shareResult(t('rooms.shareText', { url })).then((result) => {
      if (result === 'cancelled') return;
      setOutcome(result);
      announce(shareOutcomeMessage(result));
    });
  };
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{t('rooms.shareLabel')}</Text>
      <View style={styles.urlWell}>
        <Text selectable style={styles.url}>
          {url}
        </Text>
      </View>
      <Button label={t('rooms.share')} onPress={share} />
      {outcome !== null && <Text style={styles.note}>{shareOutcomeMessage(outcome)}</Text>}
    </View>
  );
}

type SettingsProps = {
  rounds: number;
  onRounds: (rounds: number) => void;
  sourceLabel: string;
  onChooseSongs: () => void;
  songsButtonRef: Ref<View>;
  startLabel: string;
  onStart: () => void;
  // The host's browser is loading the songs.
  busy: boolean;
  error: string | null;
};

// The host's choices before a game: the number of rounds, the songs, and Start.
export function RoomSettings({
  rounds,
  onRounds,
  sourceLabel,
  onChooseSongs,
  songsButtonRef,
  startLabel,
  onStart,
  busy,
  error,
}: SettingsProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.block}>
      <View role="group" aria-label={t('rooms.rounds')} style={styles.row}>
        <Text style={styles.label}>{t('rooms.rounds')}</Text>
        <View style={styles.stepper}>
          <Button
            variant="secondary"
            label="−"
            aria-label={t('rooms.fewerRounds')}
            onPress={() => onRounds(Math.max(MIN_ROUNDS, rounds - 1))}
            disabled={rounds <= MIN_ROUNDS}
          />
          <Text aria-live="polite" style={styles.value}>
            {String(rounds)}
          </Text>
          <Button
            variant="secondary"
            label="+"
            aria-label={t('rooms.moreRounds')}
            onPress={() => onRounds(Math.min(MAX_ROUNDS, rounds + 1))}
            disabled={rounds >= MAX_ROUNDS}
          />
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('rooms.songs', { source: sourceLabel })}</Text>
        <Button
          ref={songsButtonRef}
          variant="secondary"
          label={t('rooms.chooseSongs')}
          onPress={onChooseSongs}
          style={styles.push}
        />
      </View>
      <Button label={startLabel} onPress={onStart} disabled={busy} />
      {error !== null && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    // Each block sits in a card of the room screen, so it draws no frame of its own.
    block: { alignSelf: 'stretch', gap: 10 },
    // The room link in a well, so it reads as something to copy.
    urlWell: {
      alignSelf: 'stretch',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      backgroundColor: theme.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
    label: { ...text(15, '600'), color: theme.text, flexShrink: 1 },
    url: { ...text(15), color: theme.text },
    note: { ...text(13, '500'), color: theme.textSecondary },
    error: { ...text(14, '600'), color: theme.partial },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
    value: { ...text(17, '700'), ...tabularNums, color: theme.text, minWidth: 28, textAlign: 'center' },
    push: { marginLeft: 'auto' },
  });
}
