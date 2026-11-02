import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '../config';
import { closedReason, givesUp, PING, PING_MS, retryDelay } from './reconnect';
import type { ClosedReason } from './reconnect';
import { forgetToken, seatToken } from './token';
import type { ClientMessage, RoomView, ServerMessage } from './types';

export type Connection = 'connecting' | 'need_name' | 'joined' | 'closed' | 'unreachable';

export type RoomConnection = {
  connection: Connection;
  closed: ClosedReason | null;
  view: RoomView | null;
  // The last error the room sent, with a counter so the same code shows again.
  error: { code: string; nonce: number } | null;
  join: (name: string) => void;
  send: (message: ClientMessage) => boolean;
  leave: () => void;
  retry: () => void;
};

const OPEN = 1;

function parse(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as ServerMessage | null;
    return message !== null && typeof message === 'object' && typeof message.t === 'string' ? message : null;
  } catch {
    return null;
  }
}

// One WebSocket to the room: hello with the tab's seat token on every open, the name once the
// room asks for it, a ping every 25 s, and reconnects with a growing wait until a close code says
// the room is gone for this tab.
export function useRoom(code: string): RoomConnection {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [closed, setClosed] = useState<ClosedReason | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<{ code: string; nonce: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const failures = useRef(0);
  const everOpened = useRef(false);
  const stopped = useRef(false);
  const name = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fail = useCallback((code: string) => {
    setError((current) => ({ code, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const stop = useCallback(
    (reason: ClosedReason) => {
      stopped.current = true;
      if (reason === 'left' || reason === 'kicked') forgetToken(code);
      setClosed(reason);
      setConnection('closed');
    },
    [code]
  );

  useEffect(() => {
    if (stopped.current) return undefined;
    const token = seatToken(code);
    let ws: WebSocket;
    let ping: ReturnType<typeof setInterval> | undefined;
    // An error the room sent just before closing decides, whatever close code follows.
    let final: ClosedReason | null = null;
    const scheduleRetry = () => {
      failures.current += 1;
      if (givesUp(failures.current, everOpened.current)) {
        setConnection('unreachable');
        return;
      }
      setConnection('connecting');
      retryTimer.current = setTimeout(() => setAttempt((n) => n + 1), retryDelay(failures.current));
    };
    try {
      ws = new WebSocket(`${WS_URL}/api/rooms/${code}/ws`);
    } catch {
      scheduleRetry();
      return undefined;
    }
    socket.current = ws;
    const sendRaw = (message: ClientMessage) => {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(message));
    };
    ws.onopen = () => {
      everOpened.current = true;
      failures.current = 0;
      sendRaw({ t: 'hello', token });
      ping = setInterval(() => {
        if (ws.readyState === OPEN) ws.send(PING);
      }, PING_MS);
    };
    ws.onmessage = (event: MessageEvent) => {
      const message = parse(event.data);
      if (message === null) return;
      switch (message.t) {
        case 'room':
          setView(message.room);
          if (message.room.you !== null) setConnection('joined');
          return;
        case 'need_name':
          if (name.current !== null) sendRaw({ t: 'hello', token, name: name.current });
          else setConnection('need_name');
          return;
        case 'error':
          if (message.code === 'kicked') final = 'kicked';
          else if (message.code === 'not_found') final = 'not_found';
          else if (message.code === 'name_taken' || message.code === 'name_invalid') {
            name.current = null;
            setConnection('need_name');
          }
          fail(message.code);
          return;
        default:
          return;
      }
    };
    ws.onclose = (event: CloseEvent) => {
      clearInterval(ping);
      if (socket.current !== ws) return;
      socket.current = null;
      const reason = final ?? closedReason(event.code);
      if (reason !== null) stop(reason);
      else scheduleRetry();
    };
    return () => {
      clearInterval(ping);
      if (socket.current === ws) socket.current = null;
      try {
        ws.close(1000);
      } catch {
        // Already closed.
      }
    };
  }, [code, attempt, fail, stop]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const send = useCallback((message: ClientMessage): boolean => {
    const ws = socket.current;
    if (ws === null || ws.readyState !== OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const join = useCallback(
    (value: string) => {
      name.current = value;
      if (!send({ t: 'hello', token: seatToken(code), name: value })) setConnection('connecting');
    },
    [code, send]
  );

  // The room answers with close 4003; without a connection the seat is given up here.
  const leave = useCallback(() => {
    if (!send({ t: 'leave' })) {
      socket.current?.close(1000);
      socket.current = null;
      stop('left');
    }
  }, [send, stop]);

  const retry = useCallback(() => {
    clearTimeout(retryTimer.current);
    stopped.current = false;
    failures.current = 0;
    setClosed(null);
    setConnection('connecting');
    setAttempt((n) => n + 1);
  }, []);

  return { connection, closed, view, error, join, send, leave, retry };
}
