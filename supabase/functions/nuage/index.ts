// =====================================================================================================
// PILOTAGE BTS SCBH  ·  relais « nuage » (fonction Supabase / Edge Function)
// Permet au site de lire VOS dossiers Nuage (apps.education.fr) à partir du lien de partage collé dans
// « ⚙ Réglages Nuage » : liste des dossiers et fichiers, et lecture d'un fichier (pour le sommaire et la couverture).
// Un navigateur n'a pas le droit de lire Nuage directement : ce relais le fait côté serveur.
// Lecture seule : le relais ne peut rien modifier, ni rien lire d'autre que les dossiers partagés par lien.
// Seuls les comptes connectés au site peuvent l'utiliser.
//
// Installation (une seule fois) : Supabase → Edge Functions → « Deploy a new function » → « Via Editor »
//   nom : nuage  ·  coller tout ce fichier  ·  « Deploy function »
//   puis dans les réglages de la fonction (Details), désactiver « Enforce JWT verification » (le relais vérifie lui-même
//   que la demande vient d'un compte connecté au site).
// =====================================================================================================

const HOTES = /^https:\/\/([a-z0-9-]+\.)*apps\.education\.fr$/i;   // serveurs Nuage de l'Éducation nationale
const MAX_FICHIER = 80 * 1024 * 1024;                               // 80 Mo
const MAX_ENTREES = 8000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, statut = 200) => new Response(JSON.stringify(d), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
const encoder = (chemin: string) => chemin.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const PROPFIND = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><oc:fileid/></d:prop></d:propfind>';

type Base = { url: string; auth: string | null };
type Entree = { c: string; dossier: boolean; taille: number; date: string; id: string };

async function propfind(b: Base, chemin: string, profondeur: string, fichier = false) {
  const h: Record<string, string> = { Depth: profondeur, 'Content-Type': 'application/xml' };
  if (b.auth) h.Authorization = b.auth;
  return await fetch(b.url + '/' + encoder(chemin) + (chemin && !fichier ? '/' : ''), { method: 'PROPFIND', headers: h, body: PROPFIND });
}
function lireReponse(xml: string, b: Base): Entree[] {
  const prefixe = decodeURIComponent(new URL(b.url).pathname).replace(/\/$/, '');
  const out: Entree[] = [];
  for (const bloc of xml.split(/<(?:[a-z0-9]+:)?response[\s>]/i).slice(1)) {
    const href = bloc.match(/<(?:[a-z0-9]+:)?href>([^<]*)</i)?.[1];
    if (!href) continue;
    let p = decodeURIComponent(href.replace(/^https?:\/\/[^/]+/i, '').replace(/&amp;/g, '&'));
    if (!p.startsWith(prefixe)) continue;
    p = p.slice(prefixe.length).replace(/^\/+|\/+$/g, '');
    const dossier = /<(?:[a-z0-9]+:)?collection\s*\/?>/i.test(bloc);
    const taille = Number(bloc.match(/<(?:[a-z0-9]+:)?getcontentlength>(\d+)</i)?.[1] || 0);
    const date = bloc.match(/<(?:[a-z0-9]+:)?getlastmodified>([^<]*)</i)?.[1] || '';
    const id = bloc.match(/<(?:[a-z0-9]+:)?fileid>(\d+)</i)?.[1] || '';
    out.push({ c: p.normalize('NFC'), dossier, taille, date, id });
  }
  return out;
}
// accès au dossier partagé : adresse récente (Nextcloud 29 et +), sinon l'ancienne
async function choisirBase(origine: string, jeton: string): Promise<Base> {
  const bases: Base[] = [
    { url: `${origine}/public.php/dav/files/${jeton}`, auth: null },
    { url: `${origine}/public.php/webdav`, auth: 'Basic ' + btoa(jeton + ':') },
  ];
  let dernier = 0;
  for (const b of bases) {
    const r = await propfind(b, '', '0');
    await r.text();
    if (r.status === 207) return b;
    dernier = r.status;
  }
  if (dernier === 401 || dernier === 403) throw new Error('Nuage refuse l’accès : le lien de partage est peut-être protégé par un mot de passe ou expiré.');
  if (dernier === 404) throw new Error('Nuage ne trouve pas ce dossier partagé : vérifiez le lien dans « ⚙ Réglages Nuage ».');
  throw new Error(`Nuage ne répond pas comme prévu (code ${dernier}).`);
}
// tout le contenu du dossier partagé, dossier par dossier
async function lister(b: Base): Promise<Entree[]> {
  const tout: Entree[] = [];
  let file = [''];
  while (file.length && tout.length < MAX_ENTREES) {
    const lot = file.splice(0, 6);
    const reps = await Promise.all(lot.map(async (d) => {
      const r = await propfind(b, d, '1');
      const t = await r.text();
      return r.status === 207 ? lireReponse(t, b).filter((e) => e.c !== d && e.c) : [];
    }));
    for (const liste of reps) for (const e of liste) {
      tout.push(e);
      if (e.dossier) file.push(e.c);
    }
  }
  return tout;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non prise en charge.' }, 405);
  try {
    // la demande vient-elle d'un compte connecté au site ?
    const u = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { Authorization: req.headers.get('authorization') || '', apikey: req.headers.get('apikey') || '' },
    });
    await u.text();
    if (!u.ok) return json({ erreur: 'Connexion au site requise.' }, 401);

    const { action, lien, chemin = '' } = await req.json();
    const m = String(lien || '').trim().match(/^(https:\/\/[^/?#]+)\/(?:index\.php\/)?s\/([A-Za-z0-9]+)/);
    if (!m || !HOTES.test(m[1])) return json({ erreur: 'Lien de partage Nuage non reconnu (https://…apps.education.fr/s/…).' }, 400);
    const b = await choisirBase(m[1], m[2]);

    if (action === 'liste') return json({ fichiers: await lister(b) });

    // un seul fichier : numéro Nuage (pour l'ouvrir dans Nuage, avec l'éditeur en ligne)
    if (action === 'info') {
      const c = String(chemin || '').replace(/^\/+/, '');
      if (!c || c.split('/').includes('..')) return json({ erreur: 'Chemin de fichier invalide.' }, 400);
      const r = await propfind(b, c, '0', true);
      const t = await r.text();
      if (r.status !== 207) return json({ erreur: r.status === 404 ? `Fichier introuvable sur Nuage : ${c}` : `Nuage ne répond pas comme prévu (code ${r.status}).` }, r.status === 404 ? 404 : 502);
      return json({ id: t.match(/<(?:[a-z0-9]+:)?fileid>(\d+)</i)?.[1] || '', taille: Number(t.match(/<(?:[a-z0-9]+:)?getcontentlength>(\d+)</i)?.[1] || 0) });
    }

    if (action === 'fichier') {
      const c = String(chemin || '').replace(/^\/+/, '');
      if (!c || c.split('/').includes('..')) return json({ erreur: 'Chemin de fichier invalide.' }, 400);
      const h: Record<string, string> = {};
      if (b.auth) h.Authorization = b.auth;
      const r = await fetch(b.url + '/' + encoder(c), { headers: h });
      if (!r.ok) { await r.text(); return json({ erreur: r.status === 404 ? `Fichier introuvable sur Nuage : ${c}` : `Nuage refuse la lecture du fichier (code ${r.status}).` }, r.status === 404 ? 404 : 502); }
      if (Number(r.headers.get('content-length') || 0) > MAX_FICHIER) { await r.body?.cancel(); return json({ erreur: 'Fichier trop volumineux pour être lu (plus de 80 Mo).' }, 413); }
      return new Response(r.body, { headers: { ...CORS, 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' } });
    }
    return json({ erreur: 'Action inconnue.' }, 400);
  } catch (e) {
    return json({ erreur: String((e as Error)?.message || e) }, 500);
  }
});
