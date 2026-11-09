/* AMEDSPOR service worker — çevrimdışı sayfa ve statik dosya önbelleği.
 * Kişisel veriler, API yanıtları, oturum ve ödeme sayfaları ASLA önbelleğe alınmaz. */
const VERSION = "amed-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/cevrimdisi";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NEVER_CACHE = [/^\/api\//, /^\/auth\//, /^\/premium/, /^\/admin/, /^\/ayarlar/];

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((r) => r.test(url.pathname))) return;

  // Değişmeyen statik dosyalar: önce önbellek
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
    return;
  }

  // Sayfa gezinmeleri: önce ağ, çevrimdışıysa çevrimdışı sayfası (kişisel sayfalar önbelleğe alınmaz)
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
