import { puzzleNumber } from '../game';

// jest.config.js pins TZ to Europe/Vienna; a wrong zone must fail loudly, not shift every date case.
test('the test zone is Europe/Vienna', () => {
  expect(new Date(2026, 9, 21).getTimezoneOffset()).toBe(-120);
});

describe('puzzleNumber', () => {
  it('is 1 on the epoch day', () => {
    expect(puzzleNumber(new Date(2026, 7, 25))).toBe(1);
  });
  it('never drops below 1 before the epoch', () => {
    expect(puzzleNumber(new Date(2026, 7, 24))).toBe(1);
  });
  it('is 58 on 2026-10-21 at 10:00', () => {
    expect(puzzleNumber(new Date(2026, 9, 21, 10, 0))).toBe(58);
  });
  it('is still 58 at the last second of 2026-10-21', () => {
    expect(puzzleNumber(new Date(2026, 9, 21, 23, 59, 59))).toBe(58);
  });
  it('is 59 at local midnight on 2026-10-22', () => {
    expect(puzzleNumber(new Date(2026, 9, 22, 0, 0, 0))).toBe(59);
  });
});
