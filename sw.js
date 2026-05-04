// BCAMP Service Worker v10
// Network-first for HTML so updates always land immediately.
// Bump CACHE_VERSION on every deploy to bust old caches.

const CACHE_VERSION = 'bcamp-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', function(e) {
  self.skipWaiting(); // activate immediately, don't wait for old tabs to close
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return Promise.allSettled(ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('SW cache miss:', url, err))
      ));
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      );
    }).then(function() {
      return self.clients.claim(); // take control of all open tabs immediately
    }).then(function() {
      // Tell every open tab to reload so it gets the new version right now
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        // Force reload on the client
        client.navigate(client.url);
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  const url = e.request.url;

  // Never intercept Google API calls
  if (url.includes('script.google.com') || url.includes('googleapis.com')) return;

  // Fonts — network first, cache fallback
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML (index.html / root) — ALWAYS network first so updates land immediately
  if (e.request.mode === 'navigate' ||
      url.endsWith('/') ||
      url.includes('index.html')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
