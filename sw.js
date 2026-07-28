/* SMSBlast service worker — makes the app open with no internet.

   Strategy: cache-first for the app shell.
   The whole app is one HTML file, so once it's cached the phone never needs
   the network again. We still try the network in the background to pick up
   new versions, but a failed fetch never blocks the user.
*/

const CACHE = "smsblast-v1";

/* Relative paths so this works whether the site lives at /sms/ or at the root. */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any one file 404s, so add individually.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle same-origin GETs. Never touch sms: or https://wa.me links.
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      // Refresh the cache in the background when we can reach the network.
      const fresh = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);

      // Cached copy wins immediately; otherwise wait for the network.
      return hit || fresh.then(res => res || caches.match("./index.html"));
    })
  );
});
