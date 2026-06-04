// Book My Tech service worker (Task 06 Stage 1).
//
// Hand-rolled rather than @serwist/next: the Next.js PWA guide notes Serwist
// "currently requires webpack configuration", and this app builds with
// Turbopack, so a plugin-based SW would fight the build. This covers Stage 1's
// needs — installability + an offline fallback — without that dependency.
//
// Strategy:
//   - Precache the offline fallback + core icons on install.
//   - Navigations: network-first, falling back to the cached offline page when
//     the network is unavailable (so a dropped signal shows our page, not the
//     browser's dino).
//   - Same-origin static assets (_next/static, icons, images): cache-first.
//   - Everything else (APIs, Supabase, Stripe, cross-origin): pass through to
//     the network untouched — never cache auth/data responses.
//
// Push handling is intentionally absent here; it arrives with Stage 3.

const CACHE = "bmt-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // Navigations → network-first with an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets → cache-first, populating the cache on first hit.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
