// Offline support: always try the network first (so updates show up right away),
// fall back to the last copy when offline. Bump VERSION to drop old caches.
const VERSION = 'ptp-12';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'shared/normalize.js', 'vendor/qrcode.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/token.svg', 'fonts/anton-latin-400-normal.woff2', 'fonts/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-400-normal.woff2',
  'data/shop.json', 'data/baseline.json', 'data/events.json', 'data/rules.json', 'data/meta.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(cache => cache.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
