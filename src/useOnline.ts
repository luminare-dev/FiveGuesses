import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

function canObserve(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function readOnline(): boolean {
  return canObserve() && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}

// navigator.onLine plus the online and offline window events on web; always true elsewhere.
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    if (!canObserve()) return undefined;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
