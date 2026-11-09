// Service worker: saves the app's files so it opens without internet.
// Online it always loads fresh files; offline it uses the last saved copy.
const VERSION = 'v1';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'rates.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle our own files; exchange-rate requests go straight to the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first (so updates show up right away), saved copy when offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
