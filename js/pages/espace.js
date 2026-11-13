// Mes ressources : moteur commun de « Ma bibliothèque » et de « Mes cours » (les deux espaces fonctionnent exactement de la même façon).
// Espace personnel de chaque enseignant : thèmes / dossiers et sous-dossiers (tuiles), fiches (couverture, sommaire avec les pages),
// recherche dans les sommaires, mode gestion, partage avec des collègues, PDF. Les fichiers restent sur le Nuage de l'enseignant.
// #/biblio (ou #/cours) : accueil · …/t-ID : un thème ou dossier · …/l-ID : une fiche · …/partages : partagés avec moi
import { db, fonctionServeur } from '../api.js';
import { h, vider, toast, erreur, confirmer, fenetre } from '../ui.js';
import { envoyerPDF } from './fiches.js';
import { nomFichier } from '../echange.js';
import { boutonIA, champs, codesDans, listeSavoirs, aEcrire, resume } from '../ia.js';
import {
  sansAccent, compareTitres, pluriel, chargerReglages, reglagesDe, adresseFichier, adresseDossier, accueilNuage, dialogueReglages,
  chargerCollegues, nomCollegue, lirePdf, ouvrirPdf, signetsPdf, textePages, sommaireDepuisTexte, imagePage, reduireImage,
  choisirDossier, cheminRelatif, ignore, grainDeBois, couleurTranche, dialoguePartage, progression, nuageListe, nuageFichier, analyserLien,
} from '../ressources.js';

// ------------------------------------------------------------------------------------------- types de documents (Mes cours)
export const GENRES = { cours: ['📘', 'Cours'], exercice: ['✏️', 'Exercice'], tdtp: ['🛠', 'TD / TP'], evaluation: ['📝', 'Évaluation'],
  corrige: ['✅', 'Corrigé'], ressource: ['🎬', 'Ressource'], autre: ['📄', 'Autre'] };
export const iconeDoc = (r) => (r.type === 'dossier' ? '📁' : (GENRES[r.genre] || GENRES.cours)[0]);
export function genreDepuisNom(nom) {
  const n = String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/corrig/.test(n)) return 'corrige';
  if (/^(td|tp|td[\s_-]*tp|travaux)/.test(n) || /\b(td|tp)\b/.test(n)) return 'tdtp';
  if (/evaluation|^eval|controle|\bds\b|examen|sujet/.test(n)) return 'evaluation';
  if (/exercice|^exo/.test(n)) return 'exercice';
  if (/ressource|video|documentation|annexe/.test(n)) return 'ressource';
  if (/^cours\b|^cours$/.test(n)) return 'cours';
  return null;
}

// ------------------------------------------------------------------------------------------- lecture d'un fichier Word (.docx)
// titres (styles Titre 1 / 2 / 3 ou niveaux hiérarchiques) → sommaire [{ t, p, n }] ; codes des savoirs du référentiel cités dans le texte
export async function lireWord(fichier, ref, { niveaux = 3, numeroter = true } = {}) {
  if (!/\.docx$/i.test(fichier.name)) throw new Error(`« ${fichier.name} » : seuls les fichiers Word récents (.docx) peuvent être lus.`);
  const P = await import('../pdf.js?v=20261113'); await P.chargerOutils();
  const zip = await window.JSZip.loadAsync(await fichier.arrayBuffer());
  const xml = async (chemin) => { const f = zip.file(chemin); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
  const [doc, styles, core] = await Promise.all([xml('word/document.xml'), xml('word/styles.xml'), xml('docProps/core.xml')]);
  if (!doc) throw new Error(`« ${fichier.name} » n’est pas un document Word lisible.`);
  const val = (el, nom) => el?.getElementsByTagName(nom)[0]?.getAttribute('w:val');
  const S = new Map();
  for (const st of styles ? [...styles.getElementsByTagName('w:style')] : []) {
    S.set(st.getAttribute('w:styleId'), { nom: val(st, 'w:name') || '', base: val(st, 'w:basedOn'), lvl: val(st.getElementsByTagName('w:pPr')[0], 'w:outlineLvl') });
  }
  const niveauStyle = (id, n = 0) => {
    const s = S.get(id); if (!s || n > 10) return null;
    if (/^toc|^table des|^sommaire/i.test(s.nom)) return null;
    if (s.lvl != null) return Number(s.lvl);
    const m = s.nom.match(/^(?:heading|titre)\s*(\d)$/i); if (m) return Number(m[1]) - 1;
    return s.base ? niveauStyle(s.base, n + 1) : null;
  };
  const estTitreDoc = (id) => /^(title|titre)$/i.test(S.get(id)?.nom || '') || /^(Title|Titre)$/.test(id || '');
  let titre = '';
  const tout = [], sommaire = [], cpt = [0, 0, 0, 0, 0];
  for (const p of [...doc.getElementsByTagName('w:p')]) {
    const pPr = p.getElementsByTagName('w:pPr')[0];
    const id = val(pPr, 'w:pStyle');
    const texte = [...p.getElementsByTagName('*')].map((e) => (e.tagName === 'w:t' ? e.textContent : e.tagName === 'w:tab' ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
    if (!texte) continue;
    tout.push(texte);
    if (!titre && estTitreDoc(id)) { titre = texte; continue; }
    let n = val(pPr, 'w:outlineLvl'); n = n != null ? Number(n) : niveauStyle(id);
    if (n == null || n >= niveaux || n > 8) continue;
    let t = texte;
    if (numeroter && !/^\d+([.)]\d+)*[.)]?\s/.test(t)) {
      cpt[n]++; for (let k = n + 1; k < cpt.length; k++) cpt[k] = 0;
      t = cpt.slice(0, n + 1).map((x) => x || 1).join('.') + (n === 0 ? '. ' : ' ') + t;
    }
    sommaire.push({ t, p: null, n: Math.min(n, 4) });
  }
  if (!titre && core) titre = (core.getElementsByTagName('dc:title')[0]?.textContent || '').trim();
  if (!titre) titre = fichier.name.replace(/\.docx$/i, '').replace(/[_]+/g, ' ').trim();
  const texteComplet = ' ' + tout.join(' ') + ' ';
  const savoirs = ref.savoirs.map((s) => s.code).filter((c) => new RegExp(`[^\\w.-]${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(texteComplet));
  return { titre, sommaire, nb: sommaire.length, savoirs };
}

// ------------------------------------------------------------------------------------------- les deux espaces
export const ESPACES = {
  biblio: { cle: 'biblio', base: '#/biblio', titre: '📖  Ma bibliothèque', icone: '📖', lien: 'lien_bibliotheque', nomDossierNuage: 'Bibliothèque',
    theme: 'thème', themes: 'thèmes', Theme: 'Thème', fiche: 'ouvrage', fiches: 'ouvrages', Fiches: 'Ouvrages', ajouter: 'Ajouter des livres', iconeFiche: '📕',
    exempleTheme: 'Escaliers', exempleDossier: 'Livres/01 - Matériau bois', exempleChemin: 'Livres/01 - Matériau bois/Mon livre.pdf',
    recherche: 'Rechercher dans les titres, auteurs et sommaires : contreventement, lamellé-collé, DTU 31.2…', genres: false },
  cours: { cle: 'cours', base: '#/cours', titre: '🎓  Mes cours', icone: '🎓', lien: 'lien_cours', nomDossierNuage: 'Mes cours',
    theme: 'dossier', themes: 'dossiers', Theme: 'Dossier', fiche: 'document', fiches: 'documents', Fiches: 'Documents', ajouter: 'Ajouter des documents', iconeFiche: '📘',
    exempleTheme: 'S1 - Déroulement d’une affaire', exempleDossier: 'Organisation/S1 - Déroulement d’une affaire', exempleChemin: 'Organisation/S1 - Déroulement d’une affaire/A01 - L’entreprise.pdf',
    recherche: 'Rechercher dans les titres, types et sommaires : contreventement, métré, évaluation, S11-1…', genres: true },
};

const A_COMPLETER = { scan: 'PDF scanné', aucun: 'Sommaire introuvable', protege: 'PDF protégé', erreur: 'PDF illisible' };
const caches = {};           // par espace : { themes, livres, partages, t }
const recherches = {};       // par espace, gardée d'une page à l'autre

async function charger(E, force) {
  const c = caches[E.cle];
  if (c && !force && Date.now() - c.t < 120000) return c;
  const [themes, livres, partages, publications] = await Promise.all([db.lire('biblio_themes', `espace=eq.${E.cle}&order=ordre,id`), db.lire('biblio_livres', `espace=eq.${E.cle}&order=ordre,id`), db.lire('biblio_partages'),
    E.genres ? db.lire('publications_eleves').catch(() => null) : null]);
  caches[E.cle] = { themes: new Map(themes.map((t) => [t.id, t])), livres: new Map(livres.map((l) => [l.id, l])), partages, publications, t: Date.now() };
  return caches[E.cle];
}
export const oublierEspaces = () => { for (const k of Object.keys(caches)) delete caches[k]; };

export function pageEspace(E) {
  return async function (zone, arg, ctx) {
    if (!ctx.peutEcrire()) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, E.titre)), h('p', { class: 'vide' }, 'Cet espace personnel est réservé aux enseignants.')); return; }
    const moi = ctx.profil.id;
    let C;
    try { [C] = await Promise.all([charger(E), chargerReglages(), chargerCollegues()]); }
    catch (e) {
      vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, E.titre)), h('div', { class: 'erreur-page' }, h('h2', {}, 'Espace pas encore installé'),
        h('p', {}, ctx.estAdmin() ? 'Exécutez les scripts « 25_bibliotheque.sql » puis « 26_mes_cours.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord terminer l’installation de cet espace.'), h('p', { class: 'aide' }, e.message)));
      return;
    }
    await afficher(E, C, zone, arg, ctx, moi);
  };
}

async function afficher(E, C, zone, arg, ctx, moi) {
  const ref = await ctx.referentiel();
  const { themes: T, livres: L } = C;
  const CLE_GESTION = 'pilotage-scbh-' + E.cle + '-gestion';
  let gestion = (() => { try { return sessionStorage.getItem(CLE_GESTION) === '1'; } catch { return false; } })();
  let recherche = recherches[E.cle] || '';

  // ------------------------------------------------------------------ outils
  const aMoi = (x) => x.proprietaire === moi;
  const sousThemes = (id, proprio = null) => [...T.values()].filter((t) => (t.parent_id ?? null) === id && (proprio === null || t.proprietaire === proprio)).sort((a, b) => a.ordre - b.ordre || compareTitres(a.nom, b.nom));
  const rang = Object.keys(GENRES);
  const livresDe = (id, proprio) => [...L.values()].filter((l) => (l.theme_id ?? null) === id && (id !== null || l.proprietaire === proprio))
    .sort((a, b) => (E.genres ? rang.indexOf(a.genre || 'cours') - rang.indexOf(b.genre || 'cours') : 0) || a.ordre - b.ordre || compareTitres(a.titre, b.titre));
  const descendants = (id) => { const o = []; const p = [id]; while (p.length) { const x = p.pop(); for (const t of sousThemes(x)) { o.push(t); p.push(t.id); } } return o; };
  const total = (id) => [id, ...descendants(id).map((t) => t.id)].reduce((s, x) => s + livresDe(x).length, 0);
  const chemin = (t) => { const l = []; let p = t; let n = 0; while (p && n++ < 50) { l.unshift(p); p = p.parent_id ? T.get(p.parent_id) : null; } return l; };
  const P = () => C.partages;
  const partagesDe = (cle, id) => P().filter((p) => p[cle] === id);
  const estPartage = (x, cle) => x.partage_tous || partagesDe(cle, x.id).length > 0;
  const urlLivre = (l, page) => {
    if (l.lien) return l.lien + (page ? '#page=' + page : '');
    const r = reglagesDe(l.proprietaire), u = adresseFichier(r[E.lien], l.chemin, r.format_liens);
    return u ? u + (page && r.format_liens !== 'telechargement' ? '#page=' + page : '') : '';
  };
  const urlTheme = (t) => adresseDossier(reglagesDe(t.proprietaire)[E.lien], t.dossier);
  const libSavoir = (c) => ref.sav[c]?.libelle || '';
  const genreDe = (l) => GENRES[l.genre] || GENRES.cours;
  const memoGestion = (v) => { gestion = v; try { sessionStorage.setItem(CLE_GESTION, v ? '1' : '0'); } catch { /* sans stockage */ } };
  const recharger = () => ctx.recharger();
  const lienT = (t) => E.base + '/t-' + t.id, lienL = (l) => E.base + '/l-' + l.id;
  // publication pour les élèves (Mes cours) : un document, ou un dossier entier (et tout ce qu'il contient)
  const avecEleves = E.genres && Array.isArray(C.publications);
  const pubsDe = (cle, id) => (C.publications || []).filter((p) => p[cle] === id);
  const publieHerite = (l) => { let t = l.theme_id ? T.get(l.theme_id) : null, n = 0; while (t && n++ < 50) { if (pubsDe('theme_id', t.id).length) return t; t = t.parent_id ? T.get(t.parent_id) : null; } return null; };
  const estPublie = (cle, x) => pubsDe(cle, x.id).length > 0 || (cle === 'livre_id' ? !!publieHerite(x) : (() => { let t = x.parent_id ? T.get(x.parent_id) : null, n = 0; while (t && n++ < 50) { if (pubsDe('theme_id', t.id).length) return true; t = t.parent_id ? T.get(t.parent_id) : null; } return false; })());
  const boutonEleves = (cle, x, classe) => (avecEleves && aMoi(x) ? h('button', { class: classe + (pubsDe(cle, x.id).length ? ' publie-actif' : ''), title: 'Rendre visible aux élèves dans leur espace', onclick: () => publierEleves(cle, x) },
    pubsDe(cle, x.id).length ? '👁 Visible des élèves' : '👁 Publier aux élèves') : null);

  // route (un numéro seul = une fiche : liens des séquençages)
  const [k, idTxt] = /^\d+$/.test(String(arg || '')) ? ['l', arg] : String(arg || '').split('-');
  const themeCourant = k === 't' ? T.get(Number(idTxt)) : null;
  const livreCourant = k === 'l' ? L.get(Number(idTxt)) : null;
  const vue = arg === 'partages' || (themeCourant && !aMoi(themeCourant)) || (livreCourant && !aMoi(livreCourant)) ? 'partages' : 'mes';
  const modif = vue === 'mes' && gestion;

  const mesLivres = [...L.values()].filter(aMoi), sesLivres = [...L.values()].filter((l) => !aMoi(l));
  const mesFiches = () => [...L.values()].filter(aMoi);     // liste à jour (après des créations sur la même page)
  const reglage = reglagesDe(moi);

  // ------------------------------------------------------------------ squelette
  const contenu = h('div', { class: 'contenu-biblio' });
  const bandeauNuage = h('div', { class: 'bandeau-nuage-zone' });
  const champ = h('input', { class: 'recherche-biblio', type: 'search', value: recherche, placeholder: E.recherche, 'aria-label': 'Rechercher',
    oninput: () => { recherche = recherches[E.cle] = champ.value; dessiner(); } });
  vider(zone,
    h('header', { class: 'entete-biblio', style: { '--fond-biblio': grainDeBois('entete-' + E.cle + '-' + moi) + ' center/cover' } },
      h('div', { class: 'tete-biblio' },
        h('div', {}, h('h1', {}, E.titre),
          h('p', { class: 'sous-titre' }, `${pluriel(mesLivres.length, E.fiche, E.fiches)} · ${pluriel([...T.values()].filter(aMoi).length, E.theme, E.themes)}${sesLivres.length ? ` · ${sesLivres.length} partagé(s) avec moi` : ''} · fichiers sur votre Nuage`)),
        h('div', { class: 'actions-page' },
          h('button', { class: 'btn principal', onclick: () => ajouterLivres(themeCourant && aMoi(themeCourant) ? themeCourant.id : null) }, '＋  ' + E.ajouter),
          h('button', { class: 'btn', title: `Relire votre dossier « ${E.nomDossierNuage} » (synchronisé avec Nuage) : nouveaux fichiers, nouveaux dossiers, fichiers disparus`, onclick: () => mettreAJour() }, '↻  Mettre à jour depuis mon dossier'),
          h('button', { class: 'btn', onclick: () => partagerLot() }, '👥  Partager'),
          h('button', { class: 'btn', onclick: () => dialoguePDF() }, '⬇  PDF / Imprimer'),
          h('button', { class: 'btn', onclick: () => dialogueReglages(ctx, recharger) }, '⚙  Réglages Nuage'),
          h('button', { class: 'btn' + (gestion ? ' actif-gestion' : ''), title: `Créer, renommer, ranger les ${E.themes} ; modifier ou supprimer les fiches`, onclick: () => { memoGestion(!gestion); recharger(); } }, gestion ? '✔  Terminer la gestion' : '✎  Gérer'))),
      h('div', { class: 'zone-recherche-biblio' }, champ, recherche ? h('button', { class: 'effacer-recherche', type: 'button', title: 'Effacer', onclick: () => { recherche = recherches[E.cle] = ''; champ.value = ''; dessiner(); champ.focus(); } }, '×') : null)),
    h('nav', { class: 'onglets onglets-cours' },
      h('a', { href: E.base, class: vue === 'mes' ? 'actif' : '' }, `${E.icone} ${E.titre.replace(/^\S+\s+/, '')} (${mesLivres.length})`),
      h('a', { href: E.base + '/partages', class: vue === 'partages' ? 'actif' : '' }, `👥 Partagés avec moi (${sesLivres.length})`)),
    !reglage[E.lien] && vue === 'mes' ? h('div', { class: 'avertissement' }, `🔗  Pour ouvrir vos fichiers depuis le site, collez le lien de partage de votre dossier « ${E.nomDossierNuage} » dans `,
      h('button', { class: 'lien', type: 'button', onclick: () => dialogueReglages(ctx, recharger) }, '⚙ Réglages Nuage'), '.') : null,
    bandeauNuage, contenu);

  // ------------------------------------------------------------------ rendu
  function dessiner() {
    if (recherche.trim()) return vider(contenu, resultats());
    if (livreCourant) return vider(contenu, ficheLivre(livreCourant));
    if (themeCourant) return vider(contenu, pageTheme(themeCourant));
    vider(contenu, vue === 'mes' ? accueil() : accueilPartages());
  }
  function ariane(t, dernierLien = false) {
    const l = t ? chemin(t) : [];
    return h('nav', { class: 'ariane-biblio' }, h('a', { href: vue === 'mes' ? E.base : E.base + '/partages' }, vue === 'mes' ? 'Accueil' : 'Partagés avec moi'),
      l.map((x, i) => [' › ', i === l.length - 1 && !dernierLien ? h('b', {}, x.nom) : h('a', { href: lienT(x) }, x.nom)]));
  }
  function tuile(t) {
    const n = total(t.id), ns = sousThemes(t.id).length;
    const el = h('a', { class: 'tuile-biblio', href: lienT(t), style: { backgroundImage: t.image ? `url("${t.image}")` : grainDeBois(chemin(t).map((x) => x.nom).join('/')) }, 'data-id': t.id },
      h('div', { class: 'etiquette-tuile' }, h('div', { class: 'nom' }, t.nom),
        h('div', { class: 'compte' }, [ns ? pluriel(ns, 'sous-' + E.theme, 'sous-' + E.themes) : '', pluriel(n, E.fiche, E.fiches)].filter(Boolean).join(' · '),
          aMoi(t) && estPartage(t, 'theme_id') ? ' · 👥' : '')),
      modif ? h('div', { class: 'outils-tuile' },
        h('button', { type: 'button', title: `Modifier le ${E.theme}`, onclick: (e) => { e.preventDefault(); modifierTheme(t); } }, '✎'),
        h('button', { type: 'button', title: `Partager le ${E.theme}`, onclick: (e) => { e.preventDefault(); partagerUn('theme_id', t); } }, '👥'),
        h('button', { type: 'button', title: `Supprimer le ${E.theme}`, onclick: (e) => { e.preventDefault(); supprimerTheme(t); } }, '✖')) : null);
    if (modif) glisserTuile(el, t);
    return el;
  }
  function tuiles(liste, parent) {
    return h('div', { class: 'tuiles-biblio' }, liste.map(tuile),
      modif ? h('button', { class: 'tuile-biblio nouvelle', type: 'button', onclick: () => nouveauTheme(parent) }, h('span', { class: 'plus' }, '＋'), h('span', {}, parent ? `Nouveau sous-${E.theme}` : `Nouveau ${E.theme}`)) : null);
  }
  function accueil() {
    const racines = sousThemes(null, moi), nonClasses = livresDe(null, moi);
    if (!racines.length && !nonClasses.length) return h('div', { class: 'carte-detail accueil-cours' },
      h('h2', {}, `${E.icone} Votre espace « ${E.titre.replace(/^\S+\s+/, '')} » est vide`),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, 'Depuis Nuage : '), `rangez vos fichiers sur Nuage dans un dossier « ${E.nomDossierNuage} » avec un sous-dossier par ${E.theme}, puis « ↻ Mettre à jour depuis mon dossier » (le dossier synchronisé sur votre ordinateur) : le site crée les ${E.themes} et les fiches.`),
        h('li', {}, h('b', {}, 'Ou à la main : '), `« ✎ Gérer » → « ＋ Nouveau ${E.theme} », puis « ＋ ${E.ajouter} ».`)));
    return h('div', {}, modif ? h('p', { class: 'aide' }, `Mode gestion : glissez une tuile pour changer sa place ; ✎ modifie un ${E.theme} (nom, dossier Nuage, image).`) : null,
      tuiles(racines, null),
      nonClasses.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Non classés'), listeLivres(nonClasses)) : null);
  }
  function accueilPartages() {
    const autres = [...new Set([...T.values(), ...L.values()].filter((x) => !aMoi(x)).map((x) => x.proprietaire))];
    if (!autres.length) return h('p', { class: 'vide' }, `Aucun ${E.fiche} n’est encore partagé avec vous.`);
    return autres.map((u) => {
      const th = [...T.values()].filter((t) => t.proprietaire === u && (!t.parent_id || !T.has(t.parent_id))).sort((a, b) => a.ordre - b.ordre);
      const li = [...L.values()].filter((l) => l.proprietaire === u && (!l.theme_id || !T.has(l.theme_id)));
      return h('section', { class: 'groupe-proprio-biblio' }, h('h2', { class: 'titre-section' }, '👤 ', nomCollegue(u)), th.length ? tuiles(th, null) : null, li.length ? listeLivres(li) : null);
    });
  }
  function pageTheme(t) {
    const st = sousThemes(t.id), li = livresDe(t.id);
    return h('div', {},
      h('div', { class: 'tete-theme' }, ariane(t),
        h('div', { class: 'boutons-detail' },
          urlTheme(t) ? h('a', { class: 'btn petit', href: urlTheme(t), target: '_blank', rel: 'noopener', title: 'Ouvrir ce dossier dans Nuage' }, '📂 Dossier sur Nuage') : null,
          modif ? h('button', { class: 'btn petit', onclick: () => modifierTheme(t) }, `✎ Modifier le ${E.theme}`) : null,
          vue === 'mes' ? h('button', { class: 'btn petit' + (estPartage(t, 'theme_id') ? ' partage-actif' : ''), onclick: () => partagerUn('theme_id', t) }, estPartage(t, 'theme_id') ? '👥 Partagé' : '👥 Partager') : null,
          vue === 'mes' ? boutonEleves('theme_id', t, 'btn petit') : null,
          h('button', { class: 'btn petit', onclick: () => dialoguePDF(t) }, '⬇ PDF'),
          vue === 'partages' ? h('span', { class: 'info-partage' }, '👤 Partagé par ' + nomCollegue(t.proprietaire)) : null)),
      st.length || modif ? tuiles(st, t.id) : null,
      li.length ? h('section', {}, st.length ? h('h2', { class: 'titre-section' }, `${E.Fiches} de ce ${E.theme}`) : null, listeLivres(li))
        : !st.length ? h('p', { class: 'vide' }, `Aucun ${E.fiche} dans ce ${E.theme}.`) : null);
  }

  // ------------------------------------------------------------------ fiches
  const couverture = (l, classe = 'couv-mini') => (l.vignette ? h('img', { class: classe, src: l.vignette, alt: '', loading: 'lazy' })
    : h('div', { class: 'tranche ' + classe, style: { '--couleur': couleurTranche(l.titre) } }, (l.titre || '?').charAt(0).toUpperCase()));
  const details = (l, sur = (x) => x) => [E.genres ? genreDe(l).join(' ') : null, l.auteur, l.editeur, l.annee].filter(Boolean).map((x) => sur(x));
  // ouvrir sans télécharger : le fichier passe par le relais et s'affiche dans un nouvel onglet (PDF à la bonne page, images, vidéos, textes)
  const AFFICHABLES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', txt: 'text/plain;charset=utf-8' };
  const typeAffichable = (l) => !l.lien && l.chemin && AFFICHABLES[(l.chemin.split('.').pop() || '').toLowerCase()];
  // Word, Excel, PowerPoint… : ouverts dans Nuage, avec son éditeur en ligne
  const BUREAUTIQUE = /\.(docx?|dotx|odt|rtf|xlsx?|xlsm|ods|csv|pptx?|ppsx|odp|odg)$/i;
  async function ouvrirDansNuage(l, lienN) {
    const w = window.open('', '_blank');
    if (w) { try { w.document.title = l.titre || 'Ouverture…'; w.document.body.innerHTML = '<p style="font:16px system-ui;margin:40px;color:#555">Ouverture de « ' + String(l.titre || '').replace(/[<&]/g, '') + ' » dans Nuage…</p>'; } catch { /* onglet protégé */ } }
    const p = analyserLien(lienN), dossier = '/' + l.chemin.split('/').slice(0, -1).join('/');
    let id = '';
    try { id = (await fonctionServeur('nuage', { action: 'info', lien: lienN, chemin: l.chemin })).id || ''; } catch { /* relais ancien ou indisponible : le dossier s'ouvre */ }
    const u = `${p.origine}/index.php/s/${p.jeton}?path=${encodeURIComponent(dossier)}&dir=${encodeURIComponent(dossier)}` + (id ? `&fileid=${id}&openfile=true` : '');
    if (w) w.location.href = u; else location.href = u;
  }
  async function ouvrirFichier(ev, l, page, adresse) {
    const type = typeAffichable(l), lienN = reglagesDe(l.proprietaire)[E.lien];
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1 || !analyserLien(lienN)) return;   // lien habituel
    if (!l.lien && l.chemin && BUREAUTIQUE.test(l.chemin)) { ev.preventDefault(); return ouvrirDansNuage(l, lienN); }
    if (!type) return;
    ev.preventDefault();
    const w = window.open('', '_blank');
    if (w) { try { w.document.title = l.titre || 'Ouverture…'; w.document.body.innerHTML = '<p style="font:16px system-ui;margin:40px;color:#555">Ouverture de « ' + String(l.titre || '').replace(/[<&]/g, '') + ' »…</p>'; } catch { /* onglet protégé */ } }
    try {
      const f = await nuageFichier(lienN, l.chemin);
      const url = URL.createObjectURL(new Blob([f], { type }));
      setTimeout(() => URL.revokeObjectURL(url), 30 * 60 * 1000);
      if (w) w.location.href = url + (page && type === 'application/pdf' ? '#page=' + page : ''); else location.href = url;
    } catch (e) {
      if (w) w.location.href = adresse; else erreur(e);    // relais indisponible : téléchargement habituel
    }
  }
  const boutonOuvrir = (l, classe = 'btn petit principal') => { const u = urlLivre(l); return u ? h('a', { class: classe, href: u, target: '_blank', rel: 'noopener', onclick: (ev) => ouvrirFichier(ev, l, null, u) }, 'Ouvrir') : h('span', { class: classe + ' desactive', title: `Renseignez le lien de partage de votre dossier « ${E.nomDossierNuage} » dans ⚙ Réglages Nuage` }, 'Ouvrir'); };
  function carteLivre(l, { lignes = null, termes = [] } = {}) {
    const sur = (x) => surligner(String(x), termes);
    const t = l.theme_id ? T.get(l.theme_id) : null;
    const meta = [];
    if (lignes || recherche) meta.push(t ? h('span', { class: 'chemin' }, chemin(t).flatMap((x, i) => [i ? ' › ' : '', h('a', { href: lienT(x) }, x.nom)])) : 'Non classé');
    if (l.pages) meta.push(pluriel(l.pages, 'page', 'pages'));
    if (l.sommaire?.length && !A_COMPLETER[l.source]) meta.push(pluriel(l.sommaire.length, 'entrée au sommaire', 'entrées au sommaire'));
    if (A_COMPLETER[l.source]) meta.push(h('span', { class: 'pastille-a-completer' }, A_COMPLETER[l.source] + (modif ? ' : à compléter' : '')));
    if (aMoi(l) && estPartage(l, 'livre_id')) meta.push('👥 partagé');
    if (avecEleves && aMoi(l) && estPublie('livre_id', l)) meta.push(h('span', { class: 'publie-eleves' }, '👁 élèves'));
    if (!aMoi(l)) meta.push('👤 ' + nomCollegue(l.proprietaire));
    let corps = null;
    if (lignes?.length) {
      const visibles = lignes.slice(0, 15), reste = lignes.length - visibles.length;
      const ol = h('ol', { class: 'sommaire-biblio' }, visibles.map((e) => ligneSommaire(l, e, termes)));
      corps = h('div', { class: 'extraits-biblio' }, ol, reste > 0 ? h('button', { class: 'lien petit', type: 'button', onclick: (ev) => { vider(ol, lignes.map((e) => ligneSommaire(l, e, termes))); ev.target.remove(); } }, `Voir ${pluriel(reste, 'autre passage', 'autres passages')}`) : null);
    }
    return h('article', { class: 'livre-biblio' },
      h('div', { class: 'livre-tete' },
        h('a', { class: 'lien-couv', href: lienL(l), tabindex: -1 }, couverture(l)),
        h('div', { class: 'livre-infos' },
          h('div', { class: 'livre-titre' }, h('a', { href: lienL(l) }, sur(l.titre || 'Sans titre'))),
          details(l).length ? h('div', { class: 'livre-details' }, details(l, sur).flatMap((x, i) => [i ? ' · ' : '', x])) : null,
          h('div', { class: 'livre-meta' }, meta.flatMap((x, i) => [i ? ' · ' : '', x]))),
        h('div', { class: 'actions-livre' },
          modif && aMoi(l) ? [h('button', { class: 'btn petit', onclick: () => modifierLivre(l) }, '✎ Modifier'), h('button', { class: 'btn petit danger', onclick: () => supprimerLivre(l) }, '✖')] : null,
          h('a', { class: 'btn petit', href: lienL(l) }, '☰ Sommaire'), boutonOuvrir(l))),
      corps);
  }
  const listeLivres = (liste, opts) => h('div', { class: 'livres-biblio' }, liste.map((l) => carteLivre(l, opts)));
  function ligneSommaire(l, e, termes = []) {
    const u = urlLivre(l, e.p);
    const corps = [h('span', {}, surligner(e.t, termes)), e.p ? h('span', { class: 'pg' }, 'p. ' + e.p) : null];
    return h('li', { class: 'niv-som' + (e.n || 0) }, u ? h('a', { href: u, target: '_blank', rel: 'noopener', title: e.p ? `Ouvrir le PDF à la page ${e.p}` : 'Ouvrir le fichier', onclick: (ev) => ouvrirFichier(ev, l, e.p, u) }, corps) : h('span', { class: 'sans-lien' }, corps));
  }
  function ficheLivre(l) {
    const t = l.theme_id ? T.get(l.theme_id) : null;
    const infos = [[E.genres ? 'Type' : '', E.genres ? genreDe(l).join(' ') : ''], ['Auteur', l.auteur], ['Éditeur', l.editeur], ['Année', l.annee], ['ISBN', l.isbn], ['Pages', l.pages || ''],
      [E.Theme, t ? chemin(t).map((x) => x.nom).join(' › ') : 'Non classé'], ['Fichier sur Nuage', l.chemin || (l.lien ? 'lien direct' : '—')]].filter(([a, v]) => a && v !== '' && v != null);
    const sav = l.savoirs || [];
    return h('div', { class: 'fiche-livre' },
      ariane(t, true),
      h('div', { class: 'grille-fiche-livre' },
        h('div', { class: 'col-couv' }, couverture(l, 'couv-grande'),
          h('div', { class: 'boutons-fiche' }, boutonOuvrir(l, 'btn principal'),
            aMoi(l) ? h('button', { class: 'btn' + (estPartage(l, 'livre_id') ? ' partage-actif' : ''), onclick: () => partagerUn('livre_id', l) }, estPartage(l, 'livre_id') ? '👥 Partagé' : '👥 Partager') : null,
            boutonEleves('livre_id', l, 'btn'),
            E.genres && aMoi(l) ? h('a', { class: 'btn', href: '#/qcm/l-' + l.id, title: 'Préparer un QCM à partir de ce document (avec une IA)' }, '📝 Créer un QCM') : null,
            aMoi(l) ? h('button', { class: 'btn', onclick: () => modifierLivre(l) }, '✎ Modifier') : null,
            h('button', { class: 'btn', onclick: () => envoyerPDF(documentPDF([l], { sommaire: true, savoirs: true, liens: true }, l.titre), 'pdf') }, '⬇ PDF'),
            !aMoi(l) ? h('button', { class: 'btn', onclick: () => copierLivre(l) }, '⧉ Copier dans mon espace') : null,
            aMoi(l) ? h('button', { class: 'btn danger', onclick: () => supprimerLivre(l) }, '✖ Supprimer la fiche') : null)),
        h('div', { class: 'col-infos' },
          h('h2', { class: 'titre-livre' }, l.titre || 'Sans titre'),
          !aMoi(l) ? h('p', { class: 'info-partage' }, `👤 Partagé par ${nomCollegue(l.proprietaire)} · consultation seule`) : null,
          h('dl', { class: 'infos-livre' }, infos.flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, String(b))])),
          sav.length || aMoi(l) ? h('div', { class: 'savoirs-cours' }, h('h3', {}, 'Savoirs associés'),
            sav.length ? sav.map((c) => h('div', { class: 'code' }, h('b', {}, c), h('span', {}, libSavoir(c)))) : h('p', { class: 'vide-sommaire' }, 'Aucun savoir associé.'),
            aMoi(l) ? h('button', { class: 'lien petit', type: 'button', onclick: () => choisirSavoirs(l) }, sav.length ? '✎ modifier' : '＋ choisir dans le référentiel') : null) : null,
          l.notes ? h('div', { class: 'notes-livre' }, h('h3', {}, 'Notes'), h('p', { class: 'pre' }, l.notes)) : null,
          h('div', { class: 'entete-bloc' }, h('h3', {}, 'Sommaire'),
            aMoi(l) && E.genres ? h('div', { class: 'boutons-detail' }, boutonIA(() => configIA(l), 'btn petit')) : null),
          A_COMPLETER[l.source] && !l.sommaire?.length ? h('p', { class: 'note' }, `${A_COMPLETER[l.source]} : aucun sommaire pour l’instant.`, aMoi(l) ? [' ', h('button', { class: 'lien petit', type: 'button', onclick: () => modifierLivre(l, 'sommaire') }, 'Compléter le sommaire')] : null) : null,
          !A_COMPLETER[l.source] && !l.sommaire?.length ? h('p', { class: 'vide-sommaire' }, 'Sommaire non renseigné.', aMoi(l) ? [' ', h('button', { class: 'lien petit', type: 'button', onclick: () => modifierLivre(l, 'sommaire') }, 'Le saisir')] : null) : null,
          l.source === 'page' ? h('p', { class: 'note' }, 'Sommaire lu dans le texte du fichier.') : null,
          l.sommaire?.length ? h('ol', { class: 'sommaire-biblio complet' }, l.sommaire.map((e) => ligneSommaire(l, e))) : null)));
  }

  // ------------------------------------------------------------------ recherche (titres, auteurs, éditeurs, sommaires)
  function surligner(texte, termes) {
    const t = String(texte ?? ''); if (!termes.length) return t;
    const s = sansAccent(t); if (s.length !== t.length) return t;
    const z = []; for (const m of termes) { let i = s.indexOf(m); while (i >= 0) { z.push([i, i + m.length]); i = s.indexOf(m, i + m.length); } }
    if (!z.length) return t; z.sort((a, b) => a[0] - b[0]);
    const out = []; let pos = 0;
    for (const [a, b] of z) { if (a < pos) continue; if (a > pos) out.push(t.slice(pos, a)); out.push(h('mark', {}, t.slice(a, b))); pos = b; }
    if (pos < t.length) out.push(t.slice(pos)); return out;
  }
  function resultats() {
    const T2 = sansAccent(recherche).split(/\s+/).filter(Boolean);
    const liste = (vue === 'mes' ? mesFiches() : sesLivres);
    const trouves = [];
    for (const l of liste) {
      const tete = sansAccent([l.titre, E.genres ? genreDe(l)[1] : '', l.auteur, l.editeur, l.isbn, l.notes, ...(l.savoirs || [])].join(' '));
      const lignes = (l.sommaire || []).filter((e) => { const s = sansAccent(e.t); return T2.every((m) => s.includes(m)); });
      const lignesUn = lignes.length ? lignes : (l.sommaire || []).filter((e) => { const s = sansAccent(e.t); return T2.some((m) => s.includes(m)); });
      const tout = sansAccent(tete + ' ' + (l.sommaire || []).map((e) => e.t).join(' '));
      if (!T2.every((m) => tout.includes(m))) continue;
      trouves.push({ l, lignes: lignesUn, score: (T2.every((m) => tete.includes(m)) ? 1000 : 0) + lignes.length * 10 + lignesUn.length });
    }
    trouves.sort((a, b) => b.score - a.score || compareTitres(a.l.titre, b.l.titre));
    const nl = trouves.reduce((s, x) => s + x.lignes.length, 0);
    return h('div', {}, h('p', { class: 'compte-recherche' }, trouves.length ? `${pluriel(trouves.length, E.fiche, E.fiches)} · ${pluriel(nl, 'passage', 'passages')} du sommaire` : 'Aucun résultat.'),
      h('div', { class: 'livres-biblio' }, trouves.map((x) => carteLivre(x.l, { lignes: x.lignes, termes: T2 }))));
  }

  // ------------------------------------------------------------------ gestion des thèmes / dossiers
  function selectTheme(choisi, { racine = 'Non classé', exclure = null } = {}) {
    const interdits = exclure ? new Set([exclure, ...descendants(exclure).map((t) => t.id)]) : new Set();
    const opts = [h('option', { value: '' }, racine)];
    const parcourir = (id, niv) => sousThemes(id, moi).filter((t) => !interdits.has(t.id)).forEach((t) => { opts.push(h('option', { value: t.id, selected: t.id === choisi }, '   '.repeat(niv) + (niv ? '↳ ' : '') + t.nom)); parcourir(t.id, niv + 1); });
    parcourir(null, 0);
    return h('select', { class: 'champ' }, opts);
  }
  async function nouveauTheme(parent) {
    const nom = h('input', { class: 'champ', placeholder: 'Ex. : ' + E.exempleTheme });
    const r = await fenetre(parent ? `Nouveau sous-${E.theme}` : `Nouveau ${E.theme}`, h('div', { class: 'formulaire' }, h('label', { class: 'large' }, 'Nom', nom),
      h('p', { class: 'aide' }, 'Créez aussi le dossier du même nom sur votre Nuage (le site retient ce chemin pour ouvrir le dossier et ranger les fichiers).')),
    [{ texte: 'Annuler', valeur: null }, { texte: 'Créer', classe: 'principal', action: () => { if (!nom.value.trim()) throw new Error('Donnez un nom.'); return nom.value.trim(); } }]);
    if (!r) return;
    const p = parent ? T.get(parent) : null;
    try {
      const t = await db.ajouter('biblio_themes', { espace: E.cle, parent_id: parent, nom: r, dossier: (p?.dossier ? p.dossier + '/' : '') + r, ordre: Math.max(0, ...sousThemes(parent, moi).map((x) => x.ordre)) + 1 });
      T.set(t.id, t); toast(`${E.Theme} créé`); dessiner();
    } catch (e) { erreur(e); }
  }
  async function modifierTheme(t) {
    const nom = h('input', { class: 'champ', value: t.nom });
    const dossier = h('input', { class: 'champ', value: t.dossier, placeholder: 'ex. ' + E.exempleDossier });
    const parent = selectTheme(t.parent_id, { racine: `Accueil (${E.theme} principal)`, exclure: t.id });
    let image = t.image;
    const apercu = h('div', { class: 'apercu-tuile', style: { backgroundImage: image ? `url("${image}")` : grainDeBois(t.nom) } });
    const fichier = h('input', { type: 'file', accept: 'image/*', onchange: async () => { try { image = await reduireImage(fichier.files[0], 520, 0.72); apercu.style.backgroundImage = `url("${image}")`; } catch (e) { erreur(e); } } });
    const ok = await fenetre(`Modifier le ${E.theme}`, h('div', { class: 'formulaire' },
      h('label', {}, 'Nom de la tuile', nom), h('label', {}, 'Ranger dans', parent),
      h('label', { class: 'large' }, 'Dossier sur Nuage (depuis le dossier partagé)', dossier),
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Image de la tuile'), apercu, fichier,
        h('button', { class: 'lien petit', type: 'button', onclick: () => { image = ''; apercu.style.backgroundImage = grainDeBois(nom.value); } }, 'Revenir au veinage bois'))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', valeur: true }], { large: true });
    if (!ok) return;
    try {
      const v = { nom: nom.value.trim() || t.nom, dossier: dossier.value.trim(), image, parent_id: parent.value ? Number(parent.value) : null };
      await db.modifier('biblio_themes', t.id, v); Object.assign(t, v); toast(`${E.Theme} enregistré`); dessiner();
    } catch (e) { erreur(e); }
  }
  async function supprimerTheme(t) {
    const d = descendants(t.id), n = total(t.id);
    if (!(await confirmer(`Supprimer le ${E.theme}`, `Supprimer le ${E.theme} « ${t.nom} »${d.length ? ` et ses ${d.length} sous-${E.theme}(s)` : ''} ? ${n ? `Ses ${n} ${E.fiche}(s) ne sont pas supprimés : ils passent dans « Non classés ». ` : ''}Les fichiers sur Nuage ne sont pas touchés.`, 'Supprimer'))) return;
    try { await db.supprimer('biblio_themes', t.id); [t, ...d].forEach((x) => T.delete(x.id)); [...L.values()].forEach((l) => { if (l.theme_id && !T.has(l.theme_id)) l.theme_id = null; }); toast(`${E.Theme} supprimé`); if (themeCourant?.id === t.id) location.hash = E.base; else dessiner(); }
    catch (e) { erreur(e); }
  }
  let glisse = null;
  function glisserTuile(el, t) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { glisse = t; e.dataTransfer.effectAllowed = 'move'; el.classList.add('glisse'); });
    el.addEventListener('dragend', () => { glisse = null; el.classList.remove('glisse'); });
    el.addEventListener('dragover', (e) => { if (glisse && glisse !== t && (glisse.parent_id ?? null) === (t.parent_id ?? null)) { e.preventDefault(); el.classList.add('cible'); } });
    el.addEventListener('dragleave', () => el.classList.remove('cible'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('cible'); if (!glisse || glisse === t) return;
      const f = sousThemes(t.parent_id ?? null, moi).filter((x) => x !== glisse); f.splice(f.indexOf(t), 0, glisse);
      try { for (const [i, x] of f.entries()) if (x.ordre !== i + 1) { await db.modifier('biblio_themes', x.id, { ordre: i + 1 }); x.ordre = i + 1; } } catch (er) { erreur(er); }
      dessiner();
    });
  }

  // ------------------------------------------------------------------ gestion des fiches
  async function supprimerLivre(l) {
    if (!(await confirmer('Supprimer la fiche', `Supprimer la fiche de « ${l.titre} » ? Le fichier sur votre Nuage n’est pas touché.`, 'Supprimer'))) return;
    try { await db.supprimer('biblio_livres', l.id); L.delete(l.id); toast('Fiche supprimée'); if (livreCourant?.id === l.id) location.hash = l.theme_id ? E.base + '/t-' + l.theme_id : E.base; else dessiner(); }
    catch (e) { erreur(e); }
  }
  async function copierLivre(l) {
    try {
      const { id, proprietaire, theme_id, partage_tous, cree_le, maj_le, ...reste } = l;
      const n = await db.ajouter('biblio_livres', { ...reste, theme_id: null, ordre: 1000 });
      L.set(n.id, n); toast('Copié dans votre espace (« Non classés »)'); location.hash = lienL(n);
    } catch (e) { erreur(e); }
  }
  const versTexte = (som) => (som || []).map((e) => '  '.repeat(e.n || 0) + e.t + (e.p ? ' … ' + e.p : '')).join('\n');
  async function modifierLivre(l, focus = '') {
    const ch = (v, ph = '') => h('input', { class: 'champ', value: v || '', placeholder: ph });
    const titre = ch(l.titre), auteur = ch(l.auteur), editeur = ch(l.editeur), annee = ch(l.annee), isbn = ch(l.isbn, '978…');
    const genre = h('select', { class: 'champ' }, Object.entries(GENRES).map(([k2, [ic, n]]) => h('option', { value: k2, selected: k2 === (l.genre || 'cours') }, `${ic} ${n}`)));
    const theme = selectTheme(l.theme_id), cheminF = ch(l.chemin, 'ex. ' + E.exempleChemin), lien = ch(l.lien, 'https://… (facultatif : remplace le chemin)');
    const notes = h('textarea', { class: 'champ', rows: 2 }); notes.value = l.notes || '';
    const som = h('textarea', { class: 'champ saisie-sommaire', rows: 10, placeholder: 'Chapitre 1 - Les bases … 12\n  1.1 Première partie … 14\nChapitre 2 - La suite … 35' }); som.value = versTexte(l.sommaire);
    let vignette = l.vignette, source = l.source, pages = l.pages, savoirsWord = [];
    const couv = h('div', { class: 'apercu-couv' }, couverture(l, 'couv-moyenne'));
    const majCouv = () => vider(couv, couverture({ ...l, vignette, titre: titre.value }, 'couv-moyenne'));
    const propositions = h('div', { class: 'propositions-isbn' });
    // fichier choisi sur l'ordinateur (PDF : couverture et sommaire ; Word : sommaire)
    let pdfLocal = null;
    const choixPdf = h('input', { type: 'file', accept: 'application/pdf,.pdf,.docx', onchange: async () => { if (choixPdf.files[0]) await lireFichier(choixPdf.files[0]).catch(erreur); } });
    async function lireFichier(f) {
      {
        if (/\.docx$/i.test(f.name)) {
          const w = await lireWord(f, ref); if (!w.nb) throw new Error('Aucun titre trouvé dans ce document Word (styles « Titre 1 », « Titre 2 »…).');
          som.value = versTexte(w.sommaire); source = 'word'; savoirsWord = w.savoirs; toast(`${w.nb} titres repris du fichier Word`);
        } else if (/\.pdf$/i.test(f.name)) { pdfLocal?.destroy?.(); pdfLocal = await ouvrirPdf(f); pages = pdfLocal.numPages; toast(`PDF lu : ${pdfLocal.numPages} pages`); }
        else throw new Error('Seuls les PDF et les fichiers Word (.docx) peuvent être lus.');
      }
    }
    const pageCouv = h('input', { class: 'champ court', type: 'number', min: 1, value: 1 });
    const debut = h('input', { class: 'champ court', type: 'number', min: 1, placeholder: 'de' }), fin = h('input', { class: 'champ court', type: 'number', min: 1, placeholder: 'à' });
    const decalage = h('input', { class: 'champ court', type: 'number', value: 0, title: 'Page du PDF − page imprimée (ex. 2 si la page imprimée 1 est la 3e page du PDF)' });
    const exigerPdf = () => { if (!pdfLocal) throw new Error('Lisez d’abord le fichier PDF (sur Nuage ou sur votre ordinateur).'); };
    const attente = fenetre(`Modifier « ${l.titre || E.fiche} »`, h('div', { class: 'modif-livre' },
      h('div', { class: 'formulaire' },
        h('label', { class: 'large' }, 'Titre', titre), E.genres ? h('label', {}, 'Type de document', genre) : null,
        h('label', {}, 'Auteur', auteur), h('label', {}, 'Éditeur', editeur), h('label', {}, 'Année', annee),
        h('label', {}, 'ISBN', h('span', { class: 'ligne-lien' }, isbn, h('button', { class: 'btn petit', type: 'button', onclick: () => chercherEnLigne() }, '🔎 Rechercher en ligne'))),
        h('div', { class: 'large' }, propositions),
        h('label', {}, 'Ranger dans', theme), h('label', {}, 'Fichier sur Nuage (chemin)', cheminF), h('label', { class: 'large' }, 'Lien direct', lien),
        h('label', { class: 'large' }, 'Notes', notes)),
      h('fieldset', { class: 'groupe-docs' }, h('legend', {}, 'Lire le fichier (couverture et sommaire)'),
        h('p', { class: 'aide' }, 'Facultatif : un PDF pour refaire la couverture ou lire le sommaire, un Word (.docx) pour reprendre ses titres. Le fichier est seulement lu, rien n’est modifié.'),
        h('div', { class: 'boutons-detail' },
          l.chemin && analyserLien(reglagesDe(l.proprietaire)[E.lien]) ? h('button', { class: 'btn petit principal', type: 'button', onclick: async (ev) => {
            const b = ev.currentTarget; b.disabled = true; const avant = b.textContent; b.textContent = 'Lecture sur Nuage…';
            try { await lireFichier(await nuageFichier(reglagesDe(l.proprietaire)[E.lien], cheminF.value.trim() || l.chemin)); } catch (e) { erreur(e); }
            b.disabled = false; b.textContent = avant;
          } }, '☁ Lire le fichier sur Nuage') : null,
          h('span', {}, 'ou sur cet ordinateur :'), choixPdf)),
      h('div', { class: 'deux-colonnes-partage' },
        h('div', {}, h('p', { class: 'sous-titre-choix' }, 'Couverture'), couv,
          h('div', { class: 'boutons-detail' }, h('span', {}, 'Page du PDF'), pageCouv, h('button', { class: 'btn petit', type: 'button', onclick: async () => { try { exigerPdf(); vignette = await imagePage(pdfLocal, Number(pageCouv.value) || 1); majCouv(); } catch (e) { erreur(e); } } }, 'Utiliser cette page')),
          h('label', { class: 'lib-form' }, 'Ou une image (photo, scan) ', h('input', { type: 'file', accept: 'image/*', onchange: async (e) => { try { vignette = await reduireImage(e.target.files[0], 260, 0.75); majCouv(); } catch (x) { erreur(x); } } })),
          vignette ? h('button', { class: 'lien petit', type: 'button', onclick: () => { vignette = ''; majCouv(); } }, 'Sans couverture') : null),
        h('div', {}, h('p', { class: 'sous-titre-choix' }, 'Sommaire'), h('p', { class: 'aide' }, 'Une ligne par titre, « … page » à la fin ; deux espaces devant pour un sous-titre.'), som,
          h('div', { class: 'boutons-detail' },
            h('button', { class: 'btn petit', type: 'button', onclick: async () => { try { exigerPdf(); const s = await signetsPdf(pdfLocal); if (!s.length) throw new Error('Ce PDF n’a pas de signets.'); som.value = versTexte(s); source = 'signets'; } catch (e) { erreur(e); } } }, 'Signets du PDF'),
            h('span', {}, 'Pages du sommaire'), debut, fin, h('span', {}, 'décalage'), decalage,
            h('button', { class: 'btn petit', type: 'button', onclick: async () => { try { exigerPdf(); const d = Number(debut.value) || 1, f2 = Number(fin.value) || d; const lg = await textePages(pdfLocal, d, f2); if (!lg.length) throw new Error('Aucun texte : PDF scanné (saisissez le sommaire à la main).'); som.value = versTexte(sommaireDepuisTexte(lg, Number(decalage.value) || 0)); source = 'page'; } catch (e) { erreur(e); } } }, 'Lire ces pages'))))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', valeur: true }], { large: true });
    async function chercherEnLigne() {
      vider(propositions, h('p', { class: 'aide' }, 'Recherche…'));
      try {
        const q = isbn.value.replace(/[^0-9Xx]/g, '') ? 'isbn:' + isbn.value.replace(/[^0-9Xx]/g, '') : [titre.value && 'intitle:' + titre.value, auteur.value && 'inauthor:' + auteur.value].filter(Boolean).join('+');
        if (!q) throw new Error('Saisissez un ISBN, un titre ou un auteur.');
        const r = await fetch('https://www.googleapis.com/books/v1/volumes?maxResults=5&q=' + encodeURIComponent(q)).then((x) => x.json());
        const items = (r.items || []).map((x) => x.volumeInfo);
        if (!items.length) { vider(propositions, h('p', { class: 'aide' }, 'Rien trouvé.')); return; }
        vider(propositions, items.map((v) => h('div', { class: 'proposition' },
          v.imageLinks?.thumbnail ? h('img', { src: v.imageLinks.thumbnail.replace('http:', 'https:'), alt: '' }) : null,
          h('div', {}, h('b', {}, v.title + (v.subtitle ? ' – ' + v.subtitle : '')), h('small', {}, [(v.authors || []).join(', '), v.publisher, v.publishedDate].filter(Boolean).join(' · ')),
            h('button', { class: 'btn petit', type: 'button', onclick: () => {
              titre.value = v.title + (v.subtitle ? ' – ' + v.subtitle : ''); auteur.value = (v.authors || []).join(', '); editeur.value = v.publisher || ''; annee.value = (v.publishedDate || '').slice(0, 4);
              const i13 = (v.industryIdentifiers || []).find((x) => x.type === 'ISBN_13') || (v.industryIdentifiers || [])[0]; if (i13) isbn.value = i13.identifier;
              if (v.imageLinks?.thumbnail && (!vignette || confirm('Remplacer aussi la couverture par celle trouvée en ligne ?'))) { vignette = v.imageLinks.thumbnail.replace('http:', 'https:'); majCouv(); }
            } }, 'Utiliser')))));
      } catch (e) { vider(propositions, h('p', { class: 'erreur-ia' }, 'Recherche impossible : ' + e.message)); }
    }
    if (focus === 'sommaire') setTimeout(() => som.focus(), 100);
    const ok = await attente;
    if (!ok) { pdfLocal?.destroy?.(); return false; }
    const sommaire = source === 'word' || source === 'ia' ? som.value.split('\n').filter((x) => x.trim()).map((x) => ({ t: x.trim(), p: null, n: Math.min(4, (x.match(/^\s*/)[0].length / 2) | 0) })) : sommaireDepuisTexte(som.value.split('\n'));
    if (sommaire.length && A_COMPLETER[source]) source = 'saisi';
    const ordre = ref.savoirs.map((s) => s.code);
    const v = { titre: titre.value.trim() || l.titre, auteur: auteur.value.trim(), editeur: editeur.value.trim(), annee: annee.value.trim(), isbn: isbn.value.trim(),
      theme_id: theme.value ? Number(theme.value) : null, chemin: cheminF.value.trim(), lien: lien.value.trim(), notes: notes.value.trim(), vignette, sommaire, source, pages };
    if (E.genres) v.genre = genre.value;
    if (savoirsWord.length) v.savoirs = [...new Set([...(l.savoirs || []), ...savoirsWord])].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
    try { await db.modifier('biblio_livres', l.id, v); Object.assign(l, v); toast('Fiche enregistrée'); dessiner(); } catch (e) { erreur(e); }
    pdfLocal?.destroy?.();
    return true;
  }
  async function choisirSavoirs(l) {
    const choix = new Set(l.savoirs || []);
    const corps = h('div', { class: 'liste-choix' }, ref.savoirs.map((s) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(s.code), onchange: (e) => (e.target.checked ? choix.add(s.code) : choix.delete(s.code)) }), h('b', {}, s.code), ' ', s.libelle)));
    if (!(await fenetre('Savoirs associés', corps, [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true }))) return;
    const ordre = ref.savoirs.map((s) => s.code), v = [...choix].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
    try { await db.modifier('biblio_livres', l.id, { savoirs: v }); l.savoirs = v; dessiner(); } catch (e) { erreur(e); }
  }
  // ajouter des fiches : fichiers choisis sur l'ordinateur → fiches (PDF : pages, signets, couverture ; Word : titres, savoirs)
  async function ajouterLivres(themeId) {
    const lienN = reglage[E.lien], avecNuage = !!analyserLien(lienN);
    const fichiers = h('input', { type: 'file', multiple: true });
    const theme = selectTheme(themeId);
    const lire = h('input', { type: 'checkbox', checked: true });
    // choix dans Nuage : fichiers du dossier du thème (et de ses sous-dossiers) qui n'ont pas encore de fiche
    const choisisN = new Set();
    const zoneN = h('div', { class: 'choix-dossier arbre-pdf choix-nuage' });
    let listeN = null, visiblesN = [];
    const connus = new Set(mesFiches().map((l) => l.chemin.normalize('NFC')));
    const dessinerN = () => {
      if (!listeN) return;
      const t = theme.value ? T.get(Number(theme.value)) : null, pfx = t?.dossier ? t.dossier.normalize('NFC') + '/' : '';
      const l = visiblesN = listeN.filter((x) => !x.dossier && x.c.startsWith(pfx) && !connus.has(x.c) && !/(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c));
      vider(zoneN, l.length ? l.map((x) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choisisN.has(x.c), onchange: (e) => (e.target.checked ? choisisN.add(x.c) : choisisN.delete(x.c)) }),
        x.c.slice(pfx.length))) : h('p', { class: 'aide' }, pfx ? `Aucun nouveau fichier dans le dossier « ${t.dossier} » sur Nuage.` : 'Aucun fichier sans fiche sur Nuage.'));
    };
    const chargerN = async () => {
      vider(zoneN, h('p', { class: 'aide' }, 'Lecture de votre Nuage…'));
      try { listeN = await nuageListe(lienN); dessinerN(); } catch (e) { vider(zoneN, h('p', { class: 'erreur-ia' }, e.message)); }
    };
    theme.addEventListener('change', dessinerN);
    if (avecNuage) setTimeout(chargerN, 50);
    const ok = await fenetre(E.ajouter, h('div', { class: 'formulaire' },
      h('label', {}, `Ranger dans le ${E.theme}`, theme),
      h('label', { class: 'case' }, lire, ' Lire les PDF et les Word (sommaire, couverture)'),
      avecNuage ? h('div', { class: 'large' }, h('p', { class: 'sous-titre-choix' }, `☁ Dans mon Nuage (fichiers du ${E.theme} choisi qui n’ont pas encore de fiche)`), zoneN,
        h('div', { class: 'boutons-detail' }, h('button', { class: 'btn petit', type: 'button', onclick: () => { visiblesN.forEach((x) => choisisN.add(x.c)); dessinerN(); } }, 'Tout cocher'),
          h('a', { class: 'btn petit', href: accueilNuage(lienN), target: '_blank', rel: 'noopener' }, '📂 Ouvrir mon Nuage'))) :
        h('p', { class: 'aide large' }, `Pour choisir les fichiers directement dans votre Nuage, collez le lien de partage de votre dossier « ${E.nomDossierNuage} » dans « ⚙ Réglages Nuage ».`),
      h('label', { class: 'large' }, avecNuage ? '💻 Ou sur cet ordinateur' : 'Fichiers (tous types)', fichiers),
      h('p', { class: 'aide large' }, 'Le site crée une fiche par fichier et lit les PDF (pages, sommaire, couverture) et les Word (titres) ; rien n’est modifié sur votre Nuage.')),
    [{ texte: 'Annuler', valeur: false }, { texte: '＋ Créer les fiches', classe: 'principal', action: () => { if (!fichiers.files.length && !choisisN.size) throw new Error('Choisissez au moins un fichier.'); return true; } }], { large: true });
    if (!ok) return;
    const t = theme.value ? T.get(Number(theme.value)) : null;
    const tailles = new Map((listeN || []).map((x) => [x.c, x.taille]));
    const parDossier = new Map([...T.values()].filter(aMoi).map((x) => [x.dossier.normalize('NFC'), x]));
    await creerFiches([
      ...[...choisisN].map((c) => ({ chemin: c, taille: tailles.get(c), charger: () => nuageFichier(lienN, c), themeId: parDossier.get(c.split('/').slice(0, -1).join('/'))?.id ?? t?.id ?? null })),
      ...[...fichiers.files].map((f) => ({ f, chemin: ((t?.dossier ? t.dossier + '/' : '') + f.name).normalize('NFC'), themeId: t?.id ?? null })),
    ], lire.checked);
  }
  async function creerFiches(liste, lireFichiers) {
    const pr = progression('Création des fiches'); let n = 0;
    try {
      for (const [i, x] of liste.entries()) {
        pr.maj(i, liste.length, x.chemin.split('/').pop());
        const nom = x.chemin.split('/').pop(), titre = nom.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
        let info = { pages: null, sommaire: [], source: '', vignette: '', savoirs: [] };
        const aLire = lireFichiers && /\.(pdf|docx)$/i.test(nom) && (x.f || x.charger) && !(x.taille > 80 * 1024 * 1024);
        let f = null;
        if (aLire) { try { f = x.f || await x.charger(); } catch { info = { ...info, source: /\.pdf$/i.test(nom) ? 'erreur' : '' }; } }
        if (f && /\.pdf$/i.test(nom)) { try { info = { ...info, ...(await lirePdf(f)) }; } catch { info = { ...info, source: 'erreur' }; } }
        if (f && /\.docx$/i.test(nom)) { try { const w = await lireWord(f, ref); info = { ...info, sommaire: w.sommaire, savoirs: w.savoirs, source: 'word' }; } catch { /* Word illisible */ } }
        const dossierParent = x.chemin.split('/').slice(-2, -1)[0] || '';
        const v = { espace: E.cle, theme_id: x.themeId, titre: info.titreMeta && info.titreMeta.length > 3 && !/^microsoft|untitled|sans titre/i.test(info.titreMeta) ? info.titreMeta : titre,
          chemin: x.chemin, pages: info.pages, sommaire: info.sommaire, source: info.source, vignette: info.vignette, savoirs: info.savoirs || [], ordre: 1000 + i };
        if (E.genres) v.genre = (/corrig/i.test(titre) && 'corrige') || genreDepuisNom(dossierParent) || genreDepuisNom(titre) || 'cours';
        const l = await db.ajouter('biblio_livres', v);
        L.set(l.id, l); n++;
      }
    } catch (e) { erreur(e); }
    pr.fin(); toast(`${n} fiche(s) créée(s)`); dessiner(); verifierNuage();
  }

  // ------------------------------------------------------------------ mise à jour depuis le dossier synchronisé
  // le contenu du dossier « Mes cours » / « Bibliothèque » : directement sur Nuage (relais), sinon un dossier de l'ordinateur
  async function lireDossierNuage() {
    const lienN = reglage[E.lien];
    if (!analyserLien(lienN)) {
      const choix = await fenetre('Mettre à jour depuis mon dossier', h('div', {},
        h('p', {}, `Pour que le site lise directement votre dossier « ${E.nomDossierNuage} » sur Nuage, collez d’abord son lien de partage dans « ⚙ Réglages Nuage ».`)),
      [{ texte: 'Annuler', valeur: null }, { texte: '💻 Choisir un dossier sur cet ordinateur', valeur: 'local' }, { texte: '⚙ Réglages Nuage', classe: 'principal', valeur: 'reglages' }]);
      if (choix === 'reglages') dialogueReglages(ctx, recharger);
      return choix === 'local' ? lireDossierLocal() : null;
    }
    const pr = progression(`Lecture de votre dossier « ${E.nomDossierNuage} » sur Nuage…`);
    try {
      const l = await nuageListe(lienN, { force: true });
      pr.fin();
      return l.filter((x) => !x.dossier).map((x) => ({ c: x.c, taille: x.taille, charger: () => nuageFichier(lienN, x.c) }));
    } catch (e) {
      pr.fin();
      const choix = await fenetre('Lecture de Nuage impossible', h('div', {}, h('p', { class: 'erreur-ia' }, e.message),
        h('p', { class: 'aide' }, 'Le relais « nuage » doit être installé une fois dans Supabase par l’administrateur (voir l’aide, « Mes ressources »). En attendant, vous pouvez choisir un dossier sur cet ordinateur.')),
      [{ texte: 'Annuler', valeur: null }, { texte: '💻 Choisir un dossier sur cet ordinateur', classe: 'principal', valeur: 'local' }]);
      return choix === 'local' ? lireDossierLocal() : null;
    }
  }
  async function lireDossierLocal() {
    toast(`Choisissez votre dossier « ${E.nomDossierNuage} »`);
    const tous = await choisirDossier();
    if (!tous.length) return null;
    // dossier « Livres » choisi directement : les chemins enregistrés commencent par « Livres/ »
    const racineChoisie = String(tous[0].webkitRelativePath || '').split('/')[0];
    const prefixe = racineChoisie === 'Livres' && mesFiches().some((l) => l.chemin.startsWith('Livres/')) ? 'Livres/' : '';
    return tous.map((f) => ({ c: prefixe + cheminRelatif(f), f, taille: f.size, charger: async () => f }));
  }
  async function mettreAJour() {
    const lus = await lireDossierNuage();
    if (!lus) return;
    let fichiers = lus.filter((x) => x.c && !ignore(x.c));
    // les images de tuiles « illustration.* » ne sont pas des fiches
    const images = new Map(fichiers.filter((x) => /(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c)).map((x) => [x.c.split('/').slice(0, -1).join('/'), x]));
    fichiers = fichiers.filter((x) => !/(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c) && !/\.(html?|js|py|bat|command|sh|ini|db|tmp|lnk)$/i.test(x.c));
    const mesT = [...T.values()].filter(aMoi), parDossier = new Map(mesT.map((t) => [t.dossier.normalize('NFC'), t]));
    const connus = new Set(mesFiches().map((l) => l.chemin.normalize('NFC')));
    const nouveaux = fichiers.filter((x) => !connus.has(x.c));
    const presents = new Set(fichiers.map((x) => x.c));
    const disparus = mesFiches().filter((l) => l.chemin && !presents.has(l.chemin.normalize('NFC')));
    const dossiers = [...new Set(nouveaux.map((x) => x.c.split('/').slice(0, -1).join('/')).filter(Boolean))];
    const aCreer = [...new Set(dossiers.flatMap((d) => d.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))))].filter((d) => d !== 'Livres' && !parDossier.has(d)).sort();
    const lire = h('input', { type: 'checkbox', checked: true }), retirer = h('input', { type: 'checkbox' });
    const ok = await fenetre('Mettre à jour depuis mon dossier', h('div', {},
      h('p', {}, `Dossier lu : ${pluriel(fichiers.length, 'fichier', 'fichiers')}.`),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, pluriel(nouveaux.length, 'nouveau fichier', 'nouveaux fichiers')), nouveaux.length ? ' : ' + nouveaux.slice(0, 8).map((x) => x.c.split('/').pop()).join(', ') + (nouveaux.length > 8 ? '…' : '') : ''),
        h('li', {}, h('b', {}, pluriel(aCreer.length, 'nouveau ' + E.theme, 'nouveaux ' + E.themes)), aCreer.length ? ' : ' + aCreer.slice(0, 8).map((d) => d.split('/').pop()).join(', ') : ''),
        h('li', {}, h('b', {}, pluriel(disparus.length, 'fiche dont le fichier est introuvable', 'fiches dont le fichier est introuvable')), disparus.length ? ' : ' + disparus.slice(0, 6).map((l) => l.titre).join(', ') : '')),
      nouveaux.length ? h('label', { class: 'case' }, lire, ' Lire les nouveaux PDF et Word (sommaire, couverture) — plus long') : null,
      disparus.length ? h('label', { class: 'case' }, retirer, ' Supprimer les fiches dont le fichier est introuvable') : null,
      h('p', { class: 'aide' }, 'Seuls les noms des fichiers et dossiers sont lus (et les nouveaux PDF et Word, si coché), en lecture seule : rien n’est modifié sur votre Nuage.')),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Mettre à jour', classe: 'principal', valeur: true }]);
    if (!ok) return;
    try {
      for (const d of aCreer) {
        const parts = d.split('/'), nom = parts.pop().replace(/^\d+\s*-\s*/, ''), parentD = parts.join('/');
        const parent = parDossier.get(parentD) || null;
        const ordre = Math.max(0, ...sousThemes(parent?.id ?? null, moi).map((x) => x.ordre)) + 1;
        let image = '';
        if (images.has(d)) { try { image = await reduireImage(await images.get(d).charger(), 520, 0.72); } catch { /* image illisible */ } }
        const t = await db.ajouter('biblio_themes', { espace: E.cle, parent_id: parent?.id ?? null, nom, dossier: d, ordre, image });
        T.set(t.id, t); parDossier.set(d, t);
      }
      if (retirer.checked) for (const l of disparus) { await db.supprimer('biblio_livres', l.id); L.delete(l.id); }
    } catch (e) { erreur(e); }
    await creerFiches(nouveaux.map((x) => ({ f: x.f, charger: x.charger, taille: x.taille, chemin: x.c, themeId: parDossier.get(x.c.split('/').slice(0, -1).join('/'))?.id ?? null })), lire.checked);
  }

  // ------------------------------------------------------------------ publication pour les élèves
  async function publierEleves(cle, x) {
    const actuelles = pubsDe(cle, x.id), promos = [...ctx.promotions].sort((a, b) => b.annee_debut - a.annee_debut);
    const cases = new Map(promos.map((p) => [p.id, h('input', { type: 'checkbox', checked: actuelles.some((y) => y.promotion_id === p.id) || (!actuelles.length && p.id === ctx.promo?.id) })]));
    const date = h('input', { class: 'champ', type: 'date', value: actuelles[0]?.a_partir_de || '' });
    const herite = cle === 'livre_id' ? publieHerite(x) : null;
    const nom = cle === 'theme_id' ? `le dossier « ${x.nom} »` : `« ${x.titre} »`;
    const ok = await fenetre(`Publier ${nom} aux élèves`, h('div', { class: 'formulaire' },
      h('p', { class: 'aide large' }, cle === 'theme_id'
        ? 'Les élèves des promotions cochées verront dans « Mes documents » tous les documents de ce dossier et de ses sous-dossiers, y compris ceux ajoutés plus tard. Ils les ouvrent et les téléchargent ; ils ne voient jamais l’adresse de votre Nuage.'
        : 'Les élèves des promotions cochées verront ce document dans « Mes documents » (titre, type, sommaire, savoirs) et pourront l’ouvrir et le télécharger. Ils ne voient jamais l’adresse de votre Nuage.'),
      herite ? h('p', { class: 'info-partage large' }, `👁 Déjà visible par le dossier « ${herite.nom} ».`) : null,
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Promotions'), h('div', { class: 'liste-choix' }, promos.map((p) => h('label', { class: 'option' }, cases.get(p.id), 'Promotion ' + p.libelle)))),
      h('label', {}, 'Visible à partir du (facultatif)', date)),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', valeur: true }], { large: true });
    if (!ok) return;
    try {
      const voulues = promos.filter((p) => cases.get(p.id).checked).map((p) => p.id);
      for (const p of actuelles) if (!voulues.includes(p.promotion_id) || (p.a_partir_de || '') !== date.value) await db.supprimer('publications_eleves', p.id);
      const reste = (C.publications = (C.publications || []).filter((p) => !(p[cle] === x.id && (!voulues.includes(p.promotion_id) || (p.a_partir_de || '') !== date.value))));
      const ajout = voulues.filter((pid) => !reste.some((p) => p[cle] === x.id && p.promotion_id === pid)).map((pid) => ({ [cle]: x.id, promotion_id: pid, a_partir_de: date.value || null }));
      if (ajout.length) C.publications.push(...(await db.ajouter('publications_eleves', ajout)));
      toast(voulues.length ? 'Visible des élèves' : 'Retiré de l’espace élèves'); dessiner();
    } catch (e) { erreur(e); }
  }

  // ------------------------------------------------------------------ partage
  async function enregistrerPartage(cle, x, r) {
    if (r.tous !== x.partage_tous) { await db.modifier(cle === 'theme_id' ? 'biblio_themes' : 'biblio_livres', x.id, { partage_tous: r.tous }); x.partage_tous = r.tous; }
    const avant = partagesDe(cle, x.id), voulus = new Set(r.qui);
    for (const p of avant) if (!voulus.has(p.destinataire)) await db.supprimer('biblio_partages', p.id);
    const ajout = [...voulus].filter((u) => !avant.some((p) => p.destinataire === u)).map((u) => ({ [cle]: x.id, destinataire: u }));
    const nouveaux = ajout.length ? await db.ajouter('biblio_partages', ajout) : [];
    C.partages = P().filter((p) => !(p[cle] === x.id && !voulus.has(p.destinataire))).concat(nouveaux);
  }
  async function partagerUn(cle, x) {
    const nom = cle === 'theme_id' ? `le ${E.theme} « ${x.nom} »` : `« ${x.titre} »`;
    const r = await dialoguePartage(`Partager ${nom}`, cle === 'theme_id'
      ? `Les collègues choisis verront ce ${E.theme}, ses sous-${E.themes} et toutes leurs fiches (y compris celles ajoutées plus tard), en consultation. Pour ouvrir les fichiers, ils utilisent le lien de partage de votre dossier « ${E.nomDossierNuage} » sur Nuage.`
      : `Les collègues choisis verront cette fiche (sommaire, couverture) en consultation. Pour ouvrir le fichier, ils utilisent le lien de partage de votre dossier « ${E.nomDossierNuage} » sur Nuage.`,
    { tous: x.partage_tous, qui: partagesDe(cle, x.id).map((p) => p.destinataire), moi });
    if (!r) return;
    try { await enregistrerPartage(cle, x, r); toast(r.tous || r.qui.length ? 'Partage enregistré' : 'De nouveau privé'); dessiner(); } catch (e) { erreur(e); }
  }
  async function partagerLot() {
    const coches = new Set();
    const boite = h('div', { class: 'choix-dossier arbre-pdf' });
    const dessinerArbre = () => {
      const ligneL = (l, prof) => h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: coches.has('l' + l.id), onchange: (e) => { e.target.checked ? coches.add('l' + l.id) : coches.delete('l' + l.id); } }), (E.genres ? genreDe(l)[0] : E.iconeFiche) + ' ', l.titre,
        estPartage(l, 'livre_id') ? h('small', { class: 'deja-partage' }, ' 👥') : null);
      const ligneT = (t, prof) => [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: coches.has('t' + t.id), onchange: (e) => { e.target.checked ? coches.add('t' + t.id) : coches.delete('t' + t.id); } }), '📁 ', h('b', {}, t.nom), h('small', { class: 'gris' }, ` (${E.theme} entier, ${total(t.id)} ${E.fiche}(s))`),
        estPartage(t, 'theme_id') ? h('small', { class: 'deja-partage' }, ' 👥') : null),
      ...sousThemes(t.id, moi).flatMap((s) => ligneT(s, prof + 1)), ...livresDe(t.id).map((l) => ligneL(l, prof + 1))];
      vider(boite, sousThemes(null, moi).flatMap((t) => ligneT(t, 0)), livresDe(null, moi).map((l) => ligneL(l, 0)));
    };
    dessinerArbre();
    const qui = new Set(), tous = h('input', { type: 'checkbox' });
    const autres = (await chargerCollegues()).filter((c) => c.id !== moi);
    const mode = h('select', { class: 'champ' }, h('option', { value: 'ajouter' }, 'Ajouter ces collègues (garder les partages existants)'), h('option', { value: 'retirer' }, 'Retirer ces collègues'),
      h('option', { value: 'remplacer' }, 'Partager uniquement avec eux (remplacer)'), h('option', { value: 'prive' }, 'Rendre privé (retirer tous les partages)'));
    const ok = await fenetre(`Partager des ${E.fiches}`, h('div', { class: 'partage-lot' },
      h('p', { class: 'aide' }, `Cochez une ou plusieurs fiches, ou des ${E.themes} entiers, puis les collègues. Ils consultent les fiches et ouvrent les fichiers par le lien de partage de votre dossier « ${E.nomDossierNuage} » ; ils ne modifient rien.`),
      h('div', { class: 'deux-colonnes-partage' },
        h('div', {}, h('p', { class: 'sous-titre-choix' }, `1. Les ${E.fiches}`),
          h('div', { class: 'boutons-detail' }, h('button', { class: 'btn petit', type: 'button', onclick: () => { [...T.values()].filter(aMoi).filter((t) => !t.parent_id).forEach((t) => coches.add('t' + t.id)); livresDe(null, moi).forEach((l) => coches.add('l' + l.id)); dessinerArbre(); } }, 'Tout cocher'),
            h('button', { class: 'btn petit', type: 'button', onclick: () => { coches.clear(); dessinerArbre(); } }, 'Tout décocher')), boite),
        h('div', {}, h('p', { class: 'sous-titre-choix' }, '2. Les collègues'),
          h('label', { class: 'option tous' }, tous, h('b', {}, 'Toute l’équipe')),
          h('div', { class: 'liste-choix' }, autres.map((c) => h('label', { class: 'option' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? qui.add(c.id) : qui.delete(c.id)) }), c.nom))),
          h('p', { class: 'sous-titre-choix' }, '3. Action'), mode))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Appliquer', classe: 'principal', action: () => {
      if (!coches.size) throw new Error(`Cochez au moins une fiche ou un ${E.theme}.`);
      if (mode.value !== 'prive' && !qui.size && !tous.checked) throw new Error('Cochez au moins un collègue (ou « Toute l’équipe »).');
      return true;
    } }], { large: true });
    if (!ok) return;
    try {
      for (const c of coches) {
        const cle = c[0] === 't' ? 'theme_id' : 'livre_id', x = (c[0] === 't' ? T : L).get(Number(c.slice(1)));
        if (!x) continue;
        const actuels = new Set(partagesDe(cle, x.id).map((p) => p.destinataire)), m = mode.value;
        const voulus = m === 'ajouter' ? [...new Set([...actuels, ...qui])] : m === 'retirer' ? [...actuels].filter((u) => !qui.has(u)) : m === 'remplacer' ? [...qui] : [];
        const tousV = m === 'ajouter' ? (tous.checked || x.partage_tous) : m === 'retirer' ? (tous.checked ? false : x.partage_tous) : m === 'remplacer' ? tous.checked : false;
        await enregistrerPartage(cle, x, { tous: tousV, qui: voulus });
      }
      toast('Partages enregistrés');
    } catch (e) { erreur(e); }
    dessiner();
  }

  // ------------------------------------------------------------------ PDF / impression (liste et sommaires)
  async function dialoguePDF(depuis = null) {
    const racines = vue === 'mes' ? { th: sousThemes(null, moi), li: livresDe(null, moi) }
      : { th: [...T.values()].filter((t) => !aMoi(t) && (!t.parent_id || !T.has(t.parent_id))), li: [...L.values()].filter((l) => !aMoi(l) && (!l.theme_id || !T.has(l.theme_id))) };
    const base = depuis ? { th: [depuis], li: [] } : racines;
    const coches = new Set();
    const toutDe = (t) => [t, ...descendants(t.id)].flatMap((x) => livresDe(x.id)).map((l) => l.id);
    base.th.forEach((t) => toutDe(t).forEach((id) => coches.add(id))); base.li.forEach((l) => coches.add(l.id));
    const boite = h('div', { class: 'choix-dossier arbre-pdf' });
    const dessinerArbre = () => {
      const ligneL = (l, prof) => h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: coches.has(l.id), onchange: (e) => { e.target.checked ? coches.add(l.id) : coches.delete(l.id); } }), (E.genres ? genreDe(l)[0] : E.iconeFiche) + ' ', l.titre);
      const ligneT = (t, prof) => [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: toutDe(t).length > 0 && toutDe(t).every((id) => coches.has(id)), onchange: (e) => { toutDe(t).forEach((id) => (e.target.checked ? coches.add(id) : coches.delete(id))); dessinerArbre(); } }), '📁 ', h('b', {}, t.nom)),
        ...sousThemes(t.id).flatMap((s) => ligneT(s, prof + 1)), ...livresDe(t.id).map((l) => ligneL(l, prof + 1))];
      vider(boite, base.th.flatMap((t) => ligneT(t, 0)), base.li.map((l) => ligneL(l, 0)));
    };
    dessinerArbre();
    const optSommaire = h('input', { type: 'checkbox', checked: true }), optSavoirs = h('input', { type: 'checkbox', checked: true }), optLiens = h('input', { type: 'checkbox', checked: true });
    const mode = await fenetre('PDF / impression', h('div', { class: 'dialogue-pdf-cours' },
      h('div', { class: 'boutons-detail' },
        h('button', { class: 'btn petit', type: 'button', onclick: () => { base.th.forEach((t) => toutDe(t).forEach((id) => coches.add(id))); base.li.forEach((l) => coches.add(l.id)); dessinerArbre(); } }, 'Tout cocher'),
        h('button', { class: 'btn petit', type: 'button', onclick: () => { coches.clear(); dessinerArbre(); } }, 'Tout décocher')),
      boite,
      h('div', { class: 'options-pdf' }, h('b', {}, 'Contenu : '), h('label', { class: 'case' }, optSommaire, ' sommaires'), h('label', { class: 'case' }, optSavoirs, ' savoirs associés'), h('label', { class: 'case' }, optLiens, ' liens vers les fichiers')),
      h('p', { class: 'aide' }, 'Sans les sommaires, le PDF est une liste sous forme de tableau.')),
    [{ texte: 'Annuler', valeur: null }, { texte: '🖶  Imprimer', valeur: 'imprimer' }, { texte: '⬇  Télécharger le PDF', classe: 'principal', valeur: 'pdf' }], { large: true });
    if (!mode) return;
    const choisis = [];
    const parcourir = (t) => { livresDe(t.id).forEach((l) => { if (coches.has(l.id)) choisis.push(l); }); sousThemes(t.id).forEach(parcourir); };
    base.th.forEach(parcourir); base.li.forEach((l) => { if (coches.has(l.id)) choisis.push(l); });
    if (!choisis.length) { toast('Aucune fiche cochée', 'erreur'); return; }
    envoyerPDF(documentPDF(choisis, { sommaire: optSommaire.checked, savoirs: optSavoirs.checked, liens: optLiens.checked }, depuis ? depuis.nom : ''), mode);
  }
  function documentPDF(liste, opt, titreDoc) {
    const proprios = [...new Set(liste.map((l) => l.proprietaire))];
    const auteur = proprios.length === 1 ? (proprios[0] === moi ? (ctx.enseignants.find((e) => e.profil_id === moi)?.nom || nomCollegue(moi)) : nomCollegue(proprios[0])) : 'Plusieurs enseignants';
    const cheminTexte = (l) => (l.theme_id && T.get(l.theme_id) ? chemin(T.get(l.theme_id)).map((x) => x.nom).join(' › ') : '');
    const nom = E.titre.replace(/^\S+\s+/, '');
    const blocs = [
      { t: 'titre', texte: (titreDoc || nom).toUpperCase(), sous: auteur, couleur: '#1E8F86' },
      { t: 'infos', paires: [['Enseignant', auteur], ['Édité le', new Date().toLocaleDateString('fr-FR')], [E.Fiches, String(liste.length)]] },
    ];
    const lignes = []; let grp = null;
    for (const l of liste) {
      const g = cheminTexte(l) || 'Non classés';
      if (g !== grp) { grp = g; lignes.push({ groupe: g }); }
      const cell = [l.titre || 'Sans titre', E.genres ? genreDe(l)[1] : [l.auteur, l.annee].filter(Boolean).join(', ')];
      if (!opt.sommaire) cell.push(String((l.sommaire || []).length || '—'));
      if (opt.savoirs) cell.push((l.savoirs || []).join(', '));
      if (opt.liens) cell.push(urlLivre(l));
      lignes.push(cell);
    }
    const colonnes = [{ titre: E.Fiches.replace(/s$/, ''), part: 45, gras: true }, { titre: E.genres ? 'Type' : 'Auteur', part: 16 }];
    if (!opt.sommaire) colonnes.push({ titre: 'Titres', part: 8, centre: true });
    if (opt.savoirs) colonnes.push({ titre: 'Savoirs associés', part: 26 });
    if (opt.liens) colonnes.push({ titre: 'Lien', part: 34 });
    blocs.push({ t: 'table', titre: 'Liste', colonnes, lignes, taille: 8 });
    if (opt.sommaire) {
      let dossier = null;
      for (const l of liste) {
        const g = cheminTexte(l);
        if (g !== dossier) { dossier = g; if (g) blocs.push({ t: 'dossier', texte: g }); }
        blocs.push({ t: 'cours', titre: (l.titre || 'Sans titre') + (E.genres ? `  (${genreDe(l)[1]})` : ''), lignes: (l.sommaire || []).map((e) => ({ n: e.n || 0, t: e.t + (e.p ? ' (p. ' + e.p + ')' : '') })),
          savoirs: opt.savoirs ? (l.savoirs || []).map((c) => `${c} ${libSavoir(c)}`) : [], lien: opt.liens ? urlLivre(l) : '' });
      }
    }
    return { fichier: nomFichier(`${nom}_${titreDoc || ''}_${auteur}.pdf`), titre: titreDoc || nom, pied: `${nom} · ${auteur} · ${new Date().toLocaleDateString('fr-FR')}`, blocs };
  }

  // ------------------------------------------------------------------ remplir avec une IA (sommaire et savoirs d'un document de Mes cours)
  function configIA(l) {
    const voisins = livresDe(l.theme_id ?? null, moi).filter((x) => x.id !== l.id).map((x) => x.titre);
    const t = l.theme_id ? T.get(l.theme_id) : null;
    const actuel = (l.sommaire || []).map((e) => '  '.repeat(e.n || 0) + e.t).join('\n');
    return {
      titre: `${genreDe(l)[1]} · ${l.titre}`,
      demande: async () => `DOCUMENT À REMPLIR : le sommaire détaillé d’un document pédagogique de l’enseignant (type : ${genreDe(l)[1].toLowerCase()}) et les savoirs associés du référentiel.
Titre : ${l.titre}
${t ? `Dossier : ${chemin(t).map((x) => x.nom).join(' › ')}\n` : ''}${voisins.length ? `Autres documents du même dossier (pour éviter les doublons) : ${voisins.join(' ; ')}\n` : ''}Sommaire actuel : ${actuel ? '\n' + actuel : '(vide)'}
Savoirs associés actuels : ${(l.savoirs || []).join(', ') || '(aucun)'}

TÂCHE : propose un sommaire détaillé et progressif pour ce document (2 ou 3 niveaux de titres, 4 à 8 parties), puis les codes des savoirs associés du référentiel qu’il traite (les plus pertinents seulement).

SAVOIRS ASSOCIÉS DU RÉFÉRENTIEL :
${listeSavoirs(ref)}`,
      format: '=== COURS ===\nSommaire :\n1. …\n- …\n- …\n-- …\n2. …\n- …\n(titres principaux numérotés « 1. », « 2. » ; sous-titres précédés de « - » ; 3e niveau précédé de « -- »)\nSavoirs : …\n=== FIN ===',
      lire: (B) => {
        const b = B.find((x) => x.nom === 'COURS'); if (!b) return null;
        const c = champs(b.corps, { sommaire: ['Sommaire', 'Sommaire détaillé'], savoirs: ['Savoirs', 'Savoirs associés'] });
        const lignes = String(c.sommaire || '').split('\n').filter((x) => x.trim() && !/^\(.*\)$/.test(x.trim()))
          .map((x) => { const m = x.match(/^\s*(-*)\s*/); return { t: x.slice(m[0].length).trim(), p: null, n: Math.min(3, m[1].length) }; });
        const sav = codesDans(c.savoirs, ref.savoirs.map((x) => x.code));
        const items = [];
        if (lignes.length) items.push({ cle: 'sommaire', titre: `Sommaire : ${lignes.length} titre(s)`, detail: resume(lignes.map((x) => x.t).join(' · '), 220) + (actuel ? ' (le document a déjà un sommaire)' : '') });
        if (sav.length) items.push({ cle: 'savoirs', titre: `Savoirs associés : ${sav.join(', ')}`, detail: resume(sav.map(libSavoir).join(' · '), 220) });
        return { items, data: { sommaire: lignes, savoirs: sav } };
      },
      appliquer: async (d, coches, remplacer) => {
        const patch = {};
        if (coches.has('sommaire') && aEcrire(actuel, d.sommaire.length ? 'x' : '', remplacer)) { patch.sommaire = d.sommaire.slice(0, 5000); patch.source = 'ia'; }
        if (coches.has('savoirs') && d.savoirs.length) { const ordre = ref.savoirs.map((x) => x.code); patch.savoirs = [...new Set(remplacer ? d.savoirs : [...(l.savoirs || []), ...d.savoirs])].sort((p, q) => ordre.indexOf(p) - ordre.indexOf(q)); }
        if (!Object.keys(patch).length) return 'Rien à remplir : le sommaire existe déjà (cochez « Remplacer »)';
        await db.modifier('biblio_livres', l.id, patch); Object.assign(l, patch); dessiner();
        return patch.sommaire ? 'Sommaire et savoirs remplis' : 'Savoirs ajoutés (sommaire existant gardé)';
      },
    };
  }

  dessiner();
  if (recherche) { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); }
  verifierNuage();

  // ------------------------------------------------------------------ nouveaux fichiers sur Nuage (vérification en arrière-plan)
  async function verifierNuage() {
    const lienN = reglage[E.lien];
    if (vue !== 'mes' || !analyserLien(lienN)) return;
    let liste;
    try { liste = await nuageListe(lienN); } catch { return; }      // relais absent ou Nuage injoignable : rien à signaler
    if (!bandeauNuage.isConnected) return;
    const connus = new Set(mesFiches().map((l) => l.chemin.normalize('NFC')));
    const nouveaux = liste.filter((x) => !x.dossier && !connus.has(x.c) && !/(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c) && !/\.(html?|js|py|bat|command|sh|ini|db|tmp|lnk)$/i.test(x.c));
    const cle = 'pilotage-scbh-' + E.cle + '-nuage-ignore', signature = nouveaux.map((x) => x.c).sort().join('|');
    let ignore = ''; try { ignore = sessionStorage.getItem(cle) || ''; } catch { /* sans stockage */ }
    if (!nouveaux.length || ignore === signature) { vider(bandeauNuage); return; }
    const noms = nouveaux.slice(0, 4).map((x) => x.c.split('/').pop()).join(', ') + (nouveaux.length > 4 ? '…' : '');
    vider(bandeauNuage, h('div', { class: 'bandeau-nuage' },
      h('span', { class: 'icone-bandeau' }, '📥'),
      h('div', { class: 'texte-bandeau' }, h('b', {}, `${pluriel(nouveaux.length, 'nouveau fichier', 'nouveaux fichiers')} sur votre Nuage`), h('small', {}, noms)),
      h('button', { class: 'btn petit principal', type: 'button', onclick: () => mettreAJour() }, 'Créer les fiches'),
      h('button', { class: 'btn petit', type: 'button', title: 'Ne plus signaler ces fichiers pendant cette session', onclick: () => { try { sessionStorage.setItem(cle, signature); } catch { /* sans stockage */ } vider(bandeauNuage); } }, 'Plus tard')));
  }
}
