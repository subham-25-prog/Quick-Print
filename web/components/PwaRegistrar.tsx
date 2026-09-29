'use client';

import { useEffect, useState } from 'react';

export function PwaRegistrar() {
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

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
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        setJustReconnected(false);
      }, 3500);
    };
    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
      clearTimeout(reconnectTimeout);
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline, { passive: true });
      window.addEventListener('offline', handleOffline, { passive: true });
    }

    return () => {
      clearTimeout(reconnectTimeout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline && !justReconnected) return null;

  return (
    <aside
      aria-label={isOffline ? 'Offline Mode Notice' : 'Reconnected Notice'}
      className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-white shadow-xl backdrop-blur-md animate-fade-in-up gpu-layer text-xs font-semibold select-none ${
        isOffline
          ? 'bg-slate-900/95 border border-amber-500/40 text-amber-100'
          : 'bg-emerald-950/95 border border-emerald-500/40 text-emerald-100'
      }`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          isOffline ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
        }`}
      />
      <span>
        {isOffline
          ? 'Offline Mode — Local draft preserved. Will sync when reconnected.'
          : 'Back Online — Live synchronization restored.'}
      </span>
    </aside>
  );
}

