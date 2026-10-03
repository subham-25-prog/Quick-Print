'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root render failed:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f1f5f9', color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ width: 'min(100% - 2rem, 24rem)', padding: '1.5rem', borderRadius: '1.5rem', background: 'white', textAlign: 'center', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)' }}>
          <h1 style={{ margin: 0, fontSize: '1rem' }}>QuickPrint needs another try</h1>
          <p style={{ margin: '0.75rem 0 0', color: '#475569', fontSize: '0.875rem' }}>Reload the app to continue.</p>
          <button type="button" onClick={reset} style={{ marginTop: '1.25rem', border: 0, borderRadius: '0.75rem', background: '#4f46e5', color: 'white', padding: '0.625rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
