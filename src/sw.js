/* OLI · service worker. Versión de build: __BUILD__
   - Guarda la interfaz (shell) para abrir sin Internet.
   - No intercepta Supabase (API ni tiempo real): los datos viven en IndexedDB y en el servidor.
   - Actualización controlada: no usa skipWaiting solo; la app lo pide cuando no hay una operación en curso. */
const VERSION = "__BUILD__";
const SHELL_CACHE = "oli-shell-" + VERSION, RUNTIME = "oli-runtime-v1";
const SHELL = __SHELL__;
// lo crítico (página, app, estilos, configuración) DEBE quedar guardado; si falla, la versión anterior sigue funcionando sin Internet
const CRITICOS = SHELL.filter(u => /^(index\.html|app\..*\.js|styles\..*\.css|config\.js)$/.test(u));
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL_CACHE).then(c => Promise.all(SHELL.map(u => { const p = c.add(new Request(u, {cache: "reload"})); return CRITICOS.includes(u) ? p : p.catch(() => {}); })))); });
self.addEventListener("activate", e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith("oli-shell-") && k !== SHELL_CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return; const u = new URL(r.url);
  if (/supabase\.(co|in)$/.test(u.hostname)) return;
  if (r.mode === "navigate") { e.respondWith((async () => { const c = await caches.match("index.html", {cacheName: SHELL_CACHE}); if (c) return c;
    try { const n = await fetch(r); if (n.ok) { const k = n.clone(); caches.open(SHELL_CACHE).then(x => x.put("index.html", k)); } return n; } catch (_) { return (await caches.match("index.html")) || Response.error(); } })()); return; }
  if (u.origin === location.origin) { e.respondWith(caches.match(r).then(m => m || fetch(r).then(n => { if (n.ok) { const k = n.clone(); caches.open(SHELL_CACHE).then(x => x.put(r, k)); } return n; }))); return; }
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(u.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => { const m = await c.match(r); const net = fetch(r).then(n => { c.put(r, n.clone()); return n; }).catch(() => m); return m || net; }));
  }
});
