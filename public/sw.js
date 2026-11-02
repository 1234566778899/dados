// Modo sin conexion. Sube CACHE si cambia la estrategia.
const CACHE = "tirada-v2";
const ART = [
  "bg-wide", "bg-tall", "logo", "panel", "banner", "coin",
  "btn-red", "btn-red-down", "btn-green", "btn-green-down", "btn-cream", "btn-cream-down",
  "ic-sound", "ic-mute", "ic-history", "ic-trophy", "ic-help",
  "m-wave", "m-jackpot", "m-happy", "m-sad", "m-dizzy", "m-sleep",
  "st-dobles", "st-trio", "st-escalera", "st-pleno", "st-seis", "st-logro",
  "medal-first", "medal-doubles", "medal-triple", "medal-straight", "medal-crown",
  "medal-snake", "medal-streak", "medal-hundred", "medal-clover",
].map((name) => `/art/${name}.webp`);
const SHELL = ["/", "/models/scene.glb", "/models/throws.json", "/models/throws.bin", "/poster.webp", ...ART];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Paginas: red primero para no quedarse en una version vieja.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Archivos de build con hash: inmutables.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Modelos e imagenes: respuesta inmediata y actualizacion en segundo plano.
  if (url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/art/") || url.pathname === "/poster.webp") {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
        if (hit) {
          network.catch(() => {});
          return hit;
        }
        return network;
      }),
    );
  }
});
