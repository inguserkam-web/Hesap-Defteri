// Uygulama dosyalarını önbelleğe alır; internet yokken de açılır.
const ONBELLEK = "hesap-defteri-v2";
const DOSYALAR = ["./", "index.html", "style.css", "app.js", "firebase-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== ONBELLEK).map((x) => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Önce internetten dene, olmazsa önbellekten ver.
  e.respondWith(fetch(e.request).then((r) => {
    const kopya = r.clone();
    caches.open(ONBELLEK).then((c) => c.put(e.request, kopya));
    return r;
  }).catch(() => caches.match(e.request)));
});
