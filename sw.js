// Bump this version whenever a static asset changes; old caches are removed on activation.
const CACHE = 'quad-tacos-polish-v30-c0dd77e';
const STATIC = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/sim/layout.js",
  "./src/data/upgrades.js",
  "./src/game/achievements.js",
  "./src/game/bigRush.js",
  "./src/game/challenges.js",
  "./src/game/config.js",
  "./src/game/createGame.js",
  "./src/game/crew.js",
  "./src/game/day.js",
  "./src/game/deck.js",
  "./src/game/difficulty.js",
  "./src/game/economy.js",
  "./src/game/events.js",
  "./src/game/hacks.js",
  "./src/game/index.js",
  "./src/game/manager.js",
  "./src/game/managerMath.js",
  "./src/game/onboard.js",
  "./src/game/outpost.js",
  "./src/game/pacing.js",
  "./src/game/pipeline.js",
  "./src/game/quadFlow.js",
  "./src/game/quadGround.js",
  "./assets/art/iso/iso-cust-walk-toward.png",
  "./assets/art/iso/iso-cust-walk-away.png",
  "./assets/art/iso/iso-crew-work.png",
  "./assets/art/iso/plaza-props-chatgpt.png",
  "./src/game/rng.js",
  "./src/game/season.js",
  "./src/game/signatures.js",
  "./src/game/story.js",
  "./src/game/text.js",
  "./src/game/tuning.js",
  "./src/game/upgrades.js",
  "./src/game/util.js",
  "./src/game/view.js",
  "./src/game/west.js",
  "./src/quad/motion.js",
  "./assets/art/iso/iso-crew-walk.png",
  "./assets/art/crew-anim-chatgpt.png",
  "./assets/art/iso/iso-rig.png",
  "./assets/art/iso/iso-ground.png",
  "./assets/art/iso/iso-prop-picnic.png",
  "./assets/art/iso/iso-lamp.png",
  "./src/quad/art.js",
  "./src/quad/main.js",
  "./src/quad/scene.js",
  "./src/quad/style.css",
  "./assets/art/iso/iso-crew-idle.png",
  "./assets/art/iso/iso-crew-carry.png",
  "./assets/art/iso/iso-customers.png",
  "./assets/art/iso/iso-customers-pay.png",
  "./assets/art/iso/iso-stand-counter.png",
  "./assets/art/iso/iso-prop-grill.png",
  "./assets/art/iso/iso-goods.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];
// The title uses the live scene; no pending title art is fetched or precached.
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('quad-tacos-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Network first prevents an installed shell from hiding gameplay fixes.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !url.pathname.endsWith('/sw.js')) {
      const clone = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, clone)));
    }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
