import { API_URL } from './config';
import type { Song } from './game';

// A song from the service: a Song plus the Apple country its id belongs to.
export type Track = Song & { country: string };

export type SourceInfo = { id: string; group: string; label: string };
export type TrackList = { label: string; tracks: Track[] };
export type Entry = { artist: string; title: string };
// A category entry from the song service: an Apple id with the curated names, no preview.
export type PoolEntry = Entry & { id: number; country: string };
export type Pool = { label: string; entries: PoolEntry[] };
// An imported playlist: Apple Music ids (with the link's country) or YouTube or Spotify entries to match.
export type ImportResult =
  | { kind: 'ids'; label: string; country: string; total: number; items: { id: number; title: string }[] }
  | { kind: 'entries'; label: string; total: number; entries: Entry[] };

// code: the service's error code, or 'network' when no answer came.
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const TIMEOUT_MS = 10_000;
const IMPORT_TIMEOUT_MS = 25_000;

async function request<T>(path: string, init: RequestInit = {}, timeout = TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new ApiError('network');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An answer without JSON is treated by its status alone.
  }
  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new ApiError(typeof code === 'string' ? code : 'network');
  }
  return body as T;
}

// text/plain keeps a POST a simple request, so the browser sends no preflight first.
const post = (payload: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

export async function getSources(): Promise<SourceInfo[]> {
  const body = await request<{ sources: SourceInfo[] }>('/api/sources');
  return Array.isArray(body?.sources) ? body.sources : [];
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

// Every entry of a category; the browser looks up the previews itself.
export async function getPool(source: string): Promise<Pool> {
  const body = await request<{ label?: unknown; entries?: unknown }>(`/api/pool?${new URLSearchParams({ source }).toString()}`);
  const raw = body?.entries;
  const entries = (Array.isArray(raw) ? (raw as Partial<PoolEntry>[]) : []).filter(
    (e): e is PoolEntry => isId(e?.id) && isText(e?.artist) && isText(e?.title) && /^[A-Z]{2}$/.test(e?.country ?? '')
  );
  return { label: typeof body?.label === 'string' ? body.label : '', entries };
}

export async function importPlaylist(url: string): Promise<ImportResult> {
  const body = await request<Partial<ImportResult> | null>('/api/import', post({ url }), IMPORT_TIMEOUT_MS);
  const label = typeof body?.label === 'string' ? body.label.slice(0, 60) : '';
  if (body?.kind === 'ids' && /^[A-Z]{2}$/.test(body.country ?? '') && Array.isArray(body.items)) {
    const items = body.items.filter((i) => isId(i?.id)).map((i) => ({ id: i.id, title: typeof i.title === 'string' ? i.title : '' }));
    return { kind: 'ids', label, country: body.country ?? 'US', total: items.length, items };
  }
  if (body?.kind === 'entries' && Array.isArray(body.entries)) {
    const entries = body.entries.filter((e) => isText(e?.artist) && isText(e?.title));
    return { kind: 'entries', label, total: entries.length, entries };
  }
  throw new ApiError('network');
}

export async function createRoom(): Promise<string> {
  const body = await request<{ code: string }>('/api/rooms', post(undefined));
  return body.code;
}
