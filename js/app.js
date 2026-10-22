// Application « Pilotage BTS SCBH » : connexion, menu, navigation entre les pages.
import { NOM_APPLI } from '../config.js';
import { estConnecte, connexion, premiereConnexion, deconnexion, db, emailConnecte, SESSION_EXPIREE } from './api.js';
import { h, vider, erreur, toast } from './ui.js';
import { pageAccueil } from './pages/accueil.js';
import { pageEquipe } from './pages/equipe.js';
import { pageEleves } from './pages/eleves.js';
import { pageReferentiel } from './pages/referentiel.js';
import { pageSequencage } from './pages/sequencage.js';
import { pageAdmin } from './pages/admin.js';
import { pageCompte } from './pages/compte.js';
import { pageProgression } from './pages/progression.js';
import { pageFiches } from './pages/fiches.js';
import { pageValidation } from './pages/validation.js';

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
  peutMatiere: (id) => ctx.estAdmin() || (ctx.profil?.matieres || []).includes(Number(id)),
  async chargerBase() {
    const [matieres, enseignants, promo] = await Promise.all([
      db.lire('matieres', 'order=ordre'), db.lire('enseignants', 'order=ordre,nom'), db.lire('promotions', 'order=annee_debut'),
    ]);
    ctx.matieres = matieres; ctx.enseignants = enseignants; ctx.promotions = promo;
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
  enseignantsDe: (matiereId) => ctx.enseignants.filter((e) => (e.matieres || []).map(Number).includes(Number(matiereId))).map((e) => e.nom),
};

const PAGES = {
  accueil: pageAccueil, equipe: pageEquipe, eleves: pageEleves, referentiel: pageReferentiel,
  sequencage: pageSequencage, admin: pageAdmin, compte: pageCompte, progression: pageProgression, fiches: pageFiches, validation: pageValidation,
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
  h('label', {}, 'Identifiant', ident), h('label', {}, 'Code', code), ligne2, valider, info, bascule, aide);
  vider(app, h('div', { class: 'ecran-connexion' }, form));
  ident.focus();
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
    h('div', { class: 'titre-menu' }, 'Suivi'),
    lien('#/progression', 'Progression', page === 'progression'),
    lien('#/fiches', 'Fiches et contrats', page === 'fiches'),
    lien('#/validation', 'Validation des compétences', page === 'validation'),
    h('div', { class: 'titre-menu' }, 'Séquençages'),
    ctx.matieres.map((m) => { const a = lien('#/sequencage/' + m.id, m.nom, page === 'sequencage' && String(arg) === String(m.id),
      { style: { '--pastille': m.couleur } }); a.classList.add('matiere'); return a; }),
    h('div', { class: 'titre-menu' }, 'Référentiel'),
    lien('#/referentiel/competences', 'Compétences', page === 'referentiel' && arg !== 'savoirs' && arg !== 'taches'),
    lien('#/referentiel/savoirs', 'Savoirs associés', page === 'referentiel' && arg === 'savoirs'),
    lien('#/referentiel/taches', 'Activités et tâches', page === 'referentiel' && arg === 'taches'),
    h('div', { class: 'titre-menu' }, 'Bientôt'),
    ['Synthèse et couvertures', 'Impressions'].map((t) => h('span', { class: 'lien-menu inactif' }, t)),
    h('div', { class: 'bas-menu' },
      ctx.estAdmin() ? lien('#/admin', '⚙  Administration', page === 'admin') : null,
      lien('#/compte', '👤  ' + (ctx.profil?.nom || emailConnecte()), page === 'compte'),
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
  const r = route();
  if (r[0] === 'admin' && !ctx.estAdmin()) { location.hash = '#/accueil'; return; }
  const n = ++rendu;
  const zone = h('main', { class: 'contenu' }, h('div', { class: 'chargement' }, 'Chargement…'));
  vider(app, h('div', { class: 'cadre' }, menu(r), zone));
  try {
    await PAGES[r[0]](zone, r[1], ctx);
  } catch (e) {
    if (n === rendu) vider(zone, h('div', { class: 'erreur-page' }, h('h2', {}, 'Problème de chargement'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: afficher }, 'Réessayer')));
  }
}
export const rafraichirMenu = () => {
  const ancien = app.querySelector('nav.menu');
  if (ancien) ancien.replaceWith(menu(route()));
};

async function demarrer() {
  try {
    const profil = await db.rpc('mon_profil');
    if (!profil) throw new Error("Compte introuvable : demandez à l'administrateur de vous ajouter.");
    if (!profil.actif) { await deconnexion(); return ecranConnexion("Votre compte est désactivé : contactez l'administrateur."); }
    ctx.profil = { ...profil, matieres: (profil.matieres || []).map(Number) };
    await ctx.chargerBase();
    afficher();
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
