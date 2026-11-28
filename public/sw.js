/* NORDVEX service worker: makes the screener installable, shows push notifications (also when the app is closed)
   and keeps the page shell available offline. Market data (/api, websocket) is never cached. */
const CACHE = "nvx-shell-v1";
const SHELL = ["/", "/styles.css", "/app.js", "/chart.js", "/sound.js", "/bg.js", "/alerts.js", "/pwa.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* network first, fall back to the cached shell when offline */
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname === "/ws" || u.pathname === "/sw.js") return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("/") : Response.error()))));
});

/* push payload: { title, body, tag, url }  — browsers require every push to show a notification */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "NORDVEX", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "/icons/icon-192.png", data: { url: d.url || "/" }, vibrate: [140, 70, 140]
  }));
});

/* tapping a notification focuses the app and opens that coin */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  const coin = url.searchParams.get("coin");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) {
        return c.focus().then(() => { if (coin) c.postMessage({ type: "open-coin", symbol: coin }); });
      }
    }
    return self.clients.openWindow(url.href);
  }));
});
