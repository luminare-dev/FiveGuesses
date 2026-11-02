import React, { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, getSources, importPlaylist, resolveEntries } from '../api';
import type { Entry, SourceInfo, Track } from '../api';
import { parseCsv, parsePasted, sampleEntries } from '../catalog/importText';
import { t } from '../i18n';
import { radius } from '../theme';
import type { Theme } from '../theme';
import { text } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import type { SourceChoice } from '../useGame';
import { Button } from './Button';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  openerRef: RefObject<View | null>;
  // Free play offers the built-in songs as well; a room plays categories and imports only.
  mode: 'free' | 'room';
  onChoose: (choice: SourceChoice) => void;
};

const TITLE_ID = 'sources-title';
const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms';
const CSV_MAX_BYTES = 2 * 1024 * 1024;

type Lists = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; sources: SourceInfo[] };
type Work =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'failed'; message: string }
  | { state: 'found'; label: string; tracks: Track[] };

// The lists change with a deploy only, so one answer per page load is enough.
let loaded: SourceInfo[] | null = null;

function importError(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'network';
  switch (code) {
    case 'playlist_unsupported':
    case 'bad_request':
      return t('sources.error.unsupported');
    case 'playlist_not_found':
      return t('sources.error.notFound');
    case 'youtube_unavailable':
      return t('sources.error.youtube');
    case 'apple_unavailable':
      return t('sources.error.apple');
    default:
      return t('sources.error.network');
  }
}

function groupsOf(sources: readonly SourceInfo[]): { group: string; items: SourceInfo[] }[] {
  const groups: { group: string; items: SourceInfo[] }[] = [];
  for (const source of sources) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.group === source.group) last.items.push(source);
    else groups.push({ group: source.group, items: [source] });
  }
  return groups;
}

// Picks where the songs come from: the built-in list, a category or chart, or an import (a
// YouTube or Apple Music playlist link, a pasted list, a CSV file). The lists are fetched when
// the sheet opens; imports are matched to Apple previews by the service, at most 30 songs.
export function SourceSheet({ visible, onClose, openerRef, mode, onChoose }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [lists, setLists] = useState<Lists>(loaded !== null ? { state: 'ready', sources: loaded } : { state: 'loading' });
  const [work, setWork] = useState<Work>({ state: 'idle' });
  const [link, setLink] = useState('');
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    setWork({ state: 'idle' });
    if (loaded !== null) {
      setLists({ state: 'ready', sources: loaded });
      return undefined;
    }
    let cancelled = false;
    setLists({ state: 'loading' });
    getSources()
      .then((sources) => {
        if (sources.length > 0) loaded = sources;
        if (!cancelled) setLists(sources.length > 0 ? { state: 'ready', sources } : { state: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setLists({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const choose = (choice: SourceChoice) => {
    onChoose(choice);
    onClose();
  };

  const busy = work.state === 'busy';

  const resolveList = (entries: Entry[], label: string) => {
    if (entries.length === 0) {
      setWork({ state: 'failed', message: t('sources.error.emptyList') });
      return;
    }
    setWork({ state: 'busy' });
    resolveEntries(sampleEntries(entries))
      .then(({ tracks }) =>
        setWork(
          tracks.length > 0
            ? { state: 'found', label, tracks }
            : { state: 'failed', message: t('sources.error.noMatches') }
        )
      )
      .catch((error: unknown) => setWork({ state: 'failed', message: importError(error) }));
  };

  const importLink = () => {
    const url = link.trim();
    if (url === '') return;
    setWork({ state: 'busy' });
    importPlaylist(url)
      .then((result) =>
        setWork(
          result.tracks.length > 0
            ? { state: 'found', label: result.label.slice(0, 60) || t('sources.importedLabel'), tracks: result.tracks }
            : { state: 'failed', message: t('sources.error.noMatches') }
        )
      )
      .catch((error: unknown) => setWork({ state: 'failed', message: importError(error) }));
  };

  // Web only: a file input made for this press, so the browser opens its picker.
  const chooseCsv = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file === undefined) return;
      if (file.size > CSV_MAX_BYTES) {
        setWork({ state: 'failed', message: t('sources.error.fileTooBig') });
        return;
      }
      const label = file.name.replace(/\.csv$/i, '').slice(0, 60) || t('sources.importedLabel');
      file
        .text()
        .then((content) => resolveList(parseCsv(content), label))
        .catch(() => setWork({ state: 'failed', message: t('sources.error.fileUnreadable') }));
    };
    input.click();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      openerRef={openerRef}
      title={t('sources.title')}
      titleId={TITLE_ID}
      closeLabel={t('sources.close')}
    >
      {mode === 'free' && (
        <Button variant="secondary" label={t('sources.builtin')} onPress={() => choose({ kind: 'builtin' })} />
      )}
      {lists.state === 'loading' && <Text style={styles.note}>{t('sources.listsLoading')}</Text>}
      {lists.state === 'failed' && <Text style={styles.note}>{t('sources.listsFailed')}</Text>}
      {lists.state === 'ready' &&
        groupsOf(lists.sources).map(({ group, items }) => (
          <View key={group} style={styles.group}>
            <Text role="heading" aria-level={3} style={styles.groupTitle}>
              {group}
            </Text>
            <View style={styles.buttons}>
              {items.map((source) => (
                <Button
                  key={source.id}
                  variant="secondary"
                  label={source.label}
                  onPress={() => choose({ kind: 'category', id: source.id, label: source.label })}
                  style={styles.sourceButton}
                />
              ))}
            </View>
          </View>
        ))}

      <View style={styles.group}>
        <Text role="heading" aria-level={3} style={styles.groupTitle}>
          {t('sources.importTitle')}
        </Text>
        <TextInput
          aria-label={t('sources.linkLabel')}
          placeholder={t('sources.linkPlaceholder')}
          placeholderTextColor={theme.textMuted}
          value={link}
          onChangeText={setLink}
          onSubmitEditing={importLink}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          style={styles.input}
        />
        <Button label={t('sources.import')} onPress={importLink} disabled={busy || link.trim() === ''} />
        <TextInput
          aria-label={t('sources.pasteLabel')}
          placeholder={t('sources.pastePlaceholder')}
          placeholderTextColor={theme.textMuted}
          value={pasted}
          onChangeText={setPasted}
          multiline
          numberOfLines={4}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.textarea]}
        />
        <Button
          variant="secondary"
          label={t('sources.useList')}
          onPress={() => resolveList(parsePasted(pasted), t('sources.pastedLabel'))}
          disabled={busy || pasted.trim() === ''}
        />
        {Platform.OS === 'web' && (
          <Button variant="secondary" label={t('sources.chooseCsv')} onPress={chooseCsv} disabled={busy} />
        )}
        <Text aria-live="polite" style={styles.result}>
          {work.state === 'busy'
            ? t('sources.working')
            : work.state === 'failed'
              ? work.message
              : work.state === 'found'
                ? work.tracks.length === 1
                  ? t('sources.foundOne')
                  : t('sources.found', { count: work.tracks.length })
                : ''}
        </Text>
        {work.state === 'found' && (
          <Button
            label={t('sources.useFound')}
            onPress={() => choose({ kind: 'tracks', label: work.label, tracks: work.tracks })}
          />
        )}
        <Text style={styles.note}>
          {t('sources.youtubeNote')}{' '}
          <Text
            role="link"
            href={YOUTUBE_TERMS}
            hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer' }}
            style={styles.link}
          >
            {t('sources.youtubeTerms')}
          </Text>
        </Text>
      </View>
    </Sheet>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    group: { gap: 8 },
    groupTitle: { ...text(15, '700'), color: theme.text, marginTop: 4 },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sourceButton: { flexGrow: 1, flexBasis: 130 },
    note: { ...text(13, '500'), color: theme.textSecondary },
    result: { ...text(14, '600'), color: theme.text, minHeight: 20 },
    link: { color: theme.link, textDecorationLine: 'underline' },
    input: {
      ...text(16),
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      borderRadius: radius.md,
      backgroundColor: theme.surface,
      color: theme.text,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    textarea: { minHeight: 96, textAlignVertical: 'top' },
  });
}
