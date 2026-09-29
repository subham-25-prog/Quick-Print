// QuickPrint Service Worker - High Performance Offline-First Shell
const CACHE_NAME = 'quickprint-cache-v2';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.debug('Pre-cache warm up notice:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and dev HMR
  if (request.method !== 'GET') return;
  if (url.pathname.includes('/_next/webpack-hmr')) return;

  // Static immutable chunks: Cache-First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API endpoints: Network first, never break live pricing/order updates
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'Offline mode active', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        });
      })
    );
    return;
  }

  // HTML Navigation: Network-First with Stale-While-Revalidate and offline cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QuickPrint - Offline Mode</title>
  <style>
    body { margin: 0; padding: 2rem; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 85vh; text-align: center; }
    .card { max-width: 420px; background: #1e293b; border: 1px solid #334155; border-radius: 1.5rem; padding: 2rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); }
    h1 { font-size: 1.25rem; font-weight: 800; margin: 0.5rem 0; color: #ffffff; }
    p { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; margin: 0 0 1.5rem; }
    .btn { display: inline-flex; align-items: center; justify-content: center; background: #4f46e5; color: #ffffff; padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; text-decoration: none; border: none; cursor: pointer; transition: transform 0.1s ease; }
    .btn:active { transform: scale(0.96); }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px;">⚡</div>
    <h1>You are currently offline</h1>
    <p>Your document selections and drafts are safely stored on this device. Live ordering and printer sync will resume automatically once connected.</p>
    <button class="btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
  <script>
    window.addEventListener('online', function() { window.location.reload(); });
  </script>
</body>
</html>`, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // All other GET requests: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
