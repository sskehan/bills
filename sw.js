// Offline support. Only touches this app's own files and caches (names start
// with "bills-"), so your other apps on the same site are left alone.
const VERSION = 'bills-v1.3.0';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './app.js', './core.js', './crypto.js', './store.js', './ui.js', './dropbox.js', './qrcode.js',
  './icon-192.png', './icon-512.png', './maskable-512.png',
  './ibm-plex-sans-latin-400-normal.woff2', './ibm-plex-sans-latin-500-normal.woff2',
  './ibm-plex-sans-latin-600-normal.woff2', './ibm-plex-sans-latin-700-normal.woff2',
  './ibm-plex-mono-latin-500-normal.woff2', './ibm-plex-mono-latin-600-normal.woff2',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('bills-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show straight away), cached copy when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      return hit || new Response('Offline', { status: 503 });
    }
  })());
});
