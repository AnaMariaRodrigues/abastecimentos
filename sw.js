/* Service worker: deixa o app abrir sem internet. Lançamentos ficam no aparelho até sincronizar. */
const CACHE = "verbo-abast-v2";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./logo.png", "./icon-192.png", "./icon-512.png", "./instalar.html"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // API do Google e CDNs: direto na rede
  // rede primeiro (pega atualizações), cache se estiver sem internet
  const net = Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("lento")), 4000))]);
  e.respondWith(net.then(res => {
    if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
});
