// BCAMP Service Worker
// Cache-first strategy for app shell, network-first for sync requests

const CACHE_NAME = 'bcamp-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap'
];

// Install — cache the app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('BCAMP: caching app shell');
      // Cache what we can — font CDN may fail in some environments, that's OK
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(err => {
          console.warn('BCAMP: failed to cache', url, err);
        }))
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('BCAMP: deleting old cache', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — cache first for app shell, network only for Google Sheets sync
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Never intercept Google Sheets/Script requests — let them go straight to network
  if (url.includes('script.google.com') || url.includes('sheets.googleapis.com')) {
    return;
  }

  // For Google Fonts — network first, fall back to cache
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(function() {
          return caches.match(event.request);
        })
    );
    return;
  }

  // App shell — cache first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Background sync — retry failed Sheets syncs when connection restores
self.addEventListener('sync', function(event) {
  if (event.tag === 'bcamp-sheets-sync') {
    console.log('BCAMP: background sync triggered');
  }
});
