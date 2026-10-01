const CACHE_NAME = "back-to-the-cave-video-beam-visible-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css?v=webxr-pano-v3",
  "./src/main.js?v=standing-173-v1",
  "./assets/actions/person-01-actions.png",
  "./assets/actions/person-02-actions.png",
  "./assets/actions/person-03-actions.png",
  "./assets/actions/person-04-actions.png",
  "./assets/actions/person-05-actions.png",
  "./assets/actions/person-06-actions.png",
  "./assets/actions/person-07-actions.png",
  "./assets/actions/person-08-actions.png",
  "./src/flashlight-node.js?v=diamond-beam-v7",
  "./src/photo-reveal-game.js?v=recording-roll-lock-v1",
  "./src/game-ui.js?v=recording-roll-lock-v1",
  "./src/webxr.js?v=quest3-controller-v21",
  "./vendor/three.module.js",
  "./icons/cave-icon.svg",
  "./assets/fonts/jersey-10.ttf",
  "./assets/fonts/vt323.ttf",
  "./assets/levels/level-01-lost-wallet.png",
  "./assets/levels/level-02-store-dispute.png",
  "./assets/levels/level-03-parking-load.png",
  "./assets/levels/level-04-cropped-incident.png",
  "./assets/person-01-base.png",
  "./assets/person-01-reaction.png",
  "./assets/person-02-base.png",
  "./assets/person-02-reaction.png",
  "./assets/person-03-base.png",
  "./assets/person-03-reaction.png",
  "./assets/person-04-base.png",
  "./assets/person-04-reaction.png",
  "./assets/person-05-base.png",
  "./assets/person-05-reaction.png",
  "./assets/person-06-base.png",
  "./assets/person-06-reaction.png",
  "./assets/person-07-base.png",
  "./assets/person-07-reaction.png",
  "./assets/person-08-base.png",
  "./assets/person-08-reaction.png",
  "./assets/levels/level-01-placeholder.jpg",
  "./assets/levels/level-02-placeholder.jpg",
  "./assets/levels/level-03-placeholder.jpg",
  "./assets/levels/level-04-placeholder.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const networkFirst = event.request.mode === "navigate"
    || ["document", "script", "style", "worker"].includes(event.request.destination);
  if (networkFirst) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request)),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
