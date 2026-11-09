import React, { useMemo, useState } from 'react';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { t } from '../i18n';
import type { RoundMode } from '../round';
import { parseRoomCode, roomPath } from '../route';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { selectedFill, transition } from '../theme/surface';
import { fluid, text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';

type Props = {
  mode: RoundMode;
  // Today's puzzle number, shown on the daily tile.
  puzzle: number;
  onDaily: () => void;
  onFreePlay: () => void;
  onChooseSongs: () => void;
  // Creates a room and opens it; false when the room could not be created.
  onPlayWithFriends: () => Promise<boolean>;
  // The Choose songs tile; focus returns to it when the song sheet closes.
  chooseButtonRef?: Ref<View>;
  // One tile per row with its description (a side column), or two by two, without the
  // descriptions on a narrow phone.
  layout: 'list' | 'grid' | 'compact';
};

type Tile = {
  key: string;
  title: string;
  description: string;
  onPress: () => void;
  current?: boolean;
  disabled?: boolean;
  ref?: Ref<View>;
};

// The game modes, always on screen: today's daily song (the default), a free round, the song
// sheet for categories, charts and playlists, and a room with friends. The tile of the mode in
// play carries aria-current; the others start their mode right away. Each tile is named by its
// title and described by its line of text.
export function ModePicker({
  mode,
  puzzle,
  onDaily,
  onFreePlay,
  onChooseSongs,
  onPlayWithFriends,
  chooseButtonRef,
  layout,
}: Props) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme, layout), [theme, layout]);
  const [creating, setCreating] = useState(false);
  const [roomFailed, setRoomFailed] = useState(false);
  const [code, setCode] = useState('');
  const [codeInvalid, setCodeInvalid] = useState(false);
  const joinByCode = () => {
    const parsed = parseRoomCode(code);
    setCodeInvalid(parsed === null);
    if (parsed !== null && typeof window !== 'undefined') window.location.assign(roomPath(parsed));
  };
  const playWithFriends = () => {
    setCreating(true);
    setRoomFailed(false);
    void onPlayWithFriends().then((ok) => {
      setCreating(false);
      setRoomFailed(!ok);
    });
  };

  const tiles: Tile[] = [
    {
      key: 'daily',
      title: t('modes.daily'),
      description: t('modes.dailyHint', { puzzle }),
      onPress: mode === 'daily' ? () => undefined : onDaily,
      current: mode === 'daily',
    },
    {
      key: 'free',
      title: t('modes.free'),
      description: mode === 'free' ? t('modes.freeNext') : t('modes.freeHint'),
      onPress: onFreePlay,
      current: mode === 'free',
    },
    { key: 'songs', title: t('modes.songs'), description: t('modes.songsHint'), onPress: onChooseSongs, ref: chooseButtonRef },
    {
      key: 'friends',
      title: t('modes.friends'),
      description: t('modes.friendsHint'),
      onPress: playWithFriends,
      disabled: creating,
    },
  ];

  return (
    <View role="navigation" aria-label={t('modes.label')} style={styles.wrap}>
      {layout === 'list' && (
        <Text aria-hidden style={styles.caption}>
          {t('modes.label')}
        </Text>
      )}
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <ModeTile key={tile.key} tile={tile} styles={styles} lift={!reducedMotion} showDescription={layout !== 'compact'} />
        ))}
      </View>
      {roomFailed && <Text style={styles.error}>{t('rooms.createFailed')}</Text>}
      <View style={styles.joinRow}>
        <TextInput
          aria-label={t('rooms.codeLabel')}
          aria-invalid={codeInvalid}
          placeholder={t('rooms.codeLabel')}
          placeholderTextColor={theme.textMuted}
          value={code}
          onChangeText={(value) => {
            setCode(value);
            setCodeInvalid(false);
          }}
          onSubmitEditing={joinByCode}
          maxLength={80}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          enterKeyHint="go"
          style={styles.codeInput}
        />
        <Button variant="secondary" label={t('rooms.joinByCode')} onPress={joinByCode} disabled={code.trim() === ''} />
      </View>
      {codeInvalid && <Text role="alert" style={styles.error}>{t('rooms.codeInvalid')}</Text>}
    </View>
  );
}

function ModeTile({
  tile,
  styles,
  lift,
  showDescription,
}: {
  tile: Tile;
  styles: ReturnType<typeof makeStyles>;
  lift: boolean;
  showDescription: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const descriptionId = `mode-${tile.key}-hint`;
  return (
    <Pressable
      ref={tile.ref}
      role="button"
      aria-label={tile.title}
      aria-describedby={showDescription ? descriptionId : undefined}
      aria-current={tile.current === true ? true : undefined}
      disabled={tile.disabled}
      onPress={tile.onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.tile,
        tile.current === true && styles.tileCurrent,
        hovered && !pressed && tile.current !== true && styles.tileHover,
        hovered && !pressed && lift && styles.tileLift,
        pressed && styles.tilePressed,
        tile.disabled === true && styles.disabled,
      ]}
    >
      <View style={styles.titleRow}>
        <View aria-hidden style={[styles.dot, tile.current === true && styles.dotCurrent]} />
        <Text style={styles.title}>{tile.title}</Text>
      </View>
      {showDescription && (
        <Text nativeID={descriptionId} style={styles.description}>
          {tile.description}
        </Text>
      )}
    </Pressable>
  );
}

function makeStyles(theme: Theme, layout: Props['layout']) {
  const list = layout === 'list';
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 10 },
    caption: {
      ...text(13, '600'),
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      paddingHorizontal: 4,
    },
    // The side column's tiles stretch to its full width; the grid wraps two by two.
    tiles: list
      ? { flexDirection: 'column', alignItems: 'stretch', gap: fluid(8, 12) }
      : { flexDirection: 'row', flexWrap: 'wrap', gap: fluid(8, 12) },
    tile: {
      // Two by two in one column, one per row in the side column.
      flexGrow: 1,
      flexBasis: list ? 'auto' : '40%',
      minHeight: 44,
      minWidth: 0,
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: fluid(12, 16),
      paddingVertical: layout === 'compact' ? 10 : fluid(12, 14),
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      backgroundColor: theme.surface,
      ...transition(),
    },
    // The chosen tile: an outline in the active colour (3:1 on the surface) and a faint tint.
    tileCurrent: { borderColor: theme.activeRow, backgroundColor: selectedFill(theme) },
    tileHover: { borderColor: theme.borderStrong },
    tileLift: { transform: [{ translateY: -1 }] },
    tilePressed: { backgroundColor: theme.surfaceHover },
    disabled: { opacity: 0.45 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.borderStrong },
    dotCurrent: { backgroundColor: theme.activeRow },
    title: { ...text(layout === 'compact' ? 14 : 15, '700'), color: theme.text, flexShrink: 1 },
    description: { ...text(13, '500'), color: theme.textSecondary },
    error: { ...text(14, '600'), color: theme.partial },
    joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    codeInput: {
      ...text(16),
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
  });
}
