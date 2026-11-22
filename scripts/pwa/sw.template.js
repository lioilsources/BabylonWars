// Service worker DoggioWars Web (generuje vite.config.ts při buildu).
// Shell a assety předem do cache (offline hra), zvuky až při prvním použití.
// Navigace: síť napřed (nový deploy se projeví hned), offline z cache.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // chatbridge apod. jde mimo cache
  if (req.mode === 'navigate') {
    // no-cache: obejdi HTTP cache prohlížeče (Pages posílá max-age=600)
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put('./', copy));
      return res;
    }).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
    // zvuky a ostatní statiku si zapamatuj (cache-first)
    if (res.ok && res.status === 200 && url.pathname.includes('/assets/')) {
      const copy = res.clone();
      caches.open(RUNTIME).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
