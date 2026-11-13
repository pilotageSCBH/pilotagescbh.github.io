// Pilotage BTS SCBH · fichiers du site gardés sur l'appareil (ouverture rapide, installation comme une application).
// Les fichiers du site sont servis depuis l'appareil puis vérifiés en arrière-plan : si l'un a changé, la page propose
// « Nouvelle version disponible ». Les données (Supabase) et les fichiers Nuage ne sont jamais gardés ici.
const CACHE = 'pilotage-scbh-site';
const ESSENTIELS = ['./', 'index.html', 'css/app.css', 'js/app.js', 'img/icone.png', 'img/logo.jpg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENTIELS)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let delai = null;
function signaler() {
  clearTimeout(delai);
  delai = setTimeout(async () => { for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'nouvelle-version' }); }, 2000);
}
const marque = (r) => (r && (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length'))) || '';

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.includes('/video/') || r.headers.has('range')) return;
  // seulement les fichiers du site (jamais de données)
  if (r.mode !== 'navigate' && !/\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|webmanifest|json|woff2?|ttf|html)$/i.test(u.pathname)) return;
  if (/^\/(rest|auth|functions|storage)\//.test(u.pathname)) return;
  const page = r.mode === 'navigate';
  const cle = page ? new Request(new URL('./', self.location).href) : r;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const ancien = await cache.match(cle, { ignoreSearch: page });
    const reseau = fetch(r, { cache: 'no-cache' }).then(async (rep) => {
      if (rep.ok && rep.type === 'basic') {
        await cache.put(cle, rep.clone());
        if (ancien && marque(ancien) && marque(rep) && marque(ancien) !== marque(rep)) signaler();
      }
      return rep;
    }).catch(() => null);
    if (ancien) { e.waitUntil(reseau); return ancien; }
    return (await reseau) || new Response('Hors connexion : ce fichier n’a pas encore été ouvert sur cet appareil.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
