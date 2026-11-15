// Offline support with as few downloads as possible:
// - page, code and data: network first (updates show up right away), the last copy when offline
// - fonts, icons and the QR library never change: from the cache once fetched (kept across versions)
// Bump VERSION to drop the old page cache. Nothing large is downloaded up front.
const VERSION = 'ptp-17';
const STATIC = 'ptp-static-1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'shared/normalize.js'];
const isStatic = u => /\/(fonts|icons|vendor)\//.test(u.pathname);
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== STATIC).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (isStatic(u)) {
    e.respondWith(caches.open(STATIC).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(cache => cache.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
