const CACHE_NAME = 'bandeja-v3';

// Only cache content-hashed static assets — never cache page HTML.
// Page HTML always comes fresh from the server so deploys take effect immediately.
const STATIC = /^\/_next\/static\/|^\/icons\/|^\/fonts\//;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const { pathname } = new URL(event.request.url);

  if (STATIC.test(pathname)) {
    // Static assets: cache-first (content-hashed, safe forever)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Pages and API routes: network-only — always fresh, never stale
  event.respondWith(fetch(event.request));
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'BANDEJA', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'bandeja-notification',
      data: {
        url: data.url ?? '/',
        notification_id: data.notification_id ?? null,
      },
    })
  );
});

// Tap notification → record the tap, then open the app at the right URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data ?? {};
  const url = notifData.url ?? '/';

  if (notifData.notification_id) {
    fetch('/api/push/tap', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notifData.notification_id }),
    }).catch(() => {});
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
