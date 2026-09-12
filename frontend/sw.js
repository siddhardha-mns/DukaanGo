// Service Worker v20 — Network First + Push Notification support
const CACHE_NAME = 'localcart-v20';

// On install: immediately activate (skip waiting)
self.addEventListener('install', () => {
  self.skipWaiting();
});

// On activate: delete ALL old caches and claim clients immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network FIRST for all requests
// Only cache images for offline use
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isLocal = url.origin === self.location.origin;
  const isImage = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname);

  if (isLocal && isImage) {
    // Cache-first for images only
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network first for everything else (JS, CSS, HTML)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── Push notification handler ──────────────────────────────
// Handles push events sent from the page via reg.showNotification()
// (NotifEngine calls reg.showNotification() directly — no push server needed)
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch (_) { payload = { title: 'DukaanGo', body: e.data.text() }; }
  const title = payload.title || 'DukaanGo';
  const opts = {
    body: payload.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: payload.tag || 'dukaan-notif',
    data: payload.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// ── Notification click handler ─────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing tab if found
      const existing = list.find(c => c.url.includes('owner.html') || c.url.includes('127.0.0.1:5501'));
      if (existing) return existing.focus();
      // Otherwise open a new tab
      return clients.openWindow('http://127.0.0.1:5501/owner.html');
    })
  );
});
