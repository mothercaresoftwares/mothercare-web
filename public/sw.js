// Self-unregistering service worker.
//
// The app has no service worker, but a stale registration from an earlier PWA
// attempt makes the browser request /sw.js on every load (404 in the console).
// This stub unregisters itself and clears any leftover caches.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const registrations = await self.registration
        ? Promise.resolve([self.registration])
        : Promise.resolve([]);
      await Promise.all(registrations.map((r) => r.unregister()));
      if (self.caches) {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((k) => self.caches.delete(k)));
      }
    })(),
  );
});
