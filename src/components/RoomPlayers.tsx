import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import type { PlayerView } from '../rooms/types';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { tabularNums, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  players: PlayerView[];
  you: string | null;
  // The host gets Skip turn (during a round) and Remove beside every other player.
  isHost: boolean;
  playing: boolean;
  // The host has not moved for a minute: everyone gets Skip turn beside the host.
  hostIdle: boolean;
  onSkipPlayer: (id: string) => void;
  onKick: (id: string) => void;
};

export function playerStatus(player: PlayerView): string {
  switch (player.status) {
    case 'playing':
      return player.misses === 0
        ? t('rooms.status.playing')
        : player.misses === 1
          ? t('rooms.status.playingOneMiss')
          : t('rooms.status.playingMisses', { misses: player.misses });
    case 'won':
      return t('rooms.status.won');
    case 'lost':
      return t('rooms.status.lost');
    case 'skipped':
      return player.host ? t('rooms.status.skippedIdle') : t('rooms.status.skipped');
    case 'out':
      return t('rooms.status.out');
    case 'waiting':
      return t('rooms.status.waiting');
    case null:
      return player.sittingOut ? t('rooms.status.out') : t('rooms.status.ready');
  }
}

// Everyone in the room in join order, with the host badge, the connection, the round status,
// the misses and the points.
export function RoomPlayers({ players, you, isHost, playing, hostIdle, onSkipPlayer, onKick }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View role="list" aria-label={t('rooms.players')} style={styles.list}>
      {players.map((player) => {
        const self = player.id === you;
        const tags = [
          player.host ? t('rooms.hostBadge') : null,
          self ? t('rooms.youBadge') : null,
          player.connected ? null : t('rooms.away'),
        ].filter((tag): tag is string => tag !== null);
        const skippable = !self && playing && player.status === 'playing' && (isHost || (hostIdle && player.host));
        return (
          <View key={player.id} role="listitem" style={[styles.row, self && styles.rowSelf]}>
            <View style={styles.info}>
              <Text style={styles.name}>
                {player.name}
                {tags.length > 0 && <Text style={styles.tags}>{` · ${tags.join(' · ')}`}</Text>}
              </Text>
              <Text style={styles.detail}>
                {`${playerStatus(player)} · ${t('rooms.points', { points: player.total })}`}
              </Text>
            </View>
            {!self && (isHost || skippable) && (
              <View style={styles.actions}>
                {skippable && (
                  <Button
                    variant="secondary"
                    label={t('rooms.skipTurn')}
                    aria-label={t('rooms.skipTurnFor', { name: player.name })}
                    onPress={() => onSkipPlayer(player.id)}
                  />
                )}
                {isHost && (
                  <Button
                    variant="secondary"
                    label={t('rooms.remove')}
                    aria-label={t('rooms.removePlayer', { name: player.name })}
                    onPress={() => onKick(player.id)}
                  />
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { gap: 8, alignSelf: 'stretch' },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      minHeight: 52,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    rowSelf: { borderColor: theme.borderStrong },
    info: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: 2 },
    name: { ...text(15, '700'), color: theme.text },
    tags: { ...text(13, '500'), color: theme.textSecondary },
    detail: { ...text(13, '500'), ...tabularNums, color: theme.textSecondary },
    actions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  });
}
