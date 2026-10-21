import { pickFreePlayIndex } from '../freePlay';

describe('pickFreePlayIndex', () => {
  it('maps the random number onto the ascending list of candidates', () => {
    expect(pickFreePlayIndex(98, new Set([74]), () => 74 / 98)).toBe(73);
    expect(pickFreePlayIndex(98, new Set([74]), () => 0)).toBe(0);
    expect(pickFreePlayIndex(98, new Set([74]), () => 0.9999)).toBe(97);
    expect(pickFreePlayIndex(98, new Set([0]), () => 0)).toBe(1);
  });
  it('never serves an excluded index', () => {
    const excluded = new Set([74, 1, 2]);
    for (let i = 0; i < 1000; i++) {
      const pick = pickFreePlayIndex(98, excluded);
      expect(excluded.has(pick)).toBe(false);
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(98);
      expect(Number.isInteger(pick)).toBe(true);
    }
  });
  it('serves the one song that is left', () => {
    const excluded = new Set(Array.from({ length: 97 }, (_, i) => i + 1));
    expect(pickFreePlayIndex(98, excluded)).toBe(0);
    const butFive = new Set([0, 1, 2, 3, 4, 6, 7, 8, 9]);
    expect(pickFreePlayIndex(10, butFive)).toBe(5);
  });
  it('drops the session history but keeps the daily song out once every song was played', () => {
    const excluded = new Set([0, 1, 2]);
    for (let i = 0; i < 50; i++) {
      expect([1, 2]).toContain(pickFreePlayIndex(3, excluded));
    }
    expect(pickFreePlayIndex(3, new Set([0, 1, 2]), () => 0)).toBe(1);
    expect(pickFreePlayIndex(3, new Set([2, 0, 1]), () => 0)).toBe(0);
  });
  it('returns the only index of a one-song list', () => {
    expect(pickFreePlayIndex(1, new Set([0]))).toBe(0);
    expect(pickFreePlayIndex(1, new Set())).toBe(0);
  });
});
