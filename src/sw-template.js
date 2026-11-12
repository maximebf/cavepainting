// Service worker: navigations try the network for up to 4 s, then the cache.
// Everything else is cache-first. The cache is filled by the loading screen, not here.
/* global self, caches, fetch, URL */
const CACHE_NAME = 'cavepainting-v1';
const VERSION = '__VERSION__';
const NAV_TIMEOUT = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function indexUrl() {
  return new URL('index.html', self.registration.scope).href;
}

async function navigate(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const net = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT)),
    ]);
    if (net.ok) return net;
    throw new Error(String(net.status));
  } catch {
    return (await cache.match(indexUrl())) || (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  return hit || fetch(request);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') e.respondWith(navigate(req));
  else if (!req.url.endsWith('/precache.json') && !req.url.endsWith('/sw.js')) e.respondWith(cacheFirst(req));
});

self.VERSION = VERSION;
