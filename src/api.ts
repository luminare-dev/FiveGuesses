import { API_URL } from './config';
import type { Song } from './game';

// A song from the service: a Song plus the Apple country its id belongs to.
export type Track = Song & { country: string };

export type SourceInfo = { id: string; group: string; label: string };
export type TrackList = { label: string; tracks: Track[] };
export type ImportResult = TrackList & { total: number; unresolved: number };
export type Entry = { artist: string; title: string };

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

export async function getTracks(source: string, n: number, exclude: readonly number[] = []): Promise<TrackList> {
  const params = new URLSearchParams({ source, n: String(n) });
  if (exclude.length > 0) params.set('exclude', exclude.slice(-100).join(','));
  const body = await request<TrackList>(`/api/tracks?${params.toString()}`);
  return { label: body.label, tracks: Array.isArray(body.tracks) ? body.tracks : [] };
}

export function importPlaylist(url: string): Promise<ImportResult> {
  return request<ImportResult>('/api/import', post({ url }), IMPORT_TIMEOUT_MS);
}

export function resolveEntries(entries: readonly Entry[]): Promise<{ tracks: Track[]; unresolved: number }> {
  return request<{ tracks: Track[]; unresolved: number }>('/api/resolve', post({ entries }), IMPORT_TIMEOUT_MS);
}

export async function createRoom(): Promise<string> {
  const body = await request<{ code: string }>('/api/rooms', post(undefined));
  return body.code;
}
