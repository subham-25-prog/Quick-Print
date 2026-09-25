'use client';

import { useEffect, useState } from 'react';

export function PwaRegistrar() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker with zero main-thread interference
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.debug('ServiceWorker notice:', err);
        });
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW, { once: true });
      }
    }

    // 2. Track connection state for instant offline UI feedback
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline, { passive: true });
      window.addEventListener('offline', handleOffline, { passive: true });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <aside
      aria-label="Offline Mode Notice"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white border border-amber-500/40 shadow-xl backdrop-blur-md animate-fade-in-up gpu-layer text-xs font-semibold select-none"
    >
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <span>Offline Mode — Cached data active. Orders will sync when reconnected.</span>
    </aside>
  );
}
