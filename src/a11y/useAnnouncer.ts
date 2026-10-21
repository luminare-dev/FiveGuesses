import { useCallback, useState } from 'react';

export type Announcer = {
  // The latest message for the polite live region.
  message: string;
  // Grows with every call, so the region can repeat a message whose text did not change.
  nonce: number;
  announce: (message: string) => void;
  // Clears the region if it still shows this message; a newer message stays.
  withdraw: (message: string) => void;
};

// The one entry point for everything the live region says: the round events, the snippet
// notices, the suggestion count and the sheet results all go through announce, and only the
// LiveRegion component renders the text.
export function useAnnouncer(): Announcer {
  const [state, setState] = useState({ message: '', nonce: 0 });
  const announce = useCallback((message: string) => {
    setState((current) => ({ message, nonce: current.nonce + 1 }));
  }, []);
  const withdraw = useCallback((message: string) => {
    setState((current) => (current.message === message ? { message: '', nonce: current.nonce + 1 } : current));
  }, []);
  return { message: state.message, nonce: state.nonce, announce, withdraw };
}
