import {
  CACHE_SIZE,
  cached,
  createSession,
  FALLBACK_MS,
  inFallback,
  markFailed,
  remember,
} from '../catalog/suggestLogic';

describe('the fallback window', () => {
  it('lasts a minute after a failure', () => {
    const session = createSession();
    expect(inFallback(session, 0)).toBe(false);
    markFailed(session, 5_000);
    expect(inFallback(session, 5_000 + FALLBACK_MS - 1)).toBe(true);
    expect(inFallback(session, 5_000 + FALLBACK_MS)).toBe(false);
  });
});

describe('the cache', () => {
  it('keeps the 50 most recently used texts', () => {
    const session = createSession();
    for (let i = 0; i < CACHE_SIZE; i++) remember(session, `q${i}`, []);
    expect(cached(session, 'q0')).toEqual([]);
    remember(session, 'new', []);
    expect(session.cache.size).toBe(CACHE_SIZE);
    // q0 was read last, so q1 was the oldest.
    expect(cached(session, 'q1')).toBeUndefined();
    expect(cached(session, 'q0')).toEqual([]);
  });
});
