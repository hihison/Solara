const CACHE_NAME = 'solara-music-v1';
const urlsToCache = [
  '/index.html',
  '/css/style.css',
  '/css/desktop.css',
  '/css/mobile.css',
  '/js/index.js',
  '/js/i18n.js',
  '/functions/palette.ts',
  '/functions/proxy.ts',
  '/favicon.png',
  '/favicon.svg'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[Service Worker] Cache installation failed:', error);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim all clients immediately
  return self.clients.claim();
});

// Fetch Strategy: Network First, falling back to Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests and proxy requests - always fetch fresh
  if (url.pathname.includes('/proxy') || 
      url.hostname.includes('music.gdstudio.xyz') ||
      url.hostname.includes('kuwo.cn') ||
      url.hostname.includes('joox.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // For app shell resources: Cache First, falling back to Network
  if (urlsToCache.some(cachedUrl => request.url.includes(cachedUrl))) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            console.log('[Service Worker] Cache hit:', request.url);
            return response;
          }
          console.log('[Service Worker] Cache miss, fetching:', request.url);
          return fetch(request).then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            // Clone the response
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
            return response;
          });
        })
        .catch(() => {
          // If both cache and network fail, return a custom offline page
          return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        })
    );
    return;
  }

  // For all other requests: Network First, falling back to Cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Don't cache if not a valid response
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Try to get from cache if network fails
        return caches.match(request).then((response) => {
          if (response) {
            console.log('[Service Worker] Serving from cache:', request.url);
            return response;
          }
          return new Response('Content not available offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
