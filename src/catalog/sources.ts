// Where a pool of songs comes from: the iTunes top songs of a country (read by the browser) or a
// curated category (its entries from the song service, the previews looked up by the browser).
import { getPool } from '../api';
import type { SourceInfo, TrackList } from '../api';
import { t } from '../i18n';
import { chartTracks, lookupTracks } from './itunes';
import type { ChartCountry } from './itunes';

export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const CHART_ID = /^chart-(at|de|us|gb)$/;

export function chartCountry(id: string): ChartCountry | null {
  const match = CHART_ID.exec(id);
  return match !== null ? (match[1] as ChartCountry) : null;
}

// The charts the sheet always offers; they need no song service.
export function chartSources(): SourceInfo[] {
  const group = t('sources.chartsGroup');
  return [
    { id: 'chart-at', group, label: t('sources.chart.at') },
    { id: 'chart-de', group, label: t('sources.chart.de') },
    { id: 'chart-us', group, label: t('sources.chart.us') },
    { id: 'chart-gb', group, label: t('sources.chart.gb') },
  ];
}

// Up to n songs with previews from a chart or a category, without the excluded ids. A few more
// entries than asked are looked up, since a song can be gone from Apple.
export async function loadSongs(
  id: string,
  n: number,
  exclude: readonly number[] = [],
  rng: () => number = Math.random
): Promise<TrackList> {
  const skip = new Set(exclude);
  const country = chartCountry(id);
  if (country !== null) {
    const label = chartSources().find((s) => s.id === id)?.label ?? '';
    const tracks = (await chartTracks(country)).filter((track) => !skip.has(track.id));
    return { label, tracks: shuffle(tracks, rng).slice(0, n) };
  }
  const pool = await getPool(id);
  const picked = shuffle(
    pool.entries.filter((e) => !skip.has(e.id)),
    rng
  ).slice(0, n + 5);
  const tracks = await lookupTracks(
    picked.map((e) => ({ id: e.id, country: e.country, seed: { artist: e.artist, title: e.title } }))
  );
  return { label: pool.label, tracks: tracks.slice(0, n) };
}
