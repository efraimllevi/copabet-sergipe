/* COPABET PWA: cache exclusivo de recursos públicos de instalação.
   Não armazenar HTML, Firebase, APIs, bilhetes, sessões ou pagamentos. */
const CACHE_NAME = "copabet-public-assets-v1";
const PUBLIC_ASSETS = [
  "/manifest.webmanifest",
  "/assets/copabet-icon-180.png",
  "/assets/copabet-icon-192.png",
  "/assets/copabet-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PUBLIC_ASSETS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith("copabet-public-assets-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !PUBLIC_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
