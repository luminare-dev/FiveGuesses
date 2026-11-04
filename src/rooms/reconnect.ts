import {
  CLOSE_KICKED,
  CLOSE_LEFT,
  CLOSE_NOT_FOUND,
  CLOSE_REPLACED,
  CLOSE_ROOM_CLOSED,
} from './types';

export type ClosedReason = 'closed' | 'kicked' | 'replaced' | 'left' | 'not_found';

const STEPS = [1_000, 2_000, 4_000, 8_000];
const LAST_STEP = 10_000;
const JITTER = 500;
export const PING_MS = 25_000;
export const PING = '{"t":"ping"}';

// Wait before reconnect attempt n (1-based): 1, 2, 4, 8, then every 10 s, plus up to 0.5 s.
export function retryDelay(failures: number, rng: () => number = Math.random): number {
  const step = STEPS[failures - 1] ?? LAST_STEP;
  return step + Math.floor(rng() * JITTER);
}

// 10 failures in a row, or 3 before the room ever answered, and the screen says so.
export function givesUp(failures: number, everOpened: boolean): boolean {
  return failures >= (everOpened ? 10 : 3);
}

// The close codes after which the client does not come back by itself.
export function closedReason(code: number): ClosedReason | null {
  switch (code) {
    case CLOSE_ROOM_CLOSED:
      return 'closed';
    case CLOSE_KICKED:
      return 'kicked';
    case CLOSE_REPLACED:
      return 'replaced';
    case CLOSE_LEFT:
      return 'left';
    case CLOSE_NOT_FOUND:
      return 'not_found';
    default:
      return null;
  }
}
