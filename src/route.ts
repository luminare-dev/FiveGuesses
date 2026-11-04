export type Route = { kind: 'game' } | { kind: 'room'; code: string };

const ROOM_PATH = /^\/r\/([A-Za-z2-9]{6})\/?$/;

// /r/<CODE> opens a room; every other path is the game.
export function parseRoute(pathname: string): Route {
  const match = ROOM_PATH.exec(pathname);
  return match ? { kind: 'room', code: match[1].toUpperCase() } : { kind: 'game' };
}

export function roomPath(code: string): string {
  return `/r/${code}`;
}
