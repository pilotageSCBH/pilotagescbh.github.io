// Pilotage BTS SCBH · service de l'application installée.
// Les fichiers du site sont toujours pris sur internet en priorité (version à jour, jamais de mélange d'anciennes et de
// nouvelles versions) ; la copie gardée sur l'appareil ne sert que hors connexion. Les données (Supabase) et les
// fichiers Nuage ne passent jamais par ici.
const CACHE = 'pilotage-scbh-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // anciennes copies (dont celles qui pouvaient mélanger les versions) : supprimées
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => {
  if (e.data?.type === 'vider') e.waitUntil(caches.keys().then((l) => Promise.all(l.map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.includes('/video/') || r.headers.has('range')) return;
  if (r.mode !== 'navigate' && !/\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|webmanifest|json|woff2?|ttf|html)$/i.test(u.pathname)) return;
  if (/^\/(rest|auth|functions|storage)\//.test(u.pathname)) return;
  const cle = r.mode === 'navigate' ? new URL('./', self.location).href : r;
  e.respondWith((async () => {
    try {
      const rep = await fetch(r, { cache: 'no-cache' });
      if (rep.ok && rep.type === 'basic') { const c = await caches.open(CACHE); c.put(cle, rep.clone()).catch(() => {}); }
      return rep;
    } catch {
      const ancien = await (await caches.open(CACHE)).match(cle, { ignoreSearch: r.mode === 'navigate' });
      return ancien || new Response('Hors connexion : ouvrez le site une première fois avec internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
