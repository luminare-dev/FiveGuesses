import { ROLLOVER_HOLD_MS, countdownMs, formatCountdown, msUntilLocalMidnight, nextLocalMidnight } from '../clock';

describe('nextLocalMidnight and msUntilLocalMidnight', () => {
  it('points at the next calendar day at 00:00 local time', () => {
    const next = nextLocalMidnight(new Date(2026, 9, 21, 10, 0, 0));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 9, 22]);
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([0, 0, 0]);
  });
  it('measures a plain day', () => {
    expect(msUntilLocalMidnight(new Date(2026, 9, 21, 10, 0, 0))).toBe(50_400_000);
    expect(msUntilLocalMidnight(new Date(2026, 9, 24, 23, 0, 0))).toBe(3_600_000);
  });
  it('measures the 25-hour day of the October clock change', () => {
    expect(msUntilLocalMidnight(new Date(2026, 9, 25, 0, 30, 0))).toBe(88_200_000);
  });
  it('measures the 23-hour day of the March clock change', () => {
    expect(msUntilLocalMidnight(new Date(2027, 2, 28, 1, 30, 0))).toBe(77_400_000);
  });
  it('is never more than a day plus an hour', () => {
    expect(msUntilLocalMidnight(new Date(2026, 9, 25, 0, 0, 0))).toBe(90_000_000);
    expect(msUntilLocalMidnight(new Date(2026, 9, 21, 23, 59, 59, 999))).toBe(1);
  });
});

describe('formatCountdown', () => {
  it('floors to whole seconds and clamps at zero', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(999)).toBe('00:00:00');
    expect(formatCountdown(-5)).toBe('00:00:00');
    expect(formatCountdown(1000)).toBe('00:00:01');
  });
  it('formats hours, minutes and seconds', () => {
    expect(formatCountdown(3_599_000)).toBe('00:59:59');
    expect(formatCountdown(50_400_000)).toBe('14:00:00');
    expect(formatCountdown(88_200_000)).toBe('24:30:00');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
  });
});

describe('countdownMs', () => {
  it('counts down to the next local midnight during the day', () => {
    expect(countdownMs(new Date(2026, 9, 21, 10, 0, 0))).toBe(50_400_000);
    expect(countdownMs(new Date(2026, 9, 21, 23, 59, 59))).toBe(1000);
  });
  it('stays at zero while the rollover is on its way, so it never shows a whole day early', () => {
    expect(ROLLOVER_HOLD_MS).toBe(2000);
    expect(countdownMs(new Date(2026, 9, 22, 0, 0, 0, 0))).toBe(0);
    expect(countdownMs(new Date(2026, 9, 22, 0, 0, 0, 600))).toBe(0);
    expect(countdownMs(new Date(2026, 9, 22, 0, 0, 1, 999))).toBe(0);
    expect(formatCountdown(countdownMs(new Date(2026, 9, 22, 0, 0, 0, 800)))).toBe('00:00:00');
  });
  it('counts down to the following midnight once the hold is over', () => {
    expect(countdownMs(new Date(2026, 9, 22, 0, 0, 2, 0))).toBe(86_398_000);
    // The first day of winter time is 25 hours long.
    expect(countdownMs(new Date(2026, 9, 25, 0, 0, 2, 0))).toBe(89_998_000);
  });
});
