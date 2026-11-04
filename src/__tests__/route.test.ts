import { parseRoute, roomPath } from '../route';

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
