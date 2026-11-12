// Mes ressources · Mes cours : espace personnel de chaque enseignant (cours, exercices, TD/TP, évaluations, corrigés, ressources).
// Arborescence de dossiers et de cours ; pour chaque cours : titre, sommaire détaillé, savoirs associés (aucun fichier n'est stocké).
// Privé par défaut ; un dossier ou un cours se partage (en consultation) avec des collègues ou toute l'équipe.
// Même fonctionnement que « Ma bibliothèque » : tuiles de dossiers, fiches de documents, recherche dans les sommaires, mode gestion.
// #/cours : accueil · #/cours/d-ID : un dossier · #/cours/ID : un document · #/cours/partages : partagés avec moi
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, fenetre, ajuster } from '../ui.js';
import { envoyerPDF } from './fiches.js';
import { nomFichier } from '../echange.js';
import { boutonIA, champs, codesDans, listeSavoirs, aEcrire, resume } from '../ia.js';
import { chargerReglages, reglagesDe, adresseFichier, adresseDossier, dialogueReglages, choisirDossier, cheminRelatif, ignore, progression,
  chargerCollegues, nomCollegue, pluriel, grainDeBois, reduireImage, dialoguePartage } from '../ressources.js';

// types de documents de « Mes cours »
export const GENRES = { cours: ['📘', 'Cours'], exercice: ['✏️', 'Exercice'], tdtp: ['🛠', 'TD / TP'], evaluation: ['📝', 'Évaluation'],
  corrige: ['✅', 'Corrigé'], ressource: ['🎬', 'Ressource'], autre: ['📄', 'Autre'] };
export const iconeDoc = (r) => (r.type === 'dossier' ? '📁' : (GENRES[r.genre] || GENRES.cours)[0]);
// type d'après un nom de dossier ou de fichier (Cours, Exercices, TD-TP, Évaluations, Corrigés, Ressources)
export function genreDepuisNom(nom) {
  const n = String(nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/corrig/.test(n)) return 'corrige';
  if (/^(td|tp|td[\s_-]*tp|travaux)/.test(n) || /\b(td|tp)\b/.test(n)) return 'tdtp';
  if (/evaluation|^eval|controle|\bds\b|examen|sujet/.test(n)) return 'evaluation';
  if (/exercice|^exo/.test(n)) return 'exercice';
  if (/ressource|video|documentation|annexe/.test(n)) return 'ressource';
  if (/^cours\b|^cours$/.test(n)) return 'cours';
  return null;
}

const sansAccent = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const compareTitres = (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
const dateHeure = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// ------------------------------------------------------------------------------------------- sommaire
// une ligne par titre ; niveau = retrait (2 espaces ou une tabulation par niveau) ou tirets en tête (« - », « -- »)
export function lignesSommaire(texte) {
  return String(texte || '').split('\n').filter((l) => l.trim()).map((l) => {
    const m = l.match(/^([ \t]*)(-*)\s*/);
    const esp = m[1].replace(/\t/g, '  ').length;
    return { n: Math.min(4, Math.floor(esp / 2) + m[2].length), t: l.slice(m[0].length).trim() };
  });
}
function apercuSommaire(texte, termes = []) {
  const ls = lignesSommaire(texte);
  if (!ls.length) return h('p', { class: 'vide-sommaire' }, 'Sommaire non renseigné.');
  return h('ol', { class: 'apercu-sommaire' }, ls.map((l) => h('li', { class: 'niv' + l.n }, surligner(l.t, termes))));
}

// ------------------------------------------------------------------------------------------- recherche
const termesDe = (q) => sansAccent(q).split(/\s+/).filter((t) => t.length > 0);
function surligner(texte, termes) {
  const t = String(texte ?? '');
  if (!termes.length) return t;
  const s = sansAccent(t);       // même longueur que t pour les lettres latines usuelles
  if (s.length !== t.length) return t;
  const zones = [];
  for (const m of termes) { let i = s.indexOf(m); while (i >= 0) { zones.push([i, i + m.length]); i = s.indexOf(m, i + m.length); } }
  if (!zones.length) return t;
  zones.sort((a, b) => a[0] - b[0]);
  const out = []; let pos = 0;
  for (const [a, b] of zones) { if (a < pos) continue; if (a > pos) out.push(t.slice(pos, a)); out.push(h('mark', {}, t.slice(a, b))); pos = b; }
  if (pos < t.length) out.push(t.slice(pos));
  return out;
}

// ------------------------------------------------------------------------------------------- lecture d'un fichier Word (.docx)
// titres (styles Titre 1 / 2 / 3 ou niveaux hiérarchiques) → sommaire ; codes des savoirs du référentiel cités dans le texte
async function lireWord(fichier, ref, { niveaux = 3, numeroter = true } = {}) {
  if (!/\.docx$/i.test(fichier.name)) throw new Error(`« ${fichier.name} » : seuls les fichiers Word récents (.docx) peuvent être lus.`);
  const P = await import('../pdf.js?v=20261111'); await P.chargerOutils();
  const zip = await window.JSZip.loadAsync(await fichier.arrayBuffer());
  const xml = async (chemin) => { const f = zip.file(chemin); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
  const [doc, styles, core] = await Promise.all([xml('word/document.xml'), xml('word/styles.xml'), xml('docProps/core.xml')]);
  if (!doc) throw new Error(`« ${fichier.name} » n’est pas un document Word lisible.`);
  const val = (el, nom) => el?.getElementsByTagName(nom)[0]?.getAttribute('w:val');
  // styles : niveau hiérarchique (propre, d'après le nom « heading n » / « titre n », ou hérité)
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
  let titre = '', tout = [];
  const lignes = [], cpt = [0, 0, 0, 0, 0];
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
    lignes.push('  '.repeat(n) + t);
  }
  if (!titre && core) titre = (core.getElementsByTagName('dc:title')[0]?.textContent || '').trim();
  if (!titre) titre = fichier.name.replace(/\.docx$/i, '').replace(/[_]+/g, ' ').trim();
  const texteComplet = ' ' + tout.join(' ') + ' ';
  const savoirs = ref.savoirs.map((s) => s.code).filter((c) => new RegExp(`[^\\w.-]${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(texteComplet));
  return { titre, sommaire: lignes.join('\n'), nb: lignes.length, savoirs };
}

// ------------------------------------------------------------------------------------------- page
const COULEURS_GENRES = { cours: '#1E8F86', exercice: '#C79A12', tdtp: '#C8790B', evaluation: '#B03A2E', corrige: '#4E9A2F', ressource: '#3D84C6', autre: '#6F6A8A' };
const CLE_GESTION = 'pilotage-scbh-cours-gestion';
let recherche = '', genreFiltre = '', etiquetteFiltre = '', savoirFiltre = '';   // gardés d'une page à l'autre

export async function pageCours(zone, arg, ctx) {
  const entete = (titre) => h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, titre)));
  if (!ctx.peutEcrire()) { vider(zone, entete('🎓  Mes cours'), h('p', { class: 'vide' }, 'Cet espace personnel est réservé aux enseignants.')); return; }
  const moi = ctx.profil.id;
  let rows, partages, ref;
  try {
    [rows, partages, , ref] = await Promise.all([db.lire('cours', 'order=ordre,id'), db.lire('cours_partages'), chargerCollegues(), ctx.referentiel(), chargerReglages(true)]);
  } catch (e) {
    vider(zone, entete('🎓  Mes cours'), h('div', { class: 'erreur-page' }, h('h2', {}, 'Espace pas encore installé'),
      h('p', {}, ctx.estAdmin() ? 'Exécutez les scripts SQL 23 à 25 dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord terminer l’installation de cet espace.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const R = new Map(rows.map((r) => [r.id, r]));
  let P = partages;
  let gestion = (() => { try { return sessionStorage.getItem(CLE_GESTION) === '1'; } catch { return false; } })();
  const memoGestion = (v) => { gestion = v; try { sessionStorage.setItem(CLE_GESTION, v ? '1' : '0'); } catch { /* sans stockage */ } };

  // ------------------------------------------------------------------ outils
  const aMoi = (r) => r.proprietaire === moi;
  const rang = Object.keys(GENRES);
  const enfants = (id, proprio = null) => [...R.values()].filter((r) => (r.parent_id ?? null) === id && (proprio === null || r.proprietaire === proprio));
  const dossiersDe = (id, proprio = null) => enfants(id, proprio).filter((r) => r.type === 'dossier').sort((a, b) => a.ordre - b.ordre || compareTitres(a.titre, b.titre));
  const docsDe = (id, proprio = null) => enfants(id, proprio).filter((r) => r.type === 'cours')
    .sort((a, b) => rang.indexOf(a.genre || 'cours') - rang.indexOf(b.genre || 'cours') || a.ordre - b.ordre || compareTitres(a.titre, b.titre));
  const descendants = (id) => { const o = []; const p = [id]; while (p.length) { const x = p.pop(); for (const e of enfants(x)) { o.push(e); p.push(e.id); } } return o; };
  const nbDocs = (id) => descendants(id).filter((x) => x.type === 'cours').length;
  const chemin = (r) => { const l = []; let p = r.parent_id ? R.get(r.parent_id) : null; let n = 0; while (p && n++ < 50) { l.unshift(p); p = p.parent_id ? R.get(p.parent_id) : null; } return l; };
  const titreDe = (r) => r.titre || (r.type === 'dossier' ? 'Dossier sans titre' : 'Document sans titre');
  const partagesDe = (id) => P.filter((p) => p.cours_id === id);
  const estPartage = (r) => r.partage_tous || partagesDe(r.id).length > 0;
  const partageHerite = (r) => chemin(r).reverse().find((d) => estPartage(d));
  const libSavoir = (c) => ref.sav[c]?.libelle || 'code absent du référentiel';
  const lienOk = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());
  const genreDe = (r) => GENRES[r.genre] || GENRES.cours;
  const urlDoc = (r) => {
    if (lienOk(r.lien)) return r.lien;
    if (!r.chemin) return '';
    const g = reglagesDe(r.proprietaire);
    return r.type === 'dossier' ? adresseDossier(g.lien_cours, r.chemin) : adresseFichier(g.lien_cours, r.chemin, g.format_liens);
  };
  const recharger = () => ctx.recharger();

  // route : #/cours · #/cours/partages · #/cours/d-ID (dossier) · #/cours/ID (document)
  const a = String(arg || '');
  const idRoute = /^d-\d+$/.test(a) ? Number(a.slice(2)) : /^\d+$/.test(a) ? Number(a) : null;
  const courant = idRoute ? R.get(idRoute) : null;
  const dossierCourant = courant?.type === 'dossier' ? courant : null, docCourant = courant?.type === 'cours' ? courant : null;
  const vue = a === 'partages' || (courant && !aMoi(courant)) ? 'partages' : 'mes';
  const modif = vue === 'mes' && gestion;
  const mesDocs = [...R.values()].filter((r) => aMoi(r) && r.type === 'cours'), sesDocs = [...R.values()].filter((r) => !aMoi(r) && r.type === 'cours');
  const reglage = reglagesDe(moi);
  const accueilHash = vue === 'mes' ? '#/cours' : '#/cours/partages';

  // ------------------------------------------------------------------ squelette
  const contenu = h('div', { class: 'contenu-biblio' });
  const champRech = h('input', { class: 'recherche-biblio', type: 'search', value: recherche, placeholder: 'Rechercher dans les titres, sommaires, étiquettes et savoirs : contreventement, métré, S11-1…', 'aria-label': 'Rechercher dans mes cours',
    oninput: () => { recherche = champRech.value; dessiner(); } });
  const etiquettesConnues = () => [...new Set([...R.values()].filter((r) => (vue === 'mes') === aMoi(r)).flatMap((r) => r.etiquettes || []))].sort(compareTitres);
  const savoirsUtilises = new Set([...R.values()].filter((r) => (vue === 'mes') === aMoi(r)).flatMap((r) => r.savoirs || []));
  if (etiquetteFiltre && !etiquettesConnues().includes(etiquetteFiltre)) etiquetteFiltre = '';
  if (savoirFiltre && !savoirsUtilises.has(savoirFiltre)) savoirFiltre = '';
  const filtres = h('div', { class: 'filtres-biblio' },
    h('select', { class: 'filtre-biblio', 'aria-label': 'Type de document', onchange: (e) => { genreFiltre = e.target.value; dessiner(); } },
      h('option', { value: '' }, 'Tous les types'), Object.entries(GENRES).map(([k, [ic, n]]) => h('option', { value: k, selected: k === genreFiltre }, `${ic} ${n}`))),
    etiquettesConnues().length ? h('select', { class: 'filtre-biblio', 'aria-label': 'Étiquette', onchange: (e) => { etiquetteFiltre = e.target.value; dessiner(); } },
      h('option', { value: '' }, 'Toutes les étiquettes'), etiquettesConnues().map((e) => h('option', { value: e, selected: e === etiquetteFiltre }, '🏷 ' + e))) : null,
    savoirsUtilises.size ? h('select', { class: 'filtre-biblio', 'aria-label': 'Savoir associé', onchange: (e) => { savoirFiltre = e.target.value; dessiner(); } },
      h('option', { value: '' }, 'Tous les savoirs associés'), ref.savoirs.filter((s) => savoirsUtilises.has(s.code)).map((s) => h('option', { value: s.code, selected: s.code === savoirFiltre }, `${s.code} · ${s.libelle_court || s.libelle}`))) : null);
  vider(zone,
    h('header', { class: 'entete-biblio entete-cours', style: { '--fond-biblio': grainDeBois('entete-cours-' + moi) + ' center/cover' } },
      h('div', { class: 'tete-biblio' },
        h('div', {}, h('h1', {}, '🎓  Mes cours'),
          h('p', { class: 'sous-titre' }, `${pluriel(mesDocs.length, 'document', 'documents')} · ${pluriel([...R.values()].filter((r) => aMoi(r) && r.type === 'dossier').length, 'dossier', 'dossiers')}${sesDocs.length ? ` · ${sesDocs.length} partagé(s) avec moi` : ''} · fichiers sur votre Nuage`)),
        h('div', { class: 'actions-page' },
          h('button', { class: 'btn principal', onclick: () => nouveauDocument(dossierCourant && aMoi(dossierCourant) ? dossierCourant.id : docCourant && aMoi(docCourant) ? docCourant.parent_id : null) }, '＋  Nouveau document'),
          h('button', { class: 'btn', title: 'Relire votre dossier « Mes cours » (synchronisé avec Nuage) : nouveaux dossiers et documents, type de chaque document, fichiers disparus', onclick: () => mettreAJour() }, '↻  Mettre à jour depuis mon dossier'),
          h('button', { class: 'btn', title: 'Créer des documents en reprenant le titre et les titres (sommaire) de fichiers Word : le fichier lui-même n’est pas copié', onclick: () => importerWord(dossierCourant && aMoi(dossierCourant) ? dossierCourant.id : null) }, '📄  Sommaires depuis Word'),
          h('button', { class: 'btn', onclick: () => partagerLot() }, '👥  Partager'),
          h('button', { class: 'btn', onclick: () => dialoguePDF(courant && aMoi(courant) ? courant.id : null) }, '⬇  PDF / Imprimer'),
          h('button', { class: 'btn', onclick: () => dialogueReglages(ctx, recharger) }, '⚙  Réglages Nuage'),
          h('button', { class: 'btn' + (gestion ? ' actif-gestion' : ''), title: 'Créer, renommer, ranger les dossiers ; modifier ou supprimer les documents', onclick: () => { memoGestion(!gestion); recharger(); } }, gestion ? '✔  Terminer la gestion' : '✎  Gérer'))),
      h('div', { class: 'zone-recherche-biblio' }, champRech, recherche ? h('button', { class: 'effacer-recherche', type: 'button', title: 'Effacer', onclick: () => { recherche = ''; champRech.value = ''; dessiner(); champRech.focus(); } }, '×') : null),
      filtres),
    h('nav', { class: 'onglets onglets-cours' },
      h('a', { href: '#/cours', class: vue === 'mes' ? 'actif' : '' }, `🎓 Mes cours (${mesDocs.length})`),
      h('a', { href: '#/cours/partages', class: vue === 'partages' ? 'actif' : '' }, `👥 Partagés avec moi (${sesDocs.length})`)),
    !reglage.lien_cours && vue === 'mes' && mesDocs.some((r) => r.chemin) ? h('div', { class: 'avertissement' }, '🔗  Pour ouvrir vos fichiers depuis le site, collez le lien de partage de votre dossier « Mes cours » dans ',
      h('button', { class: 'lien', type: 'button', onclick: () => dialogueReglages(ctx, recharger) }, '⚙ Réglages Nuage'), '.') : null,
    contenu);

  // ------------------------------------------------------------------ rendu
  const filtreActif = () => !!(recherche.trim() || genreFiltre || etiquetteFiltre || savoirFiltre);
  function dessiner() {
    if (filtreActif()) return vider(contenu, resultats());
    if (docCourant) return vider(contenu, ficheDoc(docCourant));
    if (dossierCourant) return vider(contenu, pageDossier(dossierCourant));
    vider(contenu, vue === 'mes' ? accueil() : accueilPartages());
  }
  function ariane(r, dernierLien = false) {
    const l = r ? [...chemin(r), ...(r.type === 'dossier' ? [r] : [])] : [];
    return h('nav', { class: 'ariane-biblio' }, h('a', { href: accueilHash }, vue === 'mes' ? 'Mes cours' : 'Partagés avec moi'),
      l.map((x, i) => [' › ', i === l.length - 1 && !dernierLien ? h('b', {}, titreDe(x)) : h('a', { href: '#/cours/d-' + x.id }, titreDe(x))]));
  }
  function tuile(d) {
    const n = nbDocs(d.id), ns = dossiersDe(d.id).length;
    const el = h('a', { class: 'tuile-biblio', href: '#/cours/d-' + d.id, style: { backgroundImage: d.image ? `url("${d.image}")` : grainDeBois([...chemin(d), d].map((x) => x.titre).join('/')) } },
      h('div', { class: 'etiquette-tuile' }, h('div', { class: 'nom' }, titreDe(d)),
        h('div', { class: 'compte' }, [ns ? pluriel(ns, 'sous-dossier', 'sous-dossiers') : '', pluriel(n, 'document', 'documents')].filter(Boolean).join(' · '), aMoi(d) && estPartage(d) ? ' · 👥' : '')),
      modif ? h('div', { class: 'outils-tuile' },
        h('button', { type: 'button', title: 'Modifier le dossier', onclick: (e) => { e.preventDefault(); modifierDossier(d); } }, '✎'),
        h('button', { type: 'button', title: 'Partager le dossier', onclick: (e) => { e.preventDefault(); partagerUn(d); } }, '👥'),
        h('button', { type: 'button', title: 'Supprimer le dossier', onclick: (e) => { e.preventDefault(); supprimer(d); } }, '✖')) : null);
    if (modif) glisserTuile(el, d);
    return el;
  }
  const tuiles = (liste, parent) => h('div', { class: 'tuiles-biblio' }, liste.map(tuile),
    modif ? h('button', { class: 'tuile-biblio nouvelle', type: 'button', onclick: () => nouveauDossier(parent) }, h('span', { class: 'plus' }, '＋'), h('span', {}, parent ? 'Nouveau sous-dossier' : 'Nouveau dossier')) : null);
  // documents groupés par type
  function listeParType(docs) {
    return Object.keys(GENRES).map((g) => {
      const l = docs.filter((d) => (d.genre || 'cours') === g); if (!l.length) return null;
      return h('section', {}, h('h2', { class: 'titre-section' }, `${GENRES[g][0]} ${GENRES[g][1]}${l.length > 1 && !/s$/.test(GENRES[g][1]) && g !== 'tdtp' ? 's' : ''} (${l.length})`), h('div', { class: 'livres-biblio' }, l.map((d) => carteDoc(d))));
    });
  }
  function accueil() {
    const racines = dossiersDe(null, moi), sansDossier = docsDe(null, moi);
    if (!racines.length && !sansDossier.length) return h('div', { class: 'carte-detail accueil-cours' },
      h('h2', {}, '🎓 Votre espace de cours est vide'),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, 'Depuis Nuage : '), 'rangez vos fichiers dans un dossier « Mes cours » (un dossier par matière ou grand thème, puis par séquence, avec les sous-dossiers Cours, Exercices, TD-TP, Evaluations, Corrigés, Ressources), puis « ↻ Mettre à jour depuis mon dossier » (le dossier synchronisé sur votre ordinateur) : le site crée les dossiers et les fiches, avec le type de chaque document.'),
        h('li', {}, h('b', {}, 'Depuis Word : '), '« 📄 Sommaires depuis Word » crée une fiche par fichier avec son titre, son sommaire et les savoirs cités.'),
        h('li', {}, h('b', {}, 'À la main : '), '« ✎ Gérer » → « ＋ Nouveau dossier », puis « ＋ Nouveau document ».')));
    return h('div', {},
      modif ? h('p', { class: 'aide' }, 'Mode gestion : glissez une tuile pour changer sa place ; ✎ modifie un dossier (nom, rangement, dossier Nuage, image).') : null,
      tuiles(racines, null),
      sansDossier.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Documents hors dossier'), h('div', { class: 'livres-biblio' }, sansDossier.map((d) => carteDoc(d)))) : null);
  }
  function accueilPartages() {
    const autres = [...new Set([...R.values()].filter((x) => !aMoi(x)).map((x) => x.proprietaire))];
    if (!autres.length) return h('p', { class: 'vide' }, 'Aucun document n’est encore partagé avec vous.');
    return autres.map((u) => {
      const ds = [...R.values()].filter((r) => r.proprietaire === u && r.type === 'dossier' && (!r.parent_id || !R.has(r.parent_id))).sort((x, y) => x.ordre - y.ordre);
      const docs = [...R.values()].filter((r) => r.proprietaire === u && r.type === 'cours' && (!r.parent_id || !R.has(r.parent_id)));
      return h('section', { class: 'groupe-proprio-biblio' }, h('h2', { class: 'titre-section' }, '👤 ', nomCollegue(u)), ds.length ? tuiles(ds, null) : null,
        docs.length ? h('div', { class: 'livres-biblio' }, docs.map((d) => carteDoc(d))) : null);
    });
  }
  function pageDossier(d) {
    const sd = dossiersDe(d.id), docs = docsDe(d.id), u = urlDoc(d);
    const herite = aMoi(d) ? partageHerite(d) : null;
    return h('div', {},
      h('div', { class: 'tete-theme' }, ariane(d),
        h('div', { class: 'boutons-detail' },
          u ? h('a', { class: 'btn petit', href: u, target: '_blank', rel: 'noopener', title: 'Ouvrir ce dossier dans Nuage' }, '📂 Dossier sur Nuage') : null,
          aMoi(d) ? h('button', { class: 'btn petit', onclick: () => modifierDossier(d) }, '✎ Modifier le dossier') : null,
          aMoi(d) ? h('button', { class: 'btn petit' + (estPartage(d) ? ' partage-actif' : ''), onclick: () => partagerUn(d) }, estPartage(d) ? '👥 Partagé' : '👥 Partager') : null,
          h('button', { class: 'btn petit', onclick: () => dialoguePDF(d.id) }, '⬇ PDF'),
          !aMoi(d) ? h('button', { class: 'btn petit principal', onclick: () => copier(d, null) }, '⧉ Copier dans mes cours') : null,
          !aMoi(d) ? h('span', { class: 'info-partage' }, '👤 Partagé par ' + nomCollegue(d.proprietaire)) : null)),
      herite ? h('p', { class: 'info-partage' }, `👥 Partagé avec le dossier « ${titreDe(herite)} »`) : null,
      sd.length || modif ? tuiles(sd, d.id) : null,
      docs.length ? listeParType(docs) : !sd.length ? h('p', { class: 'vide' }, 'Dossier vide.') : null,
      modif || aMoi(d) ? h('div', { class: 'boutons-detail' }, h('button', { class: 'btn petit principal', onclick: () => nouveauDocument(d.id) }, '＋ Nouveau document dans ce dossier'),
        h('button', { class: 'btn petit', onclick: () => importerWord(d.id) }, '📄 Sommaires depuis Word')) : null);
  }

  // ------------------------------------------------------------------ documents
  const vignette = (r, classe = 'couv-mini') => h('div', { class: 'tranche tranche-doc ' + classe, style: { '--couleur': COULEURS_GENRES[r.genre] || COULEURS_GENRES.cours }, title: genreDe(r)[1] }, genreDe(r)[0]);
  const boutonOuvrir = (r, classe = 'btn petit principal') => { const u = urlDoc(r); return u ? h('a', { class: classe, href: u, target: '_blank', rel: 'noopener' }, 'Ouvrir') : h('span', { class: classe + ' desactive', title: r.chemin ? 'Renseignez le lien de partage de « Mes cours » dans ⚙ Réglages Nuage' : 'Aucun fichier associé : indiquez son chemin sur Nuage ou un lien (✎ Modifier)' }, 'Ouvrir'); };
  function carteDoc(r, { lignes = null, termes = [] } = {}) {
    const sur = (x) => surligner(String(x), termes);
    const meta = [];
    if (lignes || filtreActif()) meta.push(chemin(r).length ? h('span', { class: 'chemin' }, chemin(r).flatMap((x, i) => [i ? ' › ' : '', h('a', { href: '#/cours/d-' + x.id }, x.titre)])) : 'Hors dossier');
    const nt = lignesSommaire(r.sommaire).length;
    if (nt) meta.push(pluriel(nt, 'titre au sommaire', 'titres au sommaire'));
    if ((r.savoirs || []).length) meta.push(h('span', { class: 'codes-mini' }, r.savoirs.slice(0, 4).map((c) => h('i', { title: libSavoir(c) }, sur(c))), r.savoirs.length > 4 ? h('i', {}, '+' + (r.savoirs.length - 4)) : null));
    if (aMoi(r) && estPartage(r)) meta.push('👥 partagé');
    if (!aMoi(r)) meta.push('👤 ' + nomCollegue(r.proprietaire));
    let corps = null;
    if (lignes?.length) {
      const vis = lignes.slice(0, 12), reste = lignes.length - vis.length;
      const ol = h('ol', { class: 'sommaire-biblio' }, vis.map((e) => h('li', { class: 'niv-som' + e.n }, h('span', { class: 'sans-lien' }, h('span', {}, sur(e.t))))));
      corps = h('div', { class: 'extraits-biblio' }, ol, reste > 0 ? h('button', { class: 'lien petit', type: 'button', onclick: (ev) => { vider(ol, lignes.map((e) => h('li', { class: 'niv-som' + e.n }, h('span', { class: 'sans-lien' }, h('span', {}, sur(e.t)))))); ev.target.remove(); } }, `Voir ${pluriel(reste, 'autre passage', 'autres passages')}`) : null);
    }
    return h('article', { class: 'livre-biblio' },
      h('div', { class: 'livre-tete' },
        h('a', { class: 'lien-couv', href: '#/cours/' + r.id, tabindex: -1 }, vignette(r)),
        h('div', { class: 'livre-infos' },
          h('div', { class: 'livre-titre' }, h('a', { href: '#/cours/' + r.id }, sur(titreDe(r)))),
          h('div', { class: 'livre-details' }, genreDe(r)[1], (r.etiquettes || []).map((e) => h('span', { class: 'etiquette-doc mini' }, '🏷 ', sur(e)))),
          meta.length ? h('div', { class: 'livre-meta' }, meta.flatMap((x, i) => [i ? ' · ' : '', x])) : null),
        h('div', { class: 'actions-livre' },
          modif && aMoi(r) ? [h('button', { class: 'btn petit', onclick: () => modifierDocument(r) }, '✎ Modifier'), h('button', { class: 'btn petit danger', onclick: () => supprimer(r) }, '✖')] : null,
          h('a', { class: 'btn petit', href: '#/cours/' + r.id }, '☰ Fiche'), boutonOuvrir(r))),
      corps);
  }
  function ficheDoc(r) {
    const mien = aMoi(r), herite = mien ? partageHerite(r) : null;
    const infos = [['Type', `${genreDe(r)[0]} ${genreDe(r)[1]}`], ['Dossier', chemin(r).map(titreDe).join(' › ') || 'Hors dossier'],
      ['Fichier sur Nuage', r.chemin || '—'], ['Lien internet', lienOk(r.lien) ? r.lien : ''],
      ['Créé le', r.cree_le ? new Date(r.cree_le).toLocaleDateString('fr-FR') : ''], ['Modifié le', r.maj_le ? new Date(r.maj_le).toLocaleDateString('fr-FR') : '']].filter(([, v]) => v);
    const sav = r.savoirs || [], ls = lignesSommaire(r.sommaire);
    return h('div', { class: 'fiche-livre' },
      ariane(r, true),
      h('div', { class: 'grille-fiche-livre' },
        h('div', { class: 'col-couv' }, vignette(r, 'couv-grande'),
          h('div', { class: 'boutons-fiche' }, boutonOuvrir(r, 'btn principal'),
            mien ? h('button', { class: 'btn', onclick: () => modifierDocument(r) }, '✎ Modifier') : null,
            mien ? h('button', { class: 'btn' + (estPartage(r) ? ' partage-actif' : ''), onclick: () => partagerUn(r) }, estPartage(r) ? '👥 Partagé' : '👥 Partager') : null,
            mien ? h('button', { class: 'btn', onclick: () => copier(r, r.parent_id, ' (copie)') }, '⧉ Dupliquer') : h('button', { class: 'btn principal', onclick: () => copier(r, null) }, '⧉ Copier dans mes cours'),
            h('button', { class: 'btn', onclick: () => dialoguePDF(r.id) }, '⬇ PDF'),
            mien ? h('button', { class: 'btn danger', onclick: () => supprimer(r) }, '✖ Supprimer la fiche') : null)),
        h('div', { class: 'col-infos' },
          h('h2', { class: 'titre-livre' }, titreDe(r)),
          !mien ? h('p', { class: 'info-partage' }, `👤 Partagé par ${nomCollegue(r.proprietaire)} · consultation seule`)
            : estPartage(r) || herite ? h('p', { class: 'info-partage' }, '👥 ', estPartage(r) ? 'Partagé avec ' + [r.partage_tous ? 'toute l’équipe' : null, ...partagesDe(r.id).map((p) => nomCollegue(p.destinataire))].filter(Boolean).join(', ') : `Partagé avec le dossier « ${titreDe(herite)} »`) : null,
          h('dl', { class: 'infos-livre' }, infos.flatMap(([x, v]) => [h('dt', {}, x), h('dd', {}, x === 'Lien internet' ? h('a', { href: v, target: '_blank', rel: 'noopener' }, v) : v)])),
          (r.etiquettes || []).length ? h('div', { class: 'etiquettes-doc' }, r.etiquettes.map((e) => h('span', { class: 'etiquette-doc' }, '🏷 ', e))) : null,
          h('div', { class: 'savoirs-cours' }, h('h3', {}, 'Savoirs associés'),
            sav.length ? sav.map((c) => h('div', { class: 'code' }, h('b', { class: ref.sav[c] ? '' : 'inconnu' }, c), h('span', {}, libSavoir(c)))) : h('p', { class: 'vide-sommaire' }, 'Aucun savoir associé.'),
            mien ? h('button', { class: 'lien petit', type: 'button', onclick: () => choisirSavoirs(r) }, sav.length ? '✎ modifier' : '＋ choisir dans le référentiel') : null),
          h('div', { class: 'entete-bloc' }, h('h3', {}, 'Sommaire détaillé'),
            mien ? h('div', { class: 'boutons-detail' },
              h('button', { class: 'btn petit', type: 'button', onclick: () => modifierDocument(r, 'sommaire') }, '✎ Modifier le sommaire'),
              h('button', { class: 'btn petit', type: 'button', title: 'Remplacer le sommaire par les titres d’un fichier Word', onclick: () => sommaireWord(r) }, '📄 Titres d’un fichier Word'),
              boutonIA(() => configIA(r), 'btn petit')) : null),
          ls.length ? h('ol', { class: 'sommaire-biblio complet' }, ls.map((e) => h('li', { class: 'niv-som' + e.n }, h('span', { class: 'sans-lien' }, h('span', {}, e.t)))))
            : h('p', { class: 'vide-sommaire' }, 'Sommaire non renseigné.'))));
  }

  // ------------------------------------------------------------------ recherche et filtres
  function resultats() {
    const T2 = termesDe(recherche);
    const trouves = [];
    for (const r of (vue === 'mes' ? mesDocs : sesDocs)) {
      if (genreFiltre && (r.genre || 'cours') !== genreFiltre) continue;
      if (etiquetteFiltre && !(r.etiquettes || []).includes(etiquetteFiltre)) continue;
      if (savoirFiltre && !(r.savoirs || []).includes(savoirFiltre)) continue;
      const ls = lignesSommaire(r.sommaire);
      const tete = sansAccent([r.titre, genreDe(r)[1], ...(r.etiquettes || []), r.chemin, ...(r.savoirs || []).map((c) => c + ' ' + libSavoir(c)), ...chemin(r).map((d) => d.titre)].join(' '));
      const tout = tete + ' ' + sansAccent(ls.map((e) => e.t).join(' '));
      if (!T2.every((m) => tout.includes(m))) continue;
      const lignesTous = T2.length ? ls.filter((e) => { const s = sansAccent(e.t); return T2.every((m) => s.includes(m)); }) : [];
      const lignes = lignesTous.length ? lignesTous : T2.length ? ls.filter((e) => { const s = sansAccent(e.t); return T2.some((m) => s.includes(m)); }) : [];
      trouves.push({ r, lignes, score: (T2.length && T2.every((m) => tete.includes(m)) ? 1000 : 0) + lignesTous.length * 10 + lignes.length });
    }
    trouves.sort((x, y) => y.score - x.score || rang.indexOf(x.r.genre || 'cours') - rang.indexOf(y.r.genre || 'cours') || compareTitres(x.r.titre, y.r.titre));
    const nl = trouves.reduce((s, x) => s + x.lignes.length, 0);
    return h('div', {},
      h('p', { class: 'compte-recherche' }, trouves.length ? `${pluriel(trouves.length, 'document', 'documents')}${nl ? ' · ' + pluriel(nl, 'passage', 'passages') + ' du sommaire' : ''}` : 'Aucun résultat.',
        ' ', h('button', { class: 'lien petit', type: 'button', onclick: () => { recherche = ''; genreFiltre = ''; etiquetteFiltre = ''; savoirFiltre = ''; recharger(); } }, 'Tout effacer')),
      h('div', { class: 'livres-biblio' }, trouves.map((x) => carteDoc(x.r, { lignes: x.lignes, termes: T2 }))));
  }

  // ------------------------------------------------------------------ dossiers
  function selectDossier(choisi, { racine = 'Hors dossier (accueil)', exclure = null } = {}) {
    const interdits = exclure ? new Set([exclure, ...descendants(exclure).map((x) => x.id)]) : new Set();
    const opts = [h('option', { value: '' }, racine)];
    const parcourir = (id, niv) => dossiersDe(id, moi).filter((d) => !interdits.has(d.id)).forEach((d) => { opts.push(h('option', { value: d.id, selected: d.id === choisi }, '   '.repeat(niv) + (niv ? '↳ ' : '') + titreDe(d))); parcourir(d.id, niv + 1); });
    parcourir(null, 0);
    return h('select', { class: 'champ' }, opts);
  }
  async function nouveauDossier(parent) {
    const nom = h('input', { class: 'champ', placeholder: 'Ex. : S1 - Déroulement d’une affaire' });
    const r = await fenetre(parent ? 'Nouveau sous-dossier' : 'Nouveau dossier', h('div', { class: 'formulaire' }, h('label', { class: 'large' }, 'Nom', nom),
      h('p', { class: 'aide' }, 'Créez aussi le dossier du même nom dans « Mes cours » sur votre Nuage (le site retient ce chemin pour l’ouvrir).')),
    [{ texte: 'Annuler', valeur: null }, { texte: 'Créer', classe: 'principal', action: () => { if (!nom.value.trim()) throw new Error('Donnez un nom.'); return nom.value.trim(); } }]);
    if (!r) return;
    const p = parent ? R.get(parent) : null;
    try {
      const d = await db.ajouter('cours', { type: 'dossier', parent_id: parent, titre: r, chemin: (p?.chemin ? p.chemin + '/' : '') + r, ordre: Math.max(0, ...dossiersDe(parent, moi).map((x) => x.ordre)) + 1 });
      R.set(d.id, d); toast('Dossier créé'); dessiner();
    } catch (e) { erreur(e); }
  }
  async function modifierDossier(d) {
    const nom = h('input', { class: 'champ', value: d.titre }), cheminN = h('input', { class: 'champ', value: d.chemin || '', placeholder: 'ex. Organisation/S1 - Déroulement d’une affaire' });
    const lien = h('input', { class: 'champ', value: d.lien || '', placeholder: 'https://… (facultatif : remplace le chemin)' });
    const parent = selectDossier(d.parent_id, { racine: 'Accueil (dossier principal)', exclure: d.id });
    let image = d.image || '';
    const apercu = h('div', { class: 'apercu-tuile', style: { backgroundImage: image ? `url("${image}")` : grainDeBois(d.titre) } });
    const fichier = h('input', { type: 'file', accept: 'image/*', onchange: async () => { try { image = await reduireImage(fichier.files[0], 520, 0.72); apercu.style.backgroundImage = `url("${image}")`; } catch (e) { erreur(e); } } });
    const ok = await fenetre('Modifier le dossier', h('div', { class: 'formulaire' },
      h('label', {}, 'Nom de la tuile', nom), h('label', {}, 'Ranger dans', parent),
      h('label', { class: 'large' }, 'Dossier sur Nuage (chemin dans « Mes cours »)', cheminN), h('label', { class: 'large' }, 'Ou lien internet direct', lien),
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Image de la tuile'), apercu, fichier,
        h('button', { class: 'lien petit', type: 'button', onclick: () => { image = ''; apercu.style.backgroundImage = grainDeBois(nom.value); } }, 'Revenir au veinage bois'))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: () => { if (lien.value.trim() && !lienOk(lien.value)) throw new Error('Lien invalide : collez l’adresse complète (https://…).'); return true; } }], { large: true });
    if (!ok) return;
    try {
      const v = { titre: nom.value.trim() || d.titre, chemin: cheminN.value.trim(), lien: lien.value.trim(), image, parent_id: parent.value ? Number(parent.value) : null };
      if (v.parent_id !== d.parent_id) v.ordre = Math.max(0, ...dossiersDe(v.parent_id, moi).map((x) => x.ordre)) + 1;
      await db.modifier('cours', d.id, v); Object.assign(d, v); toast('Dossier enregistré'); dessiner();
    } catch (e) { erreur(e); }
  }
  let glisse = null;
  function glisserTuile(el, d) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { glisse = d; e.dataTransfer.effectAllowed = 'move'; el.classList.add('glisse'); });
    el.addEventListener('dragend', () => { glisse = null; el.classList.remove('glisse'); });
    el.addEventListener('dragover', (e) => { if (glisse && glisse !== d && (glisse.parent_id ?? null) === (d.parent_id ?? null)) { e.preventDefault(); el.classList.add('cible'); } });
    el.addEventListener('dragleave', () => el.classList.remove('cible'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('cible'); if (!glisse || glisse === d) return;
      const f = dossiersDe(d.parent_id ?? null, moi).filter((x) => x !== glisse); f.splice(f.indexOf(d), 0, glisse);
      try { for (const [i, x] of f.entries()) if (x.ordre !== i + 1) { await db.modifier('cours', x.id, { ordre: i + 1 }); x.ordre = i + 1; } } catch (er) { erreur(er); }
      dessiner();
    });
  }

  // ------------------------------------------------------------------ documents : création, modification, suppression, copie
  async function nouveauDocument(parent) {
    try {
      const r = await db.ajouter('cours', { type: 'cours', genre: genreFiltre || 'cours', parent_id: parent, titre: 'Nouveau document', ordre: Math.max(0, ...docsDe(parent, moi).map((x) => x.ordre)) + 1 });
      R.set(r.id, r);
      const ok = await modifierDocument(r, 'titre');
      if (!ok && r.titre === 'Nouveau document') { await db.supprimer('cours', r.id).catch(() => {}); R.delete(r.id); return; }
      location.hash = '#/cours/' + r.id;
    } catch (e) { erreur(e); }
  }
  const versTexte = (t) => String(t || '');
  async function modifierDocument(r, focus = '') {
    const titre = h('input', { class: 'champ', value: r.titre === 'Nouveau document' ? '' : r.titre, placeholder: 'Titre du document', maxlength: 300 });
    const genre = h('select', { class: 'champ' }, Object.entries(GENRES).map(([k, [ic, n]]) => h('option', { value: k, selected: k === (r.genre || 'cours') }, `${ic} ${n}`)));
    const dossier = selectDossier(r.parent_id);
    const etiq = h('input', { class: 'champ', value: (r.etiquettes || []).join(', '), placeholder: 'ex. 1re année, chantier fil rouge (séparées par des virgules)', list: 'liste-etiquettes' });
    const cheminF = h('input', { class: 'champ', value: r.chemin || '', placeholder: 'ex. Organisation/S1/Cours/A01 - L’entreprise.pdf' });
    const lien = h('input', { class: 'champ', value: r.lien || '', placeholder: 'https://… (Drive, OneDrive, site… : remplace le chemin)' });
    const som = h('textarea', { class: 'champ saisie-sommaire', rows: 10, maxlength: 20000, placeholder: '1. Premier titre\n  1.1 Sous-titre\n  1.2 Sous-titre\n2. Deuxième titre\n…' }); som.value = versTexte(r.sommaire);
    const apercu = h('div', { class: 'zone-apercu' }, apercuSommaire(som.value));
    som.addEventListener('input', () => vider(apercu, apercuSommaire(som.value)));
    // Tab / Maj+Tab : décaler les lignes sélectionnées d'un niveau
    som.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const v = som.value, a1 = som.selectionStart, b1 = som.selectionEnd;
      const debut = v.lastIndexOf('\n', a1 - 1) + 1, finL = v.indexOf('\n', b1 === a1 ? b1 : b1 - 1), fin = finL < 0 ? v.length : finL;
      const bloc = v.slice(debut, fin).split('\n').map((l) => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l)).join('\n');
      som.value = v.slice(0, debut) + bloc + v.slice(fin);
      if (a1 === b1) { const c = Math.max(debut, a1 + bloc.length - (fin - debut)); som.selectionStart = som.selectionEnd = c; } else { som.selectionStart = debut; som.selectionEnd = debut + bloc.length; }
      som.dispatchEvent(new Event('input'));
    });
    const word = h('input', { type: 'file', accept: '.docx', onchange: async () => {
      try { const x = await lireWord(word.files[0], ref); if (!x.nb) throw new Error('Aucun titre trouvé dans ce document (styles « Titre 1 », « Titre 2 »…).'); som.value = x.sommaire; som.dispatchEvent(new Event('input')); if (!titre.value.trim()) titre.value = x.titre; toast(`${x.nb} titres repris`); }
      catch (e) { erreur(e); }
    } });
    const attente = fenetre(r.titre === 'Nouveau document' ? 'Nouveau document' : `Modifier « ${titreDe(r)} »`, h('div', { class: 'modif-livre' },
      h('div', { class: 'formulaire' },
        h('label', { class: 'large' }, 'Titre', titre), h('label', {}, 'Type de document', genre), h('label', {}, 'Ranger dans', dossier),
        h('label', { class: 'large' }, 'Étiquettes', etiq),
        h('label', {}, 'Fichier sur Nuage (chemin dans « Mes cours »)', cheminF), h('label', {}, 'Ou lien internet direct', lien)),
      h('datalist', { id: 'liste-etiquettes' }, [...new Set([...R.values()].filter(aMoi).flatMap((x) => x.etiquettes || []))].map((e) => h('option', { value: e }))),
      h('p', { class: 'sous-titre-choix' }, 'Sommaire détaillé'),
      h('p', { class: 'aide' }, 'Une ligne par titre ; Tab décale la ligne d’un niveau (Maj+Tab pour revenir), ou commencez la ligne par « - » / « -- ». Ou reprenez les titres d’un fichier Word : ', word),
      h('div', { class: 'sommaire-double' }, h('div', { class: 'col-saisie' }, h('small', { class: 'lib-col' }, 'Saisie'), som), h('div', { class: 'col-apercu' }, h('small', { class: 'lib-col' }, 'Aperçu'), apercu))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: () => {
      if (!titre.value.trim()) throw new Error('Donnez un titre au document.');
      if (lien.value.trim() && !lienOk(lien.value)) throw new Error('Lien invalide : collez l’adresse complète (https://…).');
      return true;
    } }], { large: true });
    if (focus) setTimeout(() => (focus === 'sommaire' ? som : titre).focus(), 80);
    const ok = await attente;
    if (!ok) return false;
    const v = { titre: titre.value.trim(), genre: genre.value, parent_id: dossier.value ? Number(dossier.value) : null, chemin: cheminF.value.trim(), lien: lien.value.trim(),
      etiquettes: [...new Set(etiq.value.split(',').map((x) => x.trim().slice(0, 60)).filter(Boolean))], sommaire: som.value.slice(0, 20000) };
    try { await db.modifier('cours', r.id, v); Object.assign(r, v); toast('Enregistré'); dessiner(); return true; } catch (e) { erreur(e); return false; }
  }
  async function sommaireWord(r) {
    const inp = h('input', { type: 'file', accept: '.docx' });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const x = await lireWord(f, ref);
        if (!x.nb) throw new Error('Aucun titre trouvé dans ce document (styles « Titre 1 », « Titre 2 »…).');
        if (r.sommaire.trim() && !(await confirmer('Remplacer le sommaire', `Remplacer le sommaire actuel par les ${x.nb} titres de « ${f.name} » ?`, 'Remplacer'))) return;
        const ordre = ref.savoirs.map((s) => s.code), sav = [...new Set([...(r.savoirs || []), ...x.savoirs])].sort((p, q) => ordre.indexOf(p) - ordre.indexOf(q));
        await db.modifier('cours', r.id, { sommaire: x.sommaire, savoirs: sav }); r.sommaire = x.sommaire; r.savoirs = sav;
        toast(`Sommaire repris (${x.nb} titres${x.savoirs.length ? ', savoirs : ' + x.savoirs.join(' ') : ''})`); dessiner();
      } catch (e) { erreur(e); }
    };
    inp.click();
  }
  async function supprimer(r) {
    const d = descendants(r.id), nc = d.filter((x) => x.type === 'cours').length, nd = d.length - nc;
    const texte = r.type === 'dossier'
      ? `Supprimer le dossier « ${titreDe(r)} »${d.length ? ` et tout son contenu (${nc} document(s)${nd ? `, ${nd} sous-dossier(s)` : ''})` : ''} ? Les fichiers sur votre Nuage ne sont pas touchés.`
      : `Supprimer la fiche « ${titreDe(r)} » (sommaire, savoirs, étiquettes) ? Le fichier sur votre Nuage n’est pas touché.`;
    if (!(await confirmer('Supprimer', texte, 'Supprimer'))) return;
    try {
      await db.supprimer('cours', r.id);
      [r, ...d].forEach((x) => R.delete(x.id)); P = P.filter((p) => R.has(p.cours_id));
      toast('Supprimé');
      if (courant && !R.has(courant.id)) location.hash = r.parent_id && R.has(r.parent_id) ? '#/cours/d-' + r.parent_id : '#/cours'; else dessiner();
    } catch (e) { erreur(e); }
  }
  async function copier(r, parent, suffixe = '') {
    try {
      const champsDe = (x) => ({ type: x.type, titre: x.titre, sommaire: x.sommaire, savoirs: x.savoirs || [], lien: x.lien || '', genre: x.genre || 'cours', etiquettes: x.etiquettes || [], chemin: x.chemin || '', image: x.image || '' });
      const racine = await db.ajouter('cours', { ...champsDe(r), titre: titreDe(r) + suffixe, parent_id: parent, ordre: Math.max(0, ...enfants(parent, moi).map((x) => x.ordre)) + 1 });
      R.set(racine.id, racine);
      const file = [[r.id, racine.id]];
      while (file.length) {
        const [src, dst] = file.shift();
        for (const e of enfants(src)) { const n = await db.ajouter('cours', { ...champsDe(e), parent_id: dst, ordre: e.ordre }); R.set(n.id, n); if (e.type === 'dossier') file.push([e.id, n.id]); }
      }
      toast(suffixe ? 'Dupliqué' : 'Copié dans mes cours');
      location.hash = racine.type === 'dossier' ? '#/cours/d-' + racine.id : '#/cours/' + racine.id;
    } catch (e) { erreur(e); }
  }
  async function choisirSavoirs(r) {
    const choix = new Set(r.savoirs || []);
    const rech = h('input', { class: 'champ', placeholder: 'Rechercher (code ou mot)…' });
    const corps = h('div', { class: 'liste-choix' });
    const remplir = () => {
      const t = termesDe(rech.value);
      vider(corps, ref.savoirs.filter((s) => !t.length || t.every((m) => sansAccent(s.code + ' ' + s.libelle + ' ' + (s.contenus || []).join(' ')).includes(m))).map((s) => h('label', { class: 'option' },
        h('input', { type: 'checkbox', checked: choix.has(s.code), onchange: (e) => (e.target.checked ? choix.add(s.code) : choix.delete(s.code)) }), h('b', {}, s.code), ' ', s.libelle,
        (s.contenus || []).length ? h('small', { class: 'detail-choix' }, s.contenus.join(' · ')) : null)));
    };
    rech.addEventListener('input', remplir); remplir();
    if (!(await fenetre('Savoirs associés', h('div', {}, rech, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true }))) return;
    const ordre = ref.savoirs.map((s) => s.code), val = [...choix].sort((p, q) => ordre.indexOf(p) - ordre.indexOf(q));
    try { await db.modifier('cours', r.id, { savoirs: val }); r.savoirs = val; toast('Enregistré'); dessiner(); } catch (e) { erreur(e); }
  }

  // ------------------------------------------------------------------ fichiers Word : un document par fichier (titre, sommaire, savoirs)
  async function importerWord(parent) {
    const fichiers = h('input', { type: 'file', accept: '.docx', multiple: true });
    const niveaux = h('select', { class: 'champ' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === 3 }, n === 1 ? 'Titres de niveau 1' : `Titres de niveaux 1 à ${n}`)));
    const numeroter = h('input', { type: 'checkbox', checked: true });
    const genre = h('select', { class: 'champ' }, Object.entries(GENRES).map(([k, [ic, n]]) => h('option', { value: k }, `${ic} ${n}`)));
    const dest = selectDossier(parent);
    const apercu = h('div', { class: 'apercu-import' }, h('p', { class: 'aide' }, 'Choisissez un ou plusieurs fichiers .docx.'));
    let lus = [];
    const lire = async () => {
      vider(apercu, h('p', { class: 'aide' }, 'Lecture…')); lus = [];
      for (const f of fichiers.files) { try { lus.push({ f, ...(await lireWord(f, ref, { niveaux: Number(niveaux.value), numeroter: numeroter.checked })) }); } catch (e) { lus.push({ f, erreur: e.message }); } }
      vider(apercu, lus.length ? h('table', { class: 'table-import' }, h('tr', {}, h('th', {}, 'Document'), h('th', {}, 'Sommaire'), h('th', {}, 'Savoirs reconnus')),
        lus.map((x) => h('tr', {}, x.erreur ? h('td', { colspan: 3, class: 'erreur' }, x.erreur) : [
          h('td', {}, h('input', { class: 'champ', value: x.titre, oninput: (e) => { x.titre = e.target.value; } })),
          h('td', { class: x.nb ? '' : 'alerte' }, x.nb ? `${x.nb} titre(s)` : 'aucun titre trouvé'), h('td', {}, x.savoirs.join(', ') || '—')]))) : h('p', { class: 'aide' }, 'Aucun fichier choisi.'));
    };
    fichiers.addEventListener('change', lire); niveaux.addEventListener('change', lire); numeroter.addEventListener('change', lire);
    const ok = await fenetre('Créer des documents à partir de fichiers Word', h('div', { class: 'import-word' },
      h('p', { class: 'aide' }, 'Pour chaque fichier Word (.docx), seuls trois éléments sont repris : le titre (ou le nom du fichier), le sommaire (les titres « Titre 1 », « Titre 2 »… du document) et les codes des savoirs cités (S11-1…). Le fichier n’est ni copié ni envoyé : il est seulement lu sur votre ordinateur.'),
      h('div', { class: 'formulaire' }, h('label', { class: 'large' }, 'Fichiers Word', fichiers), h('label', {}, 'Sommaire', niveaux), h('label', {}, 'Type de document', genre),
        h('label', {}, 'Ranger dans', dest), h('label', { class: 'case' }, numeroter, ' Numéroter les titres (1., 1.1, 1.1.1)')), apercu),
    [{ texte: 'Annuler', valeur: false }, { texte: '＋  Créer les documents', classe: 'principal', action: () => { if (!lus.some((x) => !x.erreur)) throw new Error('Choisissez au moins un fichier Word lisible.'); return true; } }], { large: true });
    if (!ok) return;
    const p = dest.value ? Number(dest.value) : null; let n = 0;
    try {
      let ordre = Math.max(0, ...docsDe(p, moi).map((x) => x.ordre));
      for (const x of lus.filter((y) => !y.erreur)) { const r = await db.ajouter('cours', { type: 'cours', genre: genre.value, parent_id: p, ordre: ++ordre, titre: x.titre.trim() || 'Document', sommaire: x.sommaire, savoirs: x.savoirs }); R.set(r.id, r); n++; }
      toast(`${n} document(s) créé(s)`);
    } catch (e) { erreur(e); }
    location.hash = p ? '#/cours/d-' + p : '#/cours'; recharger();
  }

  // ------------------------------------------------------------------ mise à jour depuis le dossier « Mes cours » synchronisé avec Nuage
  // un dossier → un dossier du site ; les sous-dossiers Cours, Exercices, TD-TP, Évaluations, Corrigés, Ressources donnent le type
  // des fichiers (ils ne deviennent pas des dossiers) ; un même nom en Word et en PDF = un seul document (le PDF s'ouvre, le Word donne le sommaire)
  const DOSSIER_TYPE = /^(cours|exercices?|exos?|td|tp|td[\s_-]*tp|travaux pratiques|[eé]valuations?|[eé]vals?|contr[oô]les?|corrig[eé]s?|ressources?)$/i;
  async function mettreAJour() {
    toast('Choisissez votre dossier « Mes cours » (synchronisé avec Nuage)');
    const tous = await choisirDossier();
    if (!tous.length) return;
    const fichiers = tous.map((f) => ({ f, c: cheminRelatif(f) })).filter((x) => x.c && !ignore(x.c) && !/\.(ini|db|tmp|lnk)$/i.test(x.c));
    const groupes = new Map();
    for (const x of fichiers) {
      const parts = x.c.split('/'), nom = parts.pop(), base = nom.replace(/\.[a-z0-9]{1,5}$/i, '');
      let genreDossier = null; const dossiers = [], reels = [];
      for (const p of parts) { reels.push(p); if (DOSSIER_TYPE.test(p.trim())) genreDossier = genreDepuisNom(p) || genreDossier; else dossiers.push(reels.join('/')); }
      const genre = /corrig/i.test(base) ? 'corrige' : genreDossier || genreDepuisNom(base) || 'cours';
      const cle = (dossiers[dossiers.length - 1] || '') + '|' + base.toLowerCase() + '|' + genre;
      if (!groupes.has(cle)) groupes.set(cle, { base, genre, dossier: dossiers[dossiers.length - 1] || '', dossiers, fichiers: [] });
      groupes.get(cle).fichiers.push(x);
    }
    const mes = [...R.values()].filter(aMoi);
    const dossiersConnus = new Map(mes.filter((r) => r.type === 'dossier' && r.chemin).map((r) => [r.chemin.normalize('NFC'), r]));
    const docsConnus = new Set(mes.filter((r) => r.type === 'cours' && r.chemin).map((r) => r.chemin.normalize('NFC')));
    const presents = new Set(fichiers.map((x) => x.c));
    const nouveaux = [...groupes.values()].filter((g) => !g.fichiers.some((x) => docsConnus.has(x.c)))
      .sort((p, q) => compareTitres(p.dossier, q.dossier) || rang.indexOf(p.genre) - rang.indexOf(q.genre) || compareTitres(p.base, q.base));
    const aCreer = [...new Set(nouveaux.flatMap((g) => g.dossiers))].filter((d) => !dossiersConnus.has(d)).sort();
    const disparus = mes.filter((r) => r.type === 'cours' && r.chemin && !presents.has(r.chemin.normalize('NFC')));
    const lireW = h('input', { type: 'checkbox', checked: true }), retirer = h('input', { type: 'checkbox' });
    const parGenre = Object.entries(GENRES).map(([k, [ic, n]]) => [ic, n, nouveaux.filter((g) => g.genre === k).length]).filter((x) => x[2]);
    const ok = await fenetre('Mettre à jour depuis mon dossier « Mes cours »', h('div', {},
      h('p', {}, `Dossier lu : ${fichiers.length} fichier(s).`),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, `${nouveaux.length} nouveau(x) document(s)`), parGenre.length ? ' : ' + parGenre.map(([ic, n, c]) => `${ic} ${c} ${n.toLowerCase()}`).join(', ') : ''),
        h('li', {}, h('b', {}, `${aCreer.length} nouveau(x) dossier(s)`), aCreer.length ? ' : ' + aCreer.slice(0, 8).map((d) => d.split('/').pop()).join(', ') + (aCreer.length > 8 ? '…' : '') : ''),
        h('li', {}, h('b', {}, `${disparus.length} document(s) dont le fichier est introuvable`), disparus.length ? ' : ' + disparus.slice(0, 6).map((r) => r.titre).join(', ') : '')),
      nouveaux.some((g) => g.fichiers.some((x) => /\.docx$/i.test(x.c))) ? h('label', { class: 'case' }, lireW, ' Lire le sommaire et les savoirs des fichiers Word (titres seulement)') : null,
      disparus.length ? h('label', { class: 'case' }, retirer, ' Supprimer les documents dont le fichier est introuvable') : null,
      h('p', { class: 'aide' }, 'Seuls les noms des fichiers et dossiers sont lus (et les titres des fichiers Word, si coché) : rien n’est envoyé. Le type de chaque document vient de son sous-dossier (Cours, Exercices, TD-TP, Évaluations, Corrigés, Ressources) ou de son nom ; il reste modifiable.')),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Mettre à jour', classe: 'principal', valeur: true }]);
    if (!ok) return;
    const pr = progression('Mise à jour de « Mes cours »'); let n = 0;
    try {
      for (const d of aCreer) {
        const parentD = d.split('/').slice(0, -1).join('/'), parent = dossiersConnus.get(parentD) || null;
        const r = await db.ajouter('cours', { type: 'dossier', parent_id: parent?.id ?? null, titre: d.split('/').pop(), chemin: d, ordre: Math.max(0, ...enfants(parent?.id ?? null, moi).map((x) => x.ordre)) + 1 });
        R.set(r.id, r); dossiersConnus.set(d, r);
      }
      for (const [i, g] of nouveaux.entries()) {
        pr.maj(i, nouveaux.length, g.base);
        const pdf = g.fichiers.find((x) => /\.pdf$/i.test(x.c)), word = g.fichiers.find((x) => /\.docx$/i.test(x.c));
        let v = { sommaire: '', savoirs: [] };
        if (word && lireW.checked) { try { const w = await lireWord(word.f, ref); v = { sommaire: w.sommaire, savoirs: w.savoirs }; } catch { /* Word illisible */ } }
        const parent = dossiersConnus.get(g.dossier) || null;
        const r = await db.ajouter('cours', { type: 'cours', genre: g.genre, parent_id: parent?.id ?? null, titre: g.base, chemin: (pdf || g.fichiers[0]).c, ordre: 1000 + i, ...v });
        R.set(r.id, r); n++;
      }
      if (retirer.checked) for (const r of disparus) { await db.supprimer('cours', r.id); R.delete(r.id); }
    } catch (e) { erreur(e); }
    pr.fin();
    toast(`${n} document(s) ajouté(s)${aCreer.length ? `, ${aCreer.length} dossier(s)` : ''}`);
    if (!reglagesDe(moi).lien_cours && n) setTimeout(() => dialogueReglages(ctx, recharger), 600); else recharger();
  }

  // ------------------------------------------------------------------ partage
  async function enregistrerPartage(r, tous, qui) {
    if (tous !== r.partage_tous) { await db.modifier('cours', r.id, { partage_tous: tous }); r.partage_tous = tous; }
    const avant = new Set(partagesDe(r.id).map((p) => p.destinataire)), voulus = new Set(qui);
    for (const u of avant) if (!voulus.has(u)) await db.supprimer('cours_partages', u, `cours_id=eq.${r.id}&destinataire`);
    const ajout = [...voulus].filter((u) => !avant.has(u)).map((u) => ({ cours_id: r.id, destinataire: u }));
    if (ajout.length) await db.ajouter('cours_partages', ajout);
    P = P.filter((p) => p.cours_id !== r.id).concat([...voulus].map((u) => ({ cours_id: r.id, destinataire: u })));
  }
  async function partagerUn(r) {
    const herite = partageHerite(r);
    const res = await dialoguePartage(`Partager « ${titreDe(r)} »`, r.type === 'dossier'
      ? 'Les collègues choisis verront ce dossier et tout son contenu (y compris les documents ajoutés plus tard), en consultation : ils peuvent l’imprimer et le copier dans leur espace, pas le modifier. Pour ouvrir les fichiers, ils utilisent le lien de partage de votre dossier « Mes cours » sur Nuage.'
      : 'Les collègues choisis verront ce document en consultation : ils peuvent l’imprimer et le copier dans leur espace, pas le modifier. Pour ouvrir le fichier, ils utilisent le lien de partage de votre dossier « Mes cours » sur Nuage.',
    { tous: r.partage_tous, qui: partagesDe(r.id).map((p) => p.destinataire), moi,
      herite: herite ? `Déjà partagé par le dossier « ${titreDe(herite)} »${herite.partage_tous ? ' avec toute l’équipe' : ' avec : ' + partagesDe(herite.id).map((p) => nomCollegue(p.destinataire)).join(', ')}.` : '' });
    if (!res) return;
    try { await enregistrerPartage(r, res.tous, res.qui); toast(res.tous || res.qui.length ? 'Partage enregistré' : 'De nouveau privé'); dessiner(); } catch (e) { erreur(e); }
  }
  async function partagerLot() {
    const autres = (await chargerCollegues()).filter((c) => c.id !== moi);
    const mes = [...R.values()].filter(aMoi);
    if (!mes.length) { toast('Créez d’abord des documents', 'erreur'); return; }
    const coches = new Set();
    if (courant && aMoi(courant)) [courant, ...descendants(courant.id)].forEach((x) => coches.add(x.id));
    const boite = h('div', { class: 'choix-dossier arbre-pdf' }), compte = h('span', { class: 'compte-choix' });
    const avec = (r) => [r.partage_tous ? 'toute l’équipe' : null, ...partagesDe(r.id).map((p) => nomCollegue(p.destinataire))].filter(Boolean);
    const dessinerArbre = () => {
      const ligne = (r, prof) => [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } },
        h('input', { type: 'checkbox', checked: coches.has(r.id), onchange: (e) => { [r, ...descendants(r.id)].forEach((x) => (e.target.checked ? coches.add(x.id) : coches.delete(x.id))); dessinerArbre(); } }),
        iconeDoc(r) + ' ', titreDe(r), avec(r).length ? h('small', { class: 'deja-partage' }, ' 👥 ' + avec(r).join(', ')) : null),
      ...(r.type === 'dossier' ? [...dossiersDe(r.id, moi), ...docsDe(r.id, moi)].flatMap((f) => ligne(f, prof + 1)) : [])];
      vider(boite, [...dossiersDe(null, moi), ...docsDe(null, moi)].flatMap((r) => ligne(r, 0)));
      compte.textContent = `${[...coches].filter((id) => R.get(id)?.type === 'cours').length} document(s) sélectionné(s)`;
    };
    dessinerArbre();
    const qui = new Set(), tous = h('input', { type: 'checkbox' });
    const mode = h('select', { class: 'champ' }, h('option', { value: 'ajouter' }, 'Ajouter ces collègues (garder les partages existants)'), h('option', { value: 'retirer' }, 'Retirer ces collègues'),
      h('option', { value: 'remplacer' }, 'Partager uniquement avec eux (remplacer)'), h('option', { value: 'prive' }, 'Rendre privé (retirer tous les partages)'));
    const ok = await fenetre('Partager des documents', h('div', { class: 'partage-lot' },
      h('p', { class: 'aide' }, 'Cochez un document, plusieurs, un dossier (tout son contenu) ou tous vos documents, puis les collègues. Vous pouvez revenir ici à tout moment pour ajouter ou retirer des collègues. Les collègues consultent, impriment et copient ; ils ne modifient rien.'),
      h('div', { class: 'deux-colonnes-partage' },
        h('div', {}, h('div', { class: 'entete-bloc' }, h('p', { class: 'sous-titre-choix' }, '1. Les documents'), compte),
          h('div', { class: 'boutons-detail' }, h('button', { class: 'btn petit', type: 'button', onclick: () => { mes.forEach((x) => coches.add(x.id)); dessinerArbre(); } }, 'Tous mes documents'),
            h('button', { class: 'btn petit', type: 'button', onclick: () => { coches.clear(); dessinerArbre(); } }, 'Aucun')), boite),
        h('div', {}, h('p', { class: 'sous-titre-choix' }, '2. Les collègues'),
          h('label', { class: 'option tous' }, tous, h('b', {}, 'Toute l’équipe'), h('small', {}, ' (y compris les collègues qui arriveront plus tard)')),
          h('div', { class: 'liste-choix' }, autres.length ? autres.map((c) => h('label', { class: 'option' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? qui.add(c.id) : qui.delete(c.id)) }), c.nom)) : h('p', { class: 'vide' }, 'Aucun autre enseignant n’a encore de compte.')),
          h('p', { class: 'sous-titre-choix' }, '3. Action'), mode))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Appliquer', classe: 'principal', action: () => {
      if (!coches.size) throw new Error('Cochez au moins un document ou un dossier.');
      if (mode.value !== 'prive' && !qui.size && !tous.checked) throw new Error('Cochez au moins un collègue (ou « Toute l’équipe »).');
      return true;
    } }], { large: true });
    if (!ok) return;
    try {
      const m = mode.value;
      for (const id of [...coches].filter((x) => R.has(x))) {
        const r = R.get(id), actuels = new Set(partagesDe(id).map((p) => p.destinataire));
        const voulus = m === 'ajouter' ? [...new Set([...actuels, ...qui])] : m === 'retirer' ? [...actuels].filter((u) => !qui.has(u)) : m === 'remplacer' ? [...qui] : [];
        const tousV = m === 'ajouter' ? (tous.checked || r.partage_tous) : m === 'retirer' ? (tous.checked ? false : r.partage_tous) : m === 'remplacer' ? tous.checked : false;
        await enregistrerPartage(r, tousV, voulus);
      }
      toast(m === 'prive' ? 'Rendus privés' : m === 'retirer' ? 'Partage retiré' : 'Partages enregistrés');
    } catch (e) { erreur(e); }
    dessiner();
  }

  // ------------------------------------------------------------------ remplir avec une IA (sommaire et savoirs d'un document)
  function configIA(r) {
    const voisins = docsDe(r.parent_id, moi).filter((x) => x.id !== r.id).map((x) => titreDe(x));
    return {
      titre: `${genreDe(r)[1]} · ${titreDe(r)}`,
      demande: async () => `DOCUMENT À REMPLIR : le sommaire détaillé d’un document pédagogique de l’enseignant (type : ${genreDe(r)[1].toLowerCase()}) et les savoirs associés du référentiel.
Titre : ${titreDe(r)}
${chemin(r).length ? `Dossier : ${chemin(r).map(titreDe).join(' › ')}\n` : ''}${voisins.length ? `Autres documents du même dossier (pour éviter les doublons) : ${voisins.join(' ; ')}\n` : ''}Sommaire actuel : ${r.sommaire.trim() ? '\n' + r.sommaire : '(vide)'}
Savoirs associés actuels : ${(r.savoirs || []).join(', ') || '(aucun)'}

TÂCHE : propose un sommaire détaillé et progressif pour ce document (2 ou 3 niveaux de titres, 4 à 8 parties), puis les codes des savoirs associés du référentiel qu’il traite (les plus pertinents seulement).

SAVOIRS ASSOCIÉS DU RÉFÉRENTIEL :
${listeSavoirs(ref)}`,
      format: '=== COURS ===\nSommaire :\n1. …\n- …\n- …\n-- …\n2. …\n- …\n(titres principaux numérotés « 1. », « 2. » ; sous-titres précédés de « - » ; 3e niveau précédé de « -- »)\nSavoirs : …\n=== FIN ===',
      lire: (B) => {
        const b = B.find((x) => x.nom === 'COURS'); if (!b) return null;
        const c = champs(b.corps, { sommaire: ['Sommaire', 'Sommaire détaillé'], savoirs: ['Savoirs', 'Savoirs associés'] });
        const lignes = String(c.sommaire || '').split('\n').filter((l) => l.trim() && !/^\(.*\)$/.test(l.trim()))
          .map((l) => { const m = l.match(/^\s*(-*)\s*/); return '  '.repeat(Math.min(3, m[1].length)) + l.slice(m[0].length).trim(); });
        const sav = codesDans(c.savoirs, ref.savoirs.map((x) => x.code));
        const items = [];
        if (lignes.length) items.push({ cle: 'sommaire', titre: `Sommaire : ${lignes.length} titre(s)`, detail: resume(lignes.map((l) => l.trim()).join(' · '), 220) + (r.sommaire.trim() ? ' (le document a déjà un sommaire)' : '') });
        if (sav.length) items.push({ cle: 'savoirs', titre: `Savoirs associés : ${sav.join(', ')}`, detail: resume(sav.map(libSavoir).join(' · '), 220) });
        return { items, data: { sommaire: lignes.join('\n'), savoirs: sav } };
      },
      appliquer: async (d, coches, remplacer) => {
        const patch = {};
        if (coches.has('sommaire') && aEcrire(r.sommaire, d.sommaire, remplacer)) patch.sommaire = d.sommaire.slice(0, 20000);
        if (coches.has('savoirs') && d.savoirs.length) { const ordre = ref.savoirs.map((x) => x.code); patch.savoirs = [...new Set(remplacer ? d.savoirs : [...(r.savoirs || []), ...d.savoirs])].sort((p, q) => ordre.indexOf(p) - ordre.indexOf(q)); }
        if (!Object.keys(patch).length) return 'Rien à remplir : le sommaire existe déjà (cochez « Remplacer »)';
        await db.modifier('cours', r.id, patch); Object.assign(r, patch); dessiner();
        return patch.sommaire ? 'Sommaire et savoirs remplis' : 'Savoirs ajoutés (sommaire existant gardé)';
      },
    };
  }

  // ------------------------------------------------------------------ PDF
  async function dialoguePDF(depuis = null) {
    const racines = vue === 'mes' ? [...dossiersDe(null, moi), ...docsDe(null, moi)]
      : [...R.values()].filter((r) => !aMoi(r) && (!r.parent_id || !R.has(r.parent_id)));
    const base = depuis ? [R.get(depuis)] : racines;
    const coches = new Set(), tousDe = (r) => [r, ...descendants(r.id)];
    base.forEach((r) => tousDe(r).forEach((x) => coches.add(x.id)));
    const boite = h('div', { class: 'choix-dossier arbre-pdf' });
    const dessinerArbre = () => {
      const ligne = (r, prof) => [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } },
        h('input', { type: 'checkbox', checked: coches.has(r.id), onchange: (e) => { tousDe(r).forEach((x) => (e.target.checked ? coches.add(x.id) : coches.delete(x.id))); if (e.target.checked) chemin(r).forEach((d) => coches.add(d.id)); dessinerArbre(); } }),
        iconeDoc(r) + ' ', titreDe(r), !aMoi(r) && prof === 0 ? h('small', {}, ' · ' + nomCollegue(r.proprietaire)) : null),
      ...(r.type === 'dossier' ? [...dossiersDe(r.id), ...docsDe(r.id)].flatMap((f) => ligne(f, prof + 1)) : [])];
      vider(boite, base.flatMap((r) => ligne(r, 0)));
    };
    dessinerArbre();
    const optSommaire = h('input', { type: 'checkbox', checked: true }), optSavoirs = h('input', { type: 'checkbox', checked: true }), optLiens = h('input', { type: 'checkbox', checked: true });
    const mode = await fenetre('PDF / impression', h('div', { class: 'dialogue-pdf-cours' },
      h('div', { class: 'boutons-detail' },
        h('button', { class: 'btn petit', type: 'button', onclick: () => { base.forEach((r) => tousDe(r).forEach((x) => coches.add(x.id))); dessinerArbre(); } }, 'Tout cocher'),
        h('button', { class: 'btn petit', type: 'button', onclick: () => { coches.clear(); dessinerArbre(); } }, 'Tout décocher')),
      boite,
      h('div', { class: 'options-pdf' }, h('b', {}, 'Contenu : '), h('label', { class: 'case' }, optSommaire, ' sommaires détaillés'), h('label', { class: 'case' }, optSavoirs, ' savoirs associés'), h('label', { class: 'case' }, optLiens, ' liens vers les fichiers')),
      h('p', { class: 'aide' }, 'Sans les sommaires détaillés, le PDF est une liste des documents sous forme de tableau.')),
    [{ texte: 'Annuler', valeur: null }, { texte: '🖶  Imprimer', valeur: 'imprimer' }, { texte: '⬇  Télécharger le PDF', classe: 'principal', valeur: 'pdf' }], { large: true });
    if (!mode) return;
    const choisis = [];
    const parcourir = (liste) => liste.forEach((r) => { if (coches.has(r.id)) choisis.push(r); if (r.type === 'dossier') parcourir([...dossiersDe(r.id), ...docsDe(r.id)]); });
    parcourir(base);
    const docs = choisis.filter((r) => r.type === 'cours');
    if (!docs.length) { toast('Aucun document coché', 'erreur'); return; }
    envoyerPDF(documentPDF(docs, { sommaire: optSommaire.checked, savoirs: optSavoirs.checked, liens: optLiens.checked }, depuis ? R.get(depuis) : null), mode);
  }
  function documentPDF(docs, opt, depuis) {
    const proprios = [...new Set(docs.map((r) => r.proprietaire))];
    const auteur = proprios.length === 1 ? (proprios[0] === moi ? (ctx.enseignants.find((e) => e.profil_id === moi)?.nom || ctx.profil.nom || nomCollegue(moi)) : nomCollegue(proprios[0])) : 'Plusieurs enseignants';
    const cheminTexte = (r) => chemin(r).map(titreDe).join(' › ');
    const nbSav = new Set(docs.flatMap((r) => r.savoirs || [])).size;
    const titre = depuis ? titreDe(depuis) : 'Mes cours';
    const blocs = [
      { t: 'titre', texte: depuis ? titre : 'MES COURS', sous: auteur, couleur: '#1E8F86' },
      { t: 'infos', paires: [['Enseignant', auteur], ['Édité le', new Date().toLocaleDateString('fr-FR')], ['Documents', String(docs.length)], ['Savoirs associés', `${nbSav} savoir(s) différent(s)`]] },
    ];
    const lignes = []; let grp = null;
    for (const r of docs) {
      const g = cheminTexte(r) || 'Hors dossier';
      if (g !== grp) { grp = g; lignes.push({ groupe: g }); }
      const cell = [titreDe(r), genreDe(r)[1]];
      if (!opt.sommaire) cell.push(String(lignesSommaire(r.sommaire).length || '—'));
      if (opt.savoirs) cell.push((r.savoirs || []).join(', '));
      if (opt.liens) cell.push(urlDoc(r));
      lignes.push(cell);
    }
    const colonnes = [{ titre: 'Document', part: 45, gras: true }, { titre: 'Type', part: 13 }];
    if (!opt.sommaire) colonnes.push({ titre: 'Titres', part: 8, centre: true });
    if (opt.savoirs) colonnes.push({ titre: 'Savoirs associés', part: 28 });
    if (opt.liens) colonnes.push({ titre: 'Lien', part: 34 });
    blocs.push({ t: 'table', titre: opt.sommaire ? 'Liste des documents' : 'Documents', colonnes, lignes, taille: 8 });
    if (opt.sommaire) {
      let dossier = null;
      for (const r of docs) {
        const g = cheminTexte(r);
        if (g !== dossier) { dossier = g; if (g) blocs.push({ t: 'dossier', texte: g }); }
        blocs.push({ t: 'cours', titre: `${titreDe(r)}  (${genreDe(r)[1]})`, lignes: lignesSommaire(r.sommaire),
          savoirs: opt.savoirs ? (r.savoirs || []).map((c) => `${c} ${libSavoir(c)}`) : [], lien: opt.liens ? urlDoc(r) : '' });
      }
    }
    return { fichier: nomFichier(`Mes_cours_${depuis ? titre : ''}_${auteur}.pdf`), titre, pied: `Mes cours · ${auteur} · ${new Date().toLocaleDateString('fr-FR')}`, blocs };
  }

  dessiner();
  if (recherche) { champRech.focus(); champRech.setSelectionRange(champRech.value.length, champRech.value.length); }
}
