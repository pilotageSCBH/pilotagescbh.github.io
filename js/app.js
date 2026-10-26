// Application « Pilotage BTS SCBH » : connexion, menu, navigation entre les pages.
import { NOM_APPLI } from '../config.js';
import { estConnecte, connexion, premiereConnexion, deconnexion, db, emailConnecte, SESSION_EXPIREE, rpcPublic, emailDe, changerCode } from './api.js';
import { h, vider, erreur, toast } from './ui.js';
import { pageAccueil } from './pages/accueil.js';
import { pageEquipe } from './pages/equipe.js';
import { pageEleves } from './pages/eleves.js';
import { pageReferentiel } from './pages/referentiel.js';
import { pageSequencage } from './pages/sequencage.js?v=20261026a';
import { pageAdmin } from './pages/admin.js';
import { pageCompte } from './pages/compte.js';
import { pageProgression } from './pages/progression.js?v=20261026a';
import { pageFiches } from './pages/fiches.js?v=20261026a';
import { pageValidation } from './pages/validation.js';
import { pageCouverture } from './pages/couverture.js';
import { pageSynthese } from './pages/synthese.js?v=20261026a';
import { pageHistorique } from './pages/historique.js';
import { pageAide } from './pages/aide.js';
import { pageResultats } from './pages/resultats.js';

const app = document.getElementById('app');
const CLE_PROMO = 'pilotage-scbh-promotion';

// menu déroulant des promotions (2025-2027, 2026-2028…) : change la promotion affichée dans toutes les pages
export function choixPromotion(classe = '') {
  return h('select', { class: 'choix-promo ' + classe, 'aria-label': 'Promotion', onchange: (e) => ctx.choisirPromo(e.target.value) },
    ctx.promotions.map((p) => h('option', { value: p.annee_debut, selected: ctx.promo && p.id === ctx.promo.id }, 'Promotion ' + p.libelle)));
}

// contexte partagé par les pages : profil connecté, matières, référentiel (chargé une fois)
export const ctx = {
  profil: null, matieres: [], enseignants: [], promotion: null, promotions: [], promo: null, ref: null,
  estAdmin: () => ctx.profil?.role === 'admin',
  peutEcrire: () => !!ctx.profil && ctx.profil.role !== 'lecture',              // compte « Lecture seule » (DDFPT) : consultation
  peutMatiere: (id) => ctx.estAdmin() || (ctx.peutEcrire() && (ctx.profil?.matieres || []).includes(Number(id))),
  // séquençage et progression : seulement les enseignants de la matière (le rôle administrateur ne suffit pas)
  enseigne: (id) => ctx.peutEcrire() && (ctx.profil?.matieres || []).includes(Number(id)),
  maintenance: null,
  // partage des contenus par matière (séquençage, fiches, contrats) ; sans réglage : partagé avec tous
  partages: new Map(),
  monEnseignant: () => ctx.enseignants.find((e) => e.profil_id && e.profil_id === ctx.profil?.id)?.id ?? null,
  voit: (id) => {
    if (ctx.estAdmin() || (ctx.profil?.matieres || []).includes(Number(id))) return true;
    const p = ctx.partages.get(Number(id));
    return !p || p.mode === 'tous' || (p.mode === 'choisis' && (p.lecteurs || []).map(Number).includes(Number(ctx.monEnseignant())));
  },
  recharger: () => afficher(),
  async chargerBase() {
    const [matieres, enseignants, promo] = await Promise.all([
      db.lire('matieres', 'order=ordre'), db.lire('enseignants', 'order=ordre,nom'), db.lire('promotions', 'order=annee_debut'),
    ]);
    ctx.matieres = matieres; ctx.enseignants = enseignants; ctx.promotions = promo;
    // réglages de partage (table créée par la mise à jour 14_partage.sql ; absente : tout reste partagé)
    try { ctx.partages = new Map((await db.lire('partages')).map((p) => [Number(p.matiere_id), p])); } catch { ctx.partages = new Map(); }
    // promotion affichée : celle choisie la dernière fois sur ce poste, sinon celle qui commence cette année scolaire
    let choix = null;
    try { choix = Number(localStorage.getItem(CLE_PROMO)); } catch { /* sans stockage */ }
    const d = new Date(), rentree = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    ctx.promo = promo.find((p) => p.annee_debut === choix) || promo.find((p) => p.annee_debut === rentree) || promo[0] || null;
    ctx.promotion = ctx.promo;
  },
  choisirPromo(annee) {
    const p = ctx.promotions.find((x) => x.annee_debut === Number(annee));
    if (!p) return;
    ctx.promo = ctx.promotion = p;
    try { localStorage.setItem(CLE_PROMO, String(p.annee_debut)); } catch { /* sans stockage */ }
    afficher();
  },
  async referentiel() {
    if (!ctx.ref) {
      const [competences, savoirs, taches, activites, durees] = await Promise.all([
        db.lire('competences', 'order=ordre'), db.lire('savoirs', 'order=ordre'), db.lire('taches', 'order=ordre'),
        db.lire('activites', 'order=ordre'), db.lire('durees', 'order=heures'),
      ]);
      ctx.ref = { competences, savoirs, taches, activites, durees,
        comp: Object.fromEntries(competences.map((c) => [c.code, c])), sav: Object.fromEntries(savoirs.map((s) => [s.code, s])) };
    }
    return ctx.ref;
  },
  // compétences C1 à C4 : cœur de métier ; à partir de C5-1 : transversales
  transversale: (code) => Number((String(code).match(/^C(\d+)/) || [])[1] || 0) >= 5,
  categorie: (code) => (ctx.transversale(code) ? 'Compétences transversales' : 'Compétences cœur de métier'),
  // code court d'une matière (PR, AD, OR, LA, EA, AT…)
  codeMat: (m) => ({ Projet: 'PR', Analyse: 'AD', Orga: 'OR', Labo: 'LA', 'Étude': 'EA', Atelier: 'AT' }[m?.abreviation] || (m?.abreviation || m?.nom || '?').slice(0, 2).toUpperCase()),
  enseignantsDe: (matiereId) => ctx.enseignants.filter((e) => (e.matieres || []).map(Number).includes(Number(matiereId))).map((e) => e.nom),
};

const PAGES = {
  accueil: pageAccueil, equipe: pageEquipe, eleves: pageEleves, referentiel: pageReferentiel,
  sequencage: pageSequencage, admin: pageAdmin, compte: pageCompte, progression: pageProgression, fiches: pageFiches, validation: pageValidation, couverture: pageCouverture, synthese: pageSynthese, historique: pageHistorique, aide: pageAide, resultats: pageResultats,
};

// ------------------------------------------------------------------------------------------- connexion
function ecranConnexion(message = '') {
  let premiere = false;
  const ident = h('input', { id: 'ident', autocomplete: 'username', placeholder: 'prenom.nom', required: true });
  const code = h('input', { id: 'code', type: 'password', autocomplete: 'current-password', required: true, minlength: 6 });
  const code2 = h('input', { id: 'code2', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const ligne2 = h('label', { class: 'cache' }, 'Confirmer le code', code2);
  const info = h('p', { class: 'msg-connexion' }, message);
  const titre = h('h2', {}, 'Connexion');
  const valider = h('button', { class: 'btn principal large', type: 'submit' }, 'Se connecter');
  const bascule = h('button', { class: 'lien', type: 'button' }, 'Première connexion ? Choisir mon code');
  const aide = h('p', { class: 'aide' }, "Identifiant : votre adresse académique, ou seulement « prenom.nom ».");
  bascule.onclick = () => {
    premiere = !premiere;
    titre.textContent = premiere ? 'Première connexion' : 'Connexion';
    valider.textContent = premiere ? 'Créer mon code et entrer' : 'Se connecter';
    bascule.textContent = premiere ? "J'ai déjà un code : me connecter" : 'Première connexion ? Choisir mon code';
    ligne2.classList.toggle('cache', !premiere);
    code.autocomplete = premiere ? 'new-password' : 'current-password';
    info.textContent = premiere ? "Votre compte doit d'abord avoir été autorisé par l'administrateur. Choisissez un code d'au moins 6 caractères." : '';
  };
  const form = h('form', { class: 'carte-connexion', onsubmit: async (e) => {
    e.preventDefault();
    info.textContent = ''; info.classList.remove('erreur');
    if (premiere && code.value !== code2.value) { info.textContent = 'Les deux codes ne sont pas identiques.'; info.classList.add('erreur'); return; }
    valider.disabled = true;
    try {
      if (premiere) await premiereConnexion(ident.value, code.value); else await connexion(ident.value, code.value);
      await demarrer();
    } catch (err) {
      info.textContent = err.message; info.classList.add('erreur');
    } finally { valider.disabled = false; }
  } },
  h('img', { src: 'img/logo.jpg', alt: 'Lycée André Malraux', class: 'logo-connexion' }),
  h('h1', {}, NOM_APPLI), titre,
  h('label', {}, 'Identifiant', ident), h('label', {}, 'Code', code), ligne2, valider, info, bascule,
  h('button', { class: 'lien', type: 'button', onclick: () => ecranCodeOublie(ident.value) }, 'Code oublié ?'), aide);
  vider(app, h('div', { class: 'ecran-connexion' }, form));
  ident.focus();
  rpcPublic('etat_site').then((e) => {
    if (e?.maintenance) form.insertBefore(h('div', { class: 'alerte-maintenance' }, h('b', {}, '🛠  Site en maintenance'),
      h('p', {}, e.message || 'L’accès est temporairement fermé ; seul l’administrateur peut se connecter.')), titre);
  }).catch(() => {});
}

// site fermé pour maintenance (comptes autres qu'administrateur)
function ecranMaintenance(etat) {
  clearInterval(minuteurPresence);
  vider(app, h('div', { class: 'ecran-connexion' }, h('div', { class: 'carte-connexion' },
    h('img', { src: 'img/logo.jpg', alt: 'Lycée André Malraux', class: 'logo-connexion' }),
    h('h1', {}, NOM_APPLI), h('h2', {}, '🛠  Site en maintenance'),
    h('p', {}, etat?.message || 'L’administrateur effectue une opération de maintenance : l’accès est temporairement fermé.'),
    etat?.depuis ? h('p', { class: 'aide' }, 'Depuis le ' + new Date(etat.depuis).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : null,
    h('p', { class: 'aide' }, 'Vos données sont conservées. Réessayez un peu plus tard.'),
    h('button', { class: 'btn principal large', onclick: demarrer }, 'Réessayer'),
    h('button', { class: 'lien', onclick: async () => { await deconnexion(); ctx.profil = null; ecranConnexion(); } }, 'Se déconnecter'))));
}
// état du site : maintenance → écran d'attente (ou bandeau pour l'administrateur)
export async function verifierSite() {
  let etat = null;
  try { etat = await db.rpc('etat_site'); } catch { return true; }
  const avant = !!ctx.maintenance;
  ctx.maintenance = etat?.maintenance ? etat : null;
  if (ctx.maintenance && !ctx.estAdmin()) { ecranMaintenance(etat); return false; }
  if (avant !== !!ctx.maintenance && ctx.profil) { const b = app.querySelector('.bandeau-maintenance'); if (b) b.remove(); if (ctx.maintenance) app.querySelector('main.contenu')?.prepend(bandeauMaintenance()); }
  return true;
}
export function bandeauMaintenance() {
  return h('div', { class: 'bandeau-maintenance' }, '🛠  Mode maintenance actif : les autres comptes ne peuvent pas se connecter.  ',
    h('a', { href: '#/admin/maintenance' }, 'Rouvrir le site'));
}

// code oublié : nouveau code avec le code de secours, ou demande à l'administrateur
function ecranCodeOublie(identifiant = '') {
  const ident = h('input', { autocomplete: 'username', placeholder: 'prenom.nom', value: identifiant });
  const secours = h('input', { placeholder: 'XXXX-XXXX-XXXX', autocomplete: 'off', style: { textTransform: 'uppercase', letterSpacing: '1px' } });
  const c1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6 });
  const c2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6 });
  const info = h('p', { class: 'msg-connexion' });
  const msg = (t, err = false) => { info.textContent = t; info.classList.toggle('erreur', err); };
  const valider = h('button', { class: 'btn principal large', type: 'submit' }, 'Changer mon code et entrer');
  const demander = h('button', { class: 'btn large', type: 'button', onclick: async () => {
    if (!ident.value.trim()) return msg('Saisissez d’abord votre identifiant.', true);
    demander.disabled = true;
    try { await rpcPublic('demander_code', { identifiant: emailDe(ident.value) }); msg('Demande envoyée : l’administrateur vous donnera un code provisoire, à changer à votre prochaine connexion.'); }
    catch (e) { msg(e.message, true); demander.disabled = false; }
  } }, 'Prévenir l’administrateur');
  const form = h('form', { class: 'carte-connexion', onsubmit: async (e) => {
    e.preventDefault(); msg('');
    if (!ident.value.trim() || !secours.value.trim()) return msg('Saisissez votre identifiant et votre code de secours.', true);
    if (c1.value.length < 6) return msg('Le nouveau code doit contenir au moins 6 caractères.', true);
    if (c1.value !== c2.value) return msg('Les deux codes ne sont pas identiques.', true);
    valider.disabled = true;
    try {
      const ok = await rpcPublic('code_par_secours', { identifiant: emailDe(ident.value), secours: secours.value, code: c1.value });
      if (!ok) { msg('Identifiant ou code de secours incorrect (5 essais par heure).', true); return; }
      await connexion(ident.value, c1.value);
      toast('Nouveau code enregistré');
      await demarrer();
    } catch (x) { msg(x.message, true); } finally { valider.disabled = false; }
  } },
  h('img', { src: 'img/logo.jpg', alt: 'Lycée André Malraux', class: 'logo-connexion' }),
  h('h1', {}, NOM_APPLI), h('h2', {}, 'Code oublié'),
  h('p', { class: 'aide' }, 'Avec votre code de secours (créé dans « Mon compte ») : choisissez vous-même un nouveau code.'),
  h('label', {}, 'Identifiant', ident), h('label', {}, 'Code de secours', secours),
  h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer le nouveau code', c2), valider, info,
  h('p', { class: 'aide' }, 'Pas de code de secours ? L’administrateur sera prévenu et vous donnera un code provisoire.'), demander,
  h('button', { class: 'lien', type: 'button', onclick: () => ecranConnexion() }, '← Retour à la connexion'));
  vider(app, h('div', { class: 'ecran-connexion' }, form));
  (identifiant ? secours : ident).focus();
}

// code provisoire donné par l'administrateur : à remplacer avant d'entrer
function ecranNouveauCode() {
  const c1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const c2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const info = h('p', { class: 'msg-connexion erreur' });
  const form = h('form', { class: 'carte-connexion', onsubmit: async (e) => {
    e.preventDefault(); info.textContent = '';
    if (c1.value.length < 6) { info.textContent = 'Le code doit contenir au moins 6 caractères.'; return; }
    if (c1.value !== c2.value) { info.textContent = 'Les deux codes ne sont pas identiques.'; return; }
    try { await changerCode(c1.value); await db.rpc('code_change'); ctx.profil.doit_changer = false; toast('Code enregistré'); await ctx.chargerBase(); afficher(); demarrerPresence(); }
    catch (x) { info.textContent = x.message; }
  } },
  h('img', { src: 'img/logo.jpg', alt: 'Lycée André Malraux', class: 'logo-connexion' }),
  h('h1', {}, NOM_APPLI), h('h2', {}, 'Choisissez votre code'),
  h('p', { class: 'aide' }, 'Vous êtes entré avec un code provisoire donné par l’administrateur : choisissez maintenant votre propre code (6 caractères au moins).'),
  h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer', c2), h('button', { class: 'btn principal large', type: 'submit' }, 'Enregistrer et entrer'), info,
  h('button', { class: 'lien', type: 'button', onclick: async () => { await deconnexion(); ctx.profil = null; ecranConnexion(); } }, 'Se déconnecter'));
  vider(app, h('div', { class: 'ecran-connexion' }, form));
  c1.focus();
}

// ------------------------------------------------------------------------------------------- cadre
function menu(route) {
  const lien = (href, texte, actif, extra = {}) => h('a', { href, class: 'lien-menu' + (actif ? ' actif' : ''), ...extra }, texte);
  const [page, arg] = route;
  return h('nav', { class: 'menu' },
    h('a', { href: '#/accueil', class: 'marque' }, h('img', { src: 'img/logo.jpg', alt: '' }), h('span', {}, NOM_APPLI)),
    h('div', { class: 'promo-menu' }, choixPromotion()),
    lien('#/accueil', '⌂  Tableau de bord', page === 'accueil'),
    h('div', { class: 'titre-menu' }, 'Promotion'),
    lien('#/equipe', 'Matières et équipe', page === 'equipe'),
    lien('#/eleves', 'Élèves', page === 'eleves'),
    h('div', { class: 'titre-menu' }, 'Séquençages'),
    ctx.matieres.map((m) => { const a = lien('#/sequencage/' + m.id, m.nom, page === 'sequencage' && String(arg) === String(m.id),
      { style: { '--pastille': m.couleur } }); a.classList.add('matiere'); return a; }),
    h('div', { class: 'titre-menu' }, 'Suivi'),
    lien('#/progression', 'Progression', page === 'progression'),
    lien('#/fiches', 'Fiches et contrats', page === 'fiches'),
    lien('#/validation', 'Validation des compétences', page === 'validation'),
    lien('#/resultats', 'Résultats et moyennes', page === 'resultats'),
    lien('#/synthese', 'Synthèse des séquençages', page === 'synthese'),
    lien('#/couverture/competences', 'Couverture des compétences', page === 'couverture' && arg !== 'savoirs'),
    lien('#/couverture/savoirs', 'Couverture des savoirs', page === 'couverture' && arg === 'savoirs'),
    lien('#/historique', 'Historique des modifications', page === 'historique'),
    h('div', { class: 'titre-menu' }, 'Référentiel'),
    lien('#/referentiel/competences', 'Compétences', page === 'referentiel' && arg !== 'savoirs' && arg !== 'taches'),
    lien('#/referentiel/savoirs', 'Savoirs associés', page === 'referentiel' && arg === 'savoirs'),
    lien('#/referentiel/taches', 'Activités et tâches', page === 'referentiel' && arg === 'taches'),
    h('div', { class: 'bas-menu' },
      lien('#/aide', '?  Aide', page === 'aide'),
      ctx.estAdmin() ? lien('#/admin', '⚙  Administration' + (ctx.demandes ? `  (${ctx.demandes} demande${ctx.demandes > 1 ? 's' : ''})` : ''), page === 'admin') : null,
      lien('#/compte', '👤  ' + (ctx.profil?.nom || emailConnecte()) + (ctx.peutEcrire() ? '' : '  (consultation)'), page === 'compte'),
      h('button', { class: 'lien-menu', type: 'button', onclick: async () => { await deconnexion(); ecranConnexion('Vous êtes déconnecté.'); } }, '⏻  Se déconnecter')));
}

function route() {
  const p = (location.hash || '#/accueil').replace(/^#\//, '').split('/');
  return [PAGES[p[0]] ? p[0] : 'accueil', p[1]];
}

let rendu = 0;
async function afficher() {
  if (!estConnecte()) return ecranConnexion();
  if (!ctx.profil) return demarrer();
  if (ctx.profil.doit_changer) return ecranNouveauCode();
  const r = route();
  if (r[0] === 'admin' && !ctx.estAdmin()) { location.hash = '#/accueil'; return; }
  const n = ++rendu;
  const zone = h('main', { class: 'contenu' }, h('div', { class: 'chargement' }, 'Chargement…'));
  vider(app, h('div', { class: 'cadre' }, menu(r), zone));
  try {
    await PAGES[r[0]](zone, r[1], ctx);
    if (ctx.maintenance && n === rendu) zone.prepend(bandeauMaintenance());
    const SECTION_AIDE = { accueil: 'demarrer', equipe: 'admin', eleves: 'admin', sequencage: 'sequencage', progression: 'progression', fiches: 'fiches',
      validation: 'validation', resultats: 'resultats', couverture: 'couverture', synthese: 'couverture', admin: 'admin', historique: 'historique', compte: 'demarrer', referentiel: 'demarrer' };
    if (r[0] === 'accueil' && n === rendu && ctx.profil.a_secours === false) zone.prepend(h('div', { class: 'avertissement' },
      '🔑  Créez votre code de secours dans ', h('a', { href: '#/compte' }, 'Mon compte'), ' : il vous permettra de choisir vous-même un nouveau code si vous oubliez le vôtre.'));
    if (r[0] !== 'aide' && n === rendu) zone.append(h('a', { class: 'aide-flottante ecran', href: '#/aide/' + (SECTION_AIDE[r[0]] || ''), title: 'Aide sur cette page' }, '?'));
  } catch (e) {
    if (n === rendu) vider(zone, h('div', { class: 'erreur-page' }, h('h2', {}, 'Problème de chargement'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: afficher }, 'Réessayer')));
  }
}
export const rafraichirMenu = () => {
  const ancien = app.querySelector('nav.menu');
  if (ancien) ancien.replaceWith(menu(route()));
};

// ------------------------------------------------------------------------------------------- présence
// signal toutes les minutes tant que l'application est affichée et utilisée (souris, clavier dans les 5 dernières
// minutes) : l'administrateur voit le nombre de connexions et le temps passé par chacun
const CLE_PRESENCE = 'pilotage-scbh-connexion';
let minuteurPresence = null, derniereAction = Date.now();
['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, () => { derniereAction = Date.now(); }, { passive: true }));
async function signalerPresence() {
  if (!ctx.profil || !estConnecte()) return;
  if (document.visibilityState !== 'visible' || Date.now() - derniereAction > 5 * 60000) return;
  let c = null;
  try { c = JSON.parse(localStorage.getItem(CLE_PRESENCE)); } catch { /* sans stockage */ }
  try {
    if (!(await verifierSite())) return;
    const id = await db.rpc('presence', { c: c && c.profil === ctx.profil.id ? c.id : null });
    try { localStorage.setItem(CLE_PRESENCE, JSON.stringify({ profil: ctx.profil.id, id })); } catch { /* sans stockage */ }
  } catch { /* fonction absente ou réseau : sans importance */ }
}
function demarrerPresence() {
  clearInterval(minuteurPresence);
  derniereAction = Date.now();
  signalerPresence();
  minuteurPresence = setInterval(signalerPresence, 60000);
}

async function demarrer() {
  try {
    const profil = await db.rpc('mon_profil');
    if (!profil) throw new Error("Compte introuvable : demandez à l'administrateur de vous ajouter.");
    if (!profil.actif) { await deconnexion(); return ecranConnexion("Votre compte est désactivé : contactez l'administrateur."); }
    ctx.profil = { ...profil, matieres: (profil.matieres || []).map(Number) };
    if (ctx.profil.doit_changer) return ecranNouveauCode();
    if (!(await verifierSite())) return;
    if (ctx.estAdmin()) { try { ctx.demandes = (await db.lire('demandes_code')).length; } catch { ctx.demandes = 0; } }
    await ctx.chargerBase();
    afficher();
    demarrerPresence();
  } catch (e) {
    ctx.profil = null;
    if (!estConnecte()) return ecranConnexion(e.message);
    vider(app, h('div', { class: 'ecran-connexion' }, h('div', { class: 'carte-connexion' },
      h('h2', {}, 'Connexion impossible'), h('p', {}, e.message),
      h('button', { class: 'btn principal', onclick: demarrer }, 'Réessayer'),
      h('button', { class: 'lien', onclick: async () => { await deconnexion(); ecranConnexion(); } }, 'Changer de compte'))));
  }
}

window.addEventListener('hashchange', afficher);
window.addEventListener(SESSION_EXPIREE, () => { ctx.profil = null; ecranConnexion('Votre session a expiré : reconnectez-vous.'); });
window.addEventListener('unhandledrejection', (e) => erreur(e.reason));
document.title = NOM_APPLI;
if (estConnecte()) demarrer(); else ecranConnexion();
export { toast };
