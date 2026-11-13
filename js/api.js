// Accès à Supabase (authentification + base de données) par de simples requêtes HTTP : aucune bibliothèque externe.
import { SUPABASE_URL, SUPABASE_KEY, DOMAINE } from '../config.js';

const CLE = 'pilotage-scbh-session';
let session = null;
let rafraichissement = null;

try { session = JSON.parse(localStorage.getItem(CLE)); } catch { session = null; }

function memoriser(s) {
  session = s;
  try { s ? localStorage.setItem(CLE, JSON.stringify(s)) : localStorage.removeItem(CLE); } catch { /* navigateur sans stockage */ }
}

export const estConnecte = () => !!(session && session.access_token);
export const emailConnecte = () => session?.user?.email || '';

// « brice.claudel » → « brice.claudel@ac-nancy-metz.fr » ; une adresse complète est gardée telle quelle
export function emailDe(identifiant) {
  const i = String(identifiant || '').trim().toLowerCase();
  return i.includes('@') ? i : `${i}@${DOMAINE}`;
}
export const identifiantDe = (email) => String(email || '').endsWith('@' + DOMAINE) ? email.split('@')[0] : email;

// messages d'erreur du serveur traduits en français
function traduire(data, statut) {
  const m = String((data && (data.msg || data.error_description || data.message || data.error)) || '');
  if (/Invalid login credentials/i.test(m)) return 'Identifiant ou code incorrect.';
  if (/Database error saving new user/i.test(m)) return "Ce compte n'a pas été autorisé par l'administrateur (ou l'identifiant est mal saisi).";
  if (/already registered|already exists/i.test(m)) return 'Ce compte existe déjà : utilisez « Se connecter ».';
  if (/at least 6|weak_password|Password should/i.test(m)) return 'Le code doit contenir au moins 6 caractères.';
  if (/row-level security|permission denied/i.test(m)) return "Vous n'avez pas le droit de modifier cette donnée.";
  if (/duplicate key/i.test(m)) return 'Cette valeur existe déjà.';
  if (/JWT|token/i.test(m) && statut === 401) return 'Session expirée : reconnectez-vous.';
  return m || `Erreur du serveur (${statut}).`;
}

async function envoyer(chemin, { method = 'GET', body, headers = {}, jeton = null } = {}) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (jeton) h.Authorization = 'Bearer ' + jeton;
  let r;
  try {
    r = await fetch(SUPABASE_URL + chemin, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Connexion au serveur impossible : vérifiez votre accès à internet.');
  }
  const texte = await r.text();
  let data = null;
  if (texte) { try { data = JSON.parse(texte); } catch { data = texte; } }
  if (!r.ok) {
    const e = new Error(traduire(data, r.status));
    e.statut = r.status;
    throw e;
  }
  return data;
}

function ouvrirSession(d) {
  memoriser({
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user?.id, email: d.user?.email },
  });
}

async function rafraichirSiBesoin() {
  if (!session) return;
  if (Date.now() / 1000 < (session.expires_at || 0) - 60) return;
  if (!rafraichissement) {
    rafraichissement = envoyer('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then(ouvrirSession)
      .catch((e) => { memoriser(null); throw e; })
      .finally(() => { rafraichissement = null; });
  }
  await rafraichissement;
}

// ------------------------------------------------------------------------------------------- comptes
export async function connexion(identifiant, code) {
  const d = await envoyer('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: emailDe(identifiant), password: code } });
  ouvrirSession(d);
}
export async function premiereConnexion(identifiant, code) {
  const d = await envoyer('/auth/v1/signup', { method: 'POST', body: { email: emailDe(identifiant), password: code } });
  if (!d.access_token) throw new Error("Le compte est créé mais la connexion a échoué : dans Supabase, décochez « Confirm email ».");
  ouvrirSession(d);
}
export async function deconnexion() {
  const s = session;
  memoriser(null);
  if (s) { try { await envoyer('/auth/v1/logout', { method: 'POST', jeton: s.access_token }); } catch { /* sans importance */ } }
}
export async function changerCode(code) {
  await rafraichirSiBesoin();
  await envoyer('/auth/v1/user', { method: 'PUT', body: { password: code }, jeton: session.access_token });
}

// sans être connecté (code oublié) : fonctions ouvertes au public, rien d'autre
export const rpcPublic = (fonction, args = {}) => envoyer(`/rest/v1/rpc/${fonction}`, { method: 'POST', body: args });

// ------------------------------------------------------------------------------------------- espace élèves
// Les élèves n'ont pas de compte Supabase : un jeton de session, vérifié par des fonctions dédiées qui ne renvoient
// que leurs propres données. Le jeton est gardé sur l'appareil de l'élève.
const CLE_ELEVE = 'pilotage-scbh-eleve';
export const SESSION_ELEVE_FINIE = 'session-eleve-finie';
export function sessionEleve() { try { return JSON.parse(localStorage.getItem(CLE_ELEVE) || 'null'); } catch { return null; } }
function memoriserEleve(s) { try { s ? localStorage.setItem(CLE_ELEVE, JSON.stringify(s)) : localStorage.removeItem(CLE_ELEVE); } catch { /* sans stockage */ } }
export async function connexionEleve(ident, code) {
  const d = await envoyer('/rest/v1/rpc/eleve_connexion', { method: 'POST', body: { ident: String(ident || '').trim().toLowerCase(), code } });
  if (!d?.jeton) throw new Error(d?.erreur || 'Identifiant ou code incorrect.');
  memoriserEleve(d); return d;
}
export const majSessionEleve = (patch) => { const s = sessionEleve(); if (s) memoriserEleve({ ...s, ...patch }); };
export async function rpcEleve(fonction, args = {}) {
  const s = sessionEleve();
  if (!s) { window.dispatchEvent(new Event(SESSION_ELEVE_FINIE)); throw new Error('Session expirée : reconnectez-vous.'); }
  try { return await envoyer(`/rest/v1/rpc/${fonction}`, { method: 'POST', body: { jeton: s.jeton, ...args } }); }
  catch (e) {
    if (/Session expirée|pris fin|désactivé|fermé/.test(e.message)) { memoriserEleve(null); window.dispatchEvent(new Event(SESSION_ELEVE_FINIE)); }
    throw e;
  }
}
export async function deconnexionEleve() {
  const s = sessionEleve(); memoriserEleve(null);
  if (s) { try { await envoyer('/rest/v1/rpc/eleve_deconnexion', { method: 'POST', body: { jeton: s.jeton } }); } catch { /* sans importance */ } }
}
// fichier d'un document publié, lu par le relais « nuage » (l'adresse Nuage de l'enseignant n'est jamais montrée)
export async function fichierEleve(livre) {
  const s = sessionEleve(); if (!s) throw new Error('Session expirée : reconnectez-vous.');
  let r;
  try { r = await fetch(`${SUPABASE_URL}/functions/v1/nuage`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'eleve_fichier', jeton: s.jeton, livre }) }); }
  catch { throw new Error('Le document ne peut pas être ouvert pour l’instant (relais Nuage indisponible).'); }
  if (!r.ok) { let m = ''; try { m = (await r.json()).erreur || ''; } catch { /* pas de JSON */ } throw new Error(m || `Le document ne peut pas être ouvert (${r.status}).`); }
  return r.blob();
}

// ------------------------------------------------------------------------------------------- données
export const SESSION_EXPIREE = 'session-expiree';

async function appel(chemin, options = {}) {
  try {
    await rafraichirSiBesoin();
  } catch {
    window.dispatchEvent(new Event(SESSION_EXPIREE));
    throw new Error('Session expirée : reconnectez-vous.');
  }
  if (!session) { window.dispatchEvent(new Event(SESSION_EXPIREE)); throw new Error('Session expirée : reconnectez-vous.'); }
  try {
    return await envoyer(chemin, { ...options, jeton: session.access_token });
  } catch (e) {
    if (e.statut === 401) { memoriser(null); window.dispatchEvent(new Event(SESSION_EXPIREE)); }
    throw e;
  }
}

const enc = encodeURIComponent;
const PAGE = 1000;
const AVEC_RETOUR = { Prefer: 'return=representation' };

// signalé après chaque enregistrement (le bouton « Annuler » se met à jour)
export const MODIFICATION = 'donnees-modifiees';
const signaler = (r) => { window.dispatchEvent(new Event(MODIFICATION)); return r; };
const LECTURES = new Set(['sauvegarde', 'mon_profil', 'notes_sommatives', 'presence', 'bilan_connexions', 'etat_site']);

// fonctions serveur Supabase (Edge Functions), ex. le relais « nuage » ; réponse JSON ou fichier (binaire)
export async function fonctionServeur(nom, corps, { binaire = false } = {}) {
  try { await rafraichirSiBesoin(); } catch { window.dispatchEvent(new Event(SESSION_EXPIREE)); throw new Error('Session expirée : reconnectez-vous.'); }
  if (!session) { window.dispatchEvent(new Event(SESSION_EXPIREE)); throw new Error('Session expirée : reconnectez-vous.'); }
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/${nom}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  } catch {
    const e = new Error(`Le relais « ${nom} » ne répond pas : il n’est peut-être pas encore installé dans Supabase (Edge Functions).`); e.statut = 0; throw e;
  }
  if (!r.ok) {
    let m = ''; try { const d = await r.json(); m = d.erreur || d.message || d.msg || ''; } catch { /* pas de JSON */ }
    if (r.status === 404 && !m) m = `Le relais « ${nom} » n’est pas encore installé dans Supabase (Edge Functions).`;
    if (r.status === 401 && /jwt/i.test(m)) m = `Le relais « ${nom} » refuse la demande : dans Supabase, désactivez « Enforce JWT verification » dans les réglages de la fonction.`;
    const e = new Error(m || `Erreur du relais « ${nom} » (${r.status}).`); e.statut = r.status; throw e;
  }
  return binaire ? r.blob() : r.json();
}

export const db = {
  // requete : filtres et tri à la façon de Supabase, ex. « matiere_id=eq.3&order=numero »
  // (le serveur renvoie au plus 1000 lignes par demande : les lignes suivantes sont lues par pages)
  lire: async (table, requete = '') => {
    const base = `/rest/v1/${table}?select=*${requete ? '&' + requete : ''}`;
    if (/(^|&)limit=/.test(requete)) return appel(base);
    let tout = [];
    for (let debut = 0; ; debut += PAGE) {
      const r = await appel(`${base}&limit=${PAGE}&offset=${debut}`);
      tout = tout.concat(r);
      if (!Array.isArray(r) || r.length < PAGE) return tout;
    }
  },
  ajouter: async (table, valeurs) => {
    const r = signaler(await appel(`/rest/v1/${table}`, { method: 'POST', body: valeurs, headers: AVEC_RETOUR }));
    return Array.isArray(valeurs) ? r : r?.[0];
  },
  modifier: async (table, id, valeurs, cle = 'id') => {
    const r = await appel(`/rest/v1/${table}?${cle}=eq.${enc(id)}`, { method: 'PATCH', body: valeurs, headers: AVEC_RETOUR });
    if (Array.isArray(r) && r.length === 0) throw new Error("Modification refusée : vous n'avez pas le droit de modifier cette donnée.");
    signaler();
    return r?.[0];
  },
  supprimer: async (table, id, cle = 'id') => {
    const r = await appel(`/rest/v1/${table}?${cle}=eq.${enc(id)}`, { method: 'DELETE', headers: AVEC_RETOUR });
    if (Array.isArray(r) && r.length === 0) throw new Error("Suppression refusée : vous n'avez pas le droit de supprimer cette donnée.");
    signaler();
  },
  // ajoute ou remplace des lignes (clé = colonnes de « conflit », ex. 'promotion_id,matiere_id,semaine')
  enregistrer: async (table, lignes, conflit) => signaler(await appel(`/rest/v1/${table}?on_conflict=${conflit}`,
    { method: 'POST', body: lignes, headers: { Prefer: 'resolution=merge-duplicates,return=representation' } })),
  rpc: async (fonction, args = {}) => {
    const r = await appel(`/rest/v1/rpc/${fonction}`, { method: 'POST', body: args });
    return LECTURES.has(fonction) ? r : signaler(r);
  },
};
