// MyMint — offline support. Bump VERSION when you change any app file.
const VERSION = "mm-1.14";
const SHELL = ["./", "index.html", "core.js", "app.js", "jszip.min.js", "jspdf.umd.min.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== "mm-fonts").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.host === "fonts.googleapis.com" || u.host === "fonts.gstatic.com") {
    e.respondWith(caches.open("mm-fonts").then(async c => { const hit = await c.match(e.request); const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit); return hit || net; }));
    return;
  }
  if (u.origin !== location.origin) return;
  // App files: use the network when online (so updates arrive), fall back to the cached copy offline.
  // Always ask the server for the latest copy (bypassing the browser's own cache), so updates arrive straight away.
  const fresh = e.request.mode === "navigate" ? new Request(e.request.url, {cache: "no-cache", credentials: "same-origin"}) : new Request(e.request, {cache: "no-cache"});
  e.respondWith(fetch(fresh).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match("index.html"))));
});
