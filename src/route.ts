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

const CODE = /^[A-Za-z2-9]{6}$/;
const CODE_IN_LINK = /\/r\/([A-Za-z2-9]{6})\/?(?:[?#].*)?$/;

// A typed room code or a pasted room link -> the code, or null.
export function parseRoomCode(input: string): string | null {
  const text = input.trim().replace(/[\s-]/g, '');
  if (CODE.test(text)) return text.toUpperCase();
  const match = CODE_IN_LINK.exec(text);
  return match ? match[1].toUpperCase() : null;
}
