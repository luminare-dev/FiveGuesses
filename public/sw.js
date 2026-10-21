/* FiveGuesses service worker: caches the app shell for offline starts. Never caches cross-origin
   responses (the song previews and artwork are streamed from Apple and must not be stored). */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const CACHE_NAME = 'fg-shell-' + BUILD_ID;

// A name with a content hash (the bundle, the two stylesheets, the images under /assets/) never
// changes its bytes, so the copy the page has just put in the browser's HTTP cache is taken as it
// is. Every other shell file is revalidated ('no-cache'), so a new worker stores the shell that is
// on the server now, not a copy the browser kept from an earlier visit, and an unchanged file
// costs only a 304.
const HASHED_NAME = /[.-][0-9a-f]{32}\.[a-z0-9]+$/;

function precacheRequest(path) {
  return new Request(path, { cache: HASHED_NAME.test(path) ? 'default' : 'no-cache' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map(precacheRequest)))
      .then(() => self.skipWaiting())
  );
});

// Answers only from this build's cache, so an older cache that is not deleted yet never answers.
function fromShellCache(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(request));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fg-shell-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // browser default; nothing cross-origin is ever cached
  if (request.mode === 'navigate') {
    const shell = url.pathname.startsWith('/legal') ? '/legal/index.html' : '/index.html';
    event.respondWith(fetch(request).catch(() => fromShellCache(shell)));   // network first, cached page as the offline fallback
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(fromShellCache(request).then((hit) => hit || fetch(request)));   // cache first for the shell files
    return;
  }
  // Everything else (same-origin, not precached): network, no caching.
});
