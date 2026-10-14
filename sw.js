/*
 * Service worker: caches the whole app so it works offline.
 *
 * When you change any file and redeploy, bump VERSION below
 * (e.g. "v1" -> "v2"). That tells phones to download the new files.
 */
const VERSION = "v1";
const CACHE = "tens-" + VERSION;

// Paths are relative to this file, so it works in a subfolder (GitHub Pages).
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/game.js",
  "js/app.js",
  "fonts/bricolage-grotesque.woff2",
  "fonts/dm-mono-400.woff2",
  "fonts/dm-mono-500.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tens-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (instant + offline), falling back to the network.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === "navigate" ? caches.match("index.html") : Response.error()));
    })
  );
});
