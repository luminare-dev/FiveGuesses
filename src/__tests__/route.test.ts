import { parseRoomCode, parseRoute, roomPath } from '../route';

describe('parseRoute', () => {
  it('opens a room for /r/<code>', () => {
    expect(parseRoute('/r/ABC234')).toEqual({ kind: 'room', code: 'ABC234' });
    expect(parseRoute('/r/abc234/')).toEqual({ kind: 'room', code: 'ABC234' });
  });
  it('is the game for every other path', () => {
    for (const path of ['/', '/r/', '/r/ABC23', '/r/ABC2345', '/r/ABC10Z', '/x/ABC234', '/r/ABC234/x', '/legal/']) {
      expect(parseRoute(path)).toEqual({ kind: 'game' });
    }
  });
  it('builds the path back', () => {
    expect(roomPath('ABC234')).toBe('/r/ABC234');
  });
});

describe('parseRoomCode', () => {
  it('takes a typed code in any case, with spaces around', () => {
    expect(parseRoomCode(' abc234 ')).toBe('ABC234');
    expect(parseRoomCode('ABC 234')).toBe('ABC234');
  });
  it('takes the code out of a pasted room link', () => {
    expect(parseRoomCode('https://fiveguesses.app/r/abc234')).toBe('ABC234');
    expect(parseRoomCode('fiveguesses.app/r/ABC234/?x=1')).toBe('ABC234');
  });
  it('refuses anything else', () => {
    for (const input of ['', 'ABC23', 'ABC2345', 'ABC10Z', 'https://example.com/abcdef', 'https://fiveguesses.app/legal/']) {
      expect(parseRoomCode(input)).toBeNull();
    }
  });
});
