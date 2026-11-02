// The room protocol as the client sees it (api/src/rules.mjs is the source of truth).
import type { Track } from '../api';
import type { GuessEntry } from '../game';

export type Phase = 'lobby' | 'playing' | 'reveal' | 'finished';
export type PlayerStatus = 'playing' | 'won' | 'lost' | 'skipped' | 'out' | 'waiting';

export type PlayerView = {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
  sittingOut: boolean;
  total: number;
  status: PlayerStatus | null;
  misses: number;
};

export type RoundResult = {
  id: string;
  status: PlayerStatus;
  seconds: number | null;
  place: number | null;
  points: number;
};

export type GameView = {
  rounds: number;
  label: string;
  round: number;
  previewUrl: string | null;
  revealUntil: number | null;
  answer: Track | null;
  me: { status: PlayerStatus; entries: GuessEntry[]; stage: number } | null;
  results: RoundResult[] | null;
};

export type Standing = { id: string; name: string; total: number; correct: number; rank: number };

export type RoomView = {
  code: string;
  phase: Phase;
  you: string | null;
  hostId: string | null;
  players: PlayerView[];
  game: GameView | null;
  standings: Standing[] | null;
};

// The host's choice: a chart or category (its songs are loaded on Start) or imported songs.
export type RoomSource =
  | { kind: 'category'; id: string; label: string }
  | { kind: 'tracks'; label: string; tracks: Track[] };

export type ClientMessage =
  | { t: 'hello'; token: string; name?: string }
  // The host's browser sends the songs; the room checks every field and never calls Apple.
  | { t: 'start'; rounds: number; label: string; tracks: Track[] }
  | { t: 'guess'; round: number; id: number; artist: string; title: string }
  | { t: 'skip'; round: number }
  | { t: 'sitOut'; on: boolean }
  | { t: 'leave' }
  | { t: 'kick'; player: string }
  | { t: 'skipPlayer'; player: string }
  | { t: 'endRound' }
  | { t: 'endGame' }
  | { t: 'next' };

export type ServerMessage =
  | { t: 'room'; room: RoomView }
  | { t: 'need_name' }
  | { t: 'error'; code: string }
  | { t: 'pong' };

export const DEFAULT_ROUNDS = 10;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 20;
// Songs in one start message (the room's cap).
export const MAX_POOL = 50;
export const DEFAULT_SOURCE: RoomSource = { kind: 'category', id: '80s', label: '1980s' };

// Close codes that end the connection for good.
export const CLOSE_ROOM_CLOSED = 4000;
export const CLOSE_KICKED = 4001;
export const CLOSE_REPLACED = 4002;
export const CLOSE_LEFT = 4003;
export const CLOSE_NOT_FOUND = 4404;
