import { useEffect, useState } from 'react';

/**
 * Track the browser's `navigator.onLine` signal. Not perfectly reliable
 * — it can return `true` while the user's network is actually dead —
 * but it's a useful first-pass signal. The realtime channel state
 * (see `useRealtimeSync`) covers the "lying online" case.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
