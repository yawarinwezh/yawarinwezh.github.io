// Offline support: the whole app, fonts and the Quran are stored on the phone after the first visit.
// Raise VERSION whenever any file changes, so phones fetch the new files.
const VERSION = "yn-v6";
const SHELL = [
  "./", "index.html", "admin.html", "manifest.webmanifest", "firebase-config.js",
  "css/app.css", "css/admin.css", "js/app.js", "js/core.js", "js/defaults.js", "js/official-data.js", "js/admin.js",
  "data/quran.json", "data/meta.json",
  "fonts/kfgqpc-hafs.woff2", "fonts/amiri-arabic-400-normal.woff2", "fonts/amiri-arabic-700-normal.woff2",
  "fonts/plex-arabic-400.woff2", "fonts/plex-arabic-500.woff2", "fonts/plex-arabic-600.woff2", "fonts/plex-arabic-700.woff2",
  "fonts/plex-latin-400.woff2", "fonts/plex-latin-700.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if(e.data === "skip") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== "GET") return;
  // Firebase SDK scripts: keep a copy so the app starts offline; data calls always go to the network.
  if(url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")){
    e.respondWith(caches.open(VERSION + "-ext").then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if(r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if(url.origin !== location.origin) return;
  // Settings that may be edited on GitHub: try the network first, fall back to the stored copy offline.
  if(url.pathname.endsWith("/firebase-config.js")){
    e.respondWith(fetch(req).then(r => { if(r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, {ignoreSearch:true})));
    return;
  }
  e.respondWith(caches.match(req, {ignoreSearch:true}).then(hit => hit || fetch(req).then(r => {
    if(r.ok){ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => req.mode === "navigate" ? caches.match("index.html") : undefined)));
});
