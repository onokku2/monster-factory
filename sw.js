/* sw.js — アプリシェルをバージョン付きキャッシュにプリキャッシュし、オフライン起動を実現。
 * fetch は cache-first ＋ 取得後にキャッシュ更新。activate で旧キャッシュ削除。 */
const CACHE = "monfac-v4";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/rng.js", "js/config.js", "js/parts.js", "js/names.js", "js/sprite.js",
  "js/stats.js", "js/skills.js", "js/species.js", "js/monster.js", "js/evolution.js",
  "js/stages.js", "js/training.js", "js/battle.js", "js/achievements.js", "js/save.js",
  "js/game.js", "js/ui.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))) // 1個失敗で全体を止めない
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }).catch(() => {
        // ナビゲーションはアプリシェルにフォールバック（オフラインでも起動）
        if (req.mode === "navigate") return caches.match("index.html");
      });
    })
  );
});
