import { closedReason, givesUp, retryDelay } from '../rooms/reconnect';
import { forgetToken, isToken, newToken, seatToken, tokenKey } from '../rooms/token';

describe('reconnect', () => {
  it('waits 1, 2, 4, 8 and then 10 seconds, plus up to half a second', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => retryDelay(n, () => 0))).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
    expect(retryDelay(1, () => 0.999)).toBe(1499);
  });
  it('gives up after 10 failures, or 3 before the first answer', () => {
    expect(givesUp(9, true)).toBe(false);
    expect(givesUp(10, true)).toBe(true);
    expect(givesUp(2, false)).toBe(false);
    expect(givesUp(3, false)).toBe(true);
  });
  it('stops for the room close codes only', () => {
    expect([4000, 4001, 4002, 4003, 4404].map(closedReason)).toEqual(['closed', 'kicked', 'replaced', 'left', 'not_found']);
    expect(closedReason(1006)).toBeNull();
    expect(closedReason(1000)).toBeNull();
    expect(closedReason(4400)).toBeNull();
  });
});

describe('the seat token', () => {
  it('is 22 base64url characters', () => {
    const token = newToken();
    expect(isToken(token)).toBe(true);
    expect(newToken()).not.toBe(token);
  });
  it('stays the same for a room until it is forgotten', () => {
    const first = seatToken('ABC234');
    expect(seatToken('ABC234')).toBe(first);
    expect(seatToken('XYZ789')).not.toBe(first);
    forgetToken('ABC234');
    expect(seatToken('ABC234')).not.toBe(first);
  });
  it('is kept under fg:room:<code>', () => {
    expect(tokenKey('ABC234')).toBe('fg:room:ABC234');
  });
});
