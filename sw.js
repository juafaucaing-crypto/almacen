// Service worker: permite abrir la app aunque no haya cobertura.
// La app se sirve desde caché y se actualiza en segundo plano.
const CACHE = "almacen-ute-v2";
const BASE = ["./", "index.html", "css/app.css", "js/config.js", "js/store.js", "js/scanner.js", "js/app.js", "js/vendor/jsQR.js", "js/vendor/qrcode.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "data/seed.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("google.com") || url.hostname.endsWith("googleusercontent.com")) return; // los datos de la nube no se cachean
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const red = fetch(e.request).then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return resp;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
