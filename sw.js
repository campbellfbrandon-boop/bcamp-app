// BCAMP Service Worker
// !! Bump CACHE_VERSION every time you deploy an update — this forces
//    all installed PWAs to fetch the new version automatically.

const CACHE_VERSION = 'bcamp-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: cache app shell ──────────────────────────────────────────────
self.addEventListener('install', function(e) {
  // skipWaiting forces the new SW to activate immediately
  // instead of waiting for all tabs to close
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err =>
          console.warn('BCAMP SW: failed to cache', url, err)
        ))
      );
    })
  );
});

// ── Activate: delete ALL old caches immediately ───────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('BCAMP SW: deleting old cache', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      // Take control of all open clients immediately
      return self.clients.claim();
    }).then(function() {
      // Tell all open tabs to reload so they get the new version
      return self.clients.matchAll({ type: 'window' });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      });
    })
  );
});

// ── Fetch: network-first for HTML (always get latest), cache-first for assets
self.addEventListener('fetch', function(e) {
  const url = e.request.url;

  // Never intercept Google Sheets/Script requests
  if (url.includes('script.google.com') || url.includes('googleapis.com')) return;

  // Google Fonts — network first, fall back to cache
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      fetch(e.request)
        .then(function(res) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // index.html — network first so updates are always picked up
  if (url.endsWith('/') || url.includes('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(function(res) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else — cache first, fall back to network
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
