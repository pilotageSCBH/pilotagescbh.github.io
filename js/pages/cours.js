// Mes cours ressources : espace personnel de chaque enseignant.
// Arborescence de dossiers et de cours ; pour chaque cours : titre, sommaire détaillé, savoirs associés (aucun fichier n'est stocké).
// Privé par défaut ; un dossier ou un cours se partage (en consultation) avec des collègues ou toute l'équipe.
// #/cours : mes cours · #/cours/partages : cours partagés avec moi · #/cours/ID : un élément ouvert
import { db } from '../api.js';
import { h, vider, champ, toast, erreur, confirmer, fenetre, ajuster } from '../ui.js';
import { envoyerPDF } from './fiches.js';
import { nomFichier } from '../echange.js';

const CLE_OUVERTS = 'pilotage-scbh-cours-ouverts';
const lireL = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrireL = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
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
export async function pageCours(zone, arg, ctx) {
  if (!ctx.peutEcrire()) {
    vider(zone, h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📚  Mes cours ressources'))),
      h('p', { class: 'vide' }, 'Cet espace personnel est réservé aux enseignants.'));
    return;
  }
  const moi = ctx.profil.id;
  let rows, partages, collegues, ref;
  try {
    [rows, partages, collegues, ref] = await Promise.all([
      db.lire('cours', 'order=ordre,id'), db.lire('cours_partages'), db.rpc('collegues').catch(() => []), ctx.referentiel()]);
  } catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📚  Mes cours ressources'))),
      h('div', { class: 'erreur-page' }, h('h2', {}, 'Espace pas encore installé'),
        h('p', {}, ctx.estAdmin() ? 'Exécutez le script « 23_cours_ressources.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.'
          : 'L’administrateur doit d’abord terminer l’installation de cet espace. Réessayez plus tard.'),
        h('p', { class: 'aide' }, e.message)));
    return;
  }
  const R = new Map(rows.map((r) => [r.id, r]));
  let P = partages;                                         // partages de mes éléments + ceux qui me concernent
  const nomDe = (uid) => (collegues || []).find((c) => c.id === uid)?.nom || 'Un collègue';
  const ouverts = new Set(JSON.parse(lireL(CLE_OUVERTS, '[]') || '[]'));
  const memoOuverts = () => ecrireL(CLE_OUVERTS, JSON.stringify([...ouverts].slice(-400)));

  const vueInit = arg === 'partages' ? 'partages' : 'mes';
  let sel = /^\d+$/.test(String(arg || '')) ? Number(arg) : null;
  if (sel && !R.has(sel)) sel = null;
  let vue = sel ? (R.get(sel).proprietaire === moi ? 'mes' : 'partages') : vueInit;
  let q = '', savoirFiltre = '';

  // ------------------------------------------------------------------ outils de l'arbre
  const aMoi = (r) => r.proprietaire === moi;
  const enfants = (id, proprio = null) => [...R.values()].filter((r) => r.parent_id === id && (proprio === null || r.proprietaire === proprio))
    .sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  const racines = () => (vue === 'mes'
    ? enfants(null, moi)
    : [...R.values()].filter((r) => !aMoi(r) && (!r.parent_id || !R.has(r.parent_id))).sort((a, b) => compareTitres(nomDe(a.proprietaire), nomDe(b.proprietaire)) || a.ordre - b.ordre || a.id - b.id));
  const descendants = (id) => { const out = []; const pile = [id]; while (pile.length) { const x = pile.pop(); for (const e of enfants(x)) { out.push(e); pile.push(e.id); } } return out; };
  const chemin = (r) => { const l = []; let p = r.parent_id ? R.get(r.parent_id) : null; let n = 0; while (p && n++ < 50) { l.unshift(p); p = p.parent_id ? R.get(p.parent_id) : null; } return l; };
  const titreDe = (r) => r.titre || (r.type === 'dossier' ? 'Dossier sans titre' : 'Cours sans titre');
  const partagesDe = (id) => P.filter((p) => p.cours_id === id);
  const estPartage = (r) => r.partage_tous || partagesDe(r.id).length > 0;
  const partageHerite = (r) => chemin(r).reverse().find((d) => estPartage(d));
  const nbCours = (id) => descendants(id).filter((x) => x.type === 'cours').length;
  const libSavoir = (c) => ref.sav[c]?.libelle || 'code absent du référentiel';

  // recherche : tous les mots doivent apparaître (titre, sommaire, savoirs et leurs libellés, dossiers)
  const correspond = (r) => {
    if (savoirFiltre && !(r.savoirs || []).includes(savoirFiltre)) return false;
    const T = termesDe(q); if (!T.length) return true;
    const texte = sansAccent([r.titre, r.sommaire, ...(r.savoirs || []).map((c) => c + ' ' + libSavoir(c)), ...chemin(r).map((d) => d.titre)].join(' '));
    return T.every((t) => texte.includes(t));
  };
  const filtreActif = () => !!(termesDe(q).length || savoirFiltre);

  // ------------------------------------------------------------------ squelette
  const zoneArbre = h('div', { class: 'arbre-cours' });
  const zoneDetail = h('section', { class: 'detail-cours' });
  const compteur = h('span', { class: 'compte-recherche' });
  const recherche = h('input', { class: 'champ recherche-cours', type: 'search', placeholder: 'Rechercher un cours : titre, mot du sommaire, savoir (S11-1…)…', 'aria-label': 'Rechercher un cours',
    oninput: () => { q = recherche.value; dessinerArbre(); } });
  const choixSavoir = h('select', { class: 'champ filtre-savoir', 'aria-label': 'Filtrer par savoir associé', onchange: () => { savoirFiltre = choixSavoir.value; dessinerArbre(); } });
  const onglets = h('div', { class: 'onglets onglets-cours' });
  const majOnglets = () => {
    const nMes = [...R.values()].filter((r) => aMoi(r) && r.type === 'cours').length, nPart = [...R.values()].filter((r) => !aMoi(r) && r.type === 'cours').length;
    vider(onglets,
      h('button', { class: vue === 'mes' ? 'actif' : '', type: 'button', onclick: () => changerVue('mes') }, `📚 Mes cours (${nMes})`),
      h('button', { class: vue === 'partages' ? 'actif' : '', type: 'button', onclick: () => changerVue('partages') }, `👥 Partagés avec moi (${nPart})`));
  };
  const majChoixSavoir = () => {
    const utilises = new Set([...R.values()].filter((r) => (vue === 'mes') === aMoi(r)).flatMap((r) => r.savoirs || []));
    vider(choixSavoir, h('option', { value: '' }, 'Tous les savoirs associés'),
      ref.savoirs.filter((s) => utilises.has(s.code)).map((s) => h('option', { value: s.code, selected: s.code === savoirFiltre }, `${s.code} · ${s.libelle_court || s.libelle}`)));
    if (savoirFiltre && !utilises.has(savoirFiltre)) savoirFiltre = '';
  };
  function changerVue(v) { vue = v; sel = null; history.replaceState(null, '', v === 'partages' ? '#/cours/partages' : '#/cours'); majOnglets(); majChoixSavoir(); dessinerArbre(); dessinerDetail(); }
  function choisir(id) {
    sel = id;
    history.replaceState(null, '', id ? '#/cours/' + id : (vue === 'partages' ? '#/cours/partages' : '#/cours'));
    if (id) chemin(R.get(id)).forEach((d) => ouverts.add(d.id)), memoOuverts();
    dessinerArbre(); dessinerDetail();
    if (window.innerWidth < 1000) zoneDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  vider(zone,
    h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, '📚  Mes cours ressources'),
        h('p', { class: 'sous-titre' }, 'Espace personnel · vos cours rangés en dossiers, leur sommaire détaillé et les savoirs associés · privé tant que vous ne le partagez pas')),
      h('div', { class: 'actions-page' },
        h('button', { class: 'btn', onclick: () => nouveau('dossier') }, '📁  Nouveau dossier'),
        h('button', { class: 'btn principal', onclick: () => nouveau('cours') }, '＋  Nouveau cours'),
        h('button', { class: 'btn', title: 'Créer des cours en reprenant le titre et les titres (sommaire) de fichiers Word : le fichier lui-même n’est pas copié', onclick: () => importerWord() }, '📄  Sommaires depuis Word'),
        h('button', { class: 'btn', onclick: () => dialoguePDF() }, '⬇  PDF / Imprimer'))),
    onglets,
    h('div', { class: 'barre-cours' }, recherche, choixSavoir, compteur,
      h('button', { class: 'btn petit', type: 'button', title: 'Ouvrir tous les dossiers', onclick: () => { [...R.values()].filter((r) => r.type === 'dossier').forEach((d) => ouverts.add(d.id)); memoOuverts(); dessinerArbre(); } }, '▾ Tout déplier'),
      h('button', { class: 'btn petit', type: 'button', title: 'Fermer tous les dossiers', onclick: () => { ouverts.clear(); memoOuverts(); dessinerArbre(); } }, '▸ Tout replier')),
    h('div', { class: 'grille-cours' }, h('aside', { class: 'panneau-arbre' }, zoneArbre), zoneDetail));

  // ------------------------------------------------------------------ arbre
  let glisse = null;
  function dessinerArbre() {
    const T = termesDe(q), filtre = filtreActif();
    // éléments visibles quand on cherche : les cours qui correspondent et les dossiers qui les contiennent
    let garder = null, trouves = 0;
    if (filtre) {
      garder = new Set();
      for (const r of R.values()) {
        if ((vue === 'mes') !== aMoi(r)) continue;
        const ok = r.type === 'cours' ? correspond(r) : (!savoirFiltre && T.length && T.every((t) => sansAccent(r.titre).includes(t)));
        if (!ok) continue;
        if (r.type === 'cours') trouves++;
        garder.add(r.id); chemin(r).forEach((d) => garder.add(d.id));
        if (r.type === 'dossier') descendants(r.id).forEach((d) => garder.add(d.id));
      }
      compteur.textContent = `${trouves} cours trouvé${trouves > 1 ? 's' : ''}`;
    } else compteur.textContent = '';

    const noeud = (r, prof) => {
      if (garder && !garder.has(r.id)) return null;
      const dossier = r.type === 'dossier';
      const ouvert = dossier && (filtre || ouverts.has(r.id));
      const fils = dossier ? enfants(r.id) : [];
      const extraits = !dossier && T.length ? lignesSommaire(r.sommaire).filter((l) => T.some((t) => sansAccent(l.t).includes(t))).slice(0, 3) : [];
      const ligne = h('div', { class: 'noeud ' + r.type + (r.id === sel ? ' choisi' : '') + (filtre && !dossier ? ' trouve' : ''), style: { '--prof': prof },
        draggable: vue === 'mes' && !filtre ? 'true' : null, title: titreDe(r),
        onclick: () => choisir(r.id) },
      dossier ? h('button', { class: 'pli', type: 'button', title: ouvert ? 'Fermer' : 'Ouvrir', onclick: (e) => {
        e.stopPropagation(); if (ouverts.has(r.id)) ouverts.delete(r.id); else ouverts.add(r.id); memoOuverts(); dessinerArbre();
      } }, ouvert ? '▾' : '▸') : h('span', { class: 'pli vide' }),
      h('span', { class: 'ic' }, dossier ? (ouvert ? '📂' : '📁') : '📘'),
      h('span', { class: 'nom' }, surligner(titreDe(r), T),
        extraits.length ? h('span', { class: 'extraits' }, extraits.map((l) => h('small', {}, '↳ ', surligner(l.t, T)))) : null),
      !dossier && (r.savoirs || []).length ? h('span', { class: 'codes-mini' }, r.savoirs.slice(0, 2).map((c) => h('i', { title: libSavoir(c) }, c)), r.savoirs.length > 2 ? h('i', { title: r.savoirs.slice(2).join(', ') }, '+' + (r.savoirs.length - 2)) : null) : null,
      dossier ? h('span', { class: 'nb-cours', title: 'Nombre de cours dans ce dossier' }, nbCours(r.id)) : null,
      aMoi(r) && estPartage(r) ? h('span', { class: 'marque-partage', title: 'Partagé' }, '👥') : null);
      if (vue === 'mes' && !filtre) glissement(ligne, r);
      return h('div', { class: 'branche' }, ligne, ouvert ? fils.map((f) => noeud(f, prof + 1)) : null);
    };

    const l = racines();
    if (vue === 'partages') {
      const proprios = [...new Set(l.map((r) => r.proprietaire))];
      vider(zoneArbre, proprios.length ? proprios.map((u) => {
        const items = l.filter((r) => r.proprietaire === u).map((r) => noeud(r, 0)).filter(Boolean);
        return items.length ? h('div', { class: 'groupe-proprio' }, h('div', { class: 'tete-proprio' }, '👤 ', nomDe(u)), items) : null;
      }) : h('p', { class: 'vide' }, 'Aucun cours n’est encore partagé avec vous.'));
    } else {
      const items = l.map((r) => noeud(r, 0)).filter(Boolean);
      vider(zoneArbre, items.length ? items : h('div', { class: 'arbre-vide' },
        h('p', {}, filtre ? 'Aucun cours ne correspond à la recherche.' : 'Votre espace est vide.'),
        filtre ? null : h('p', { class: 'aide' }, 'Commencez par créer un dossier (par exemple « Série K – Santé et sécurité ») puis vos cours, ou importez directement vos fichiers Word.')),
      !filtre ? h('div', { class: 'depot-racine', ondragover: (e) => { if (glisse) { e.preventDefault(); e.currentTarget.classList.add('cible'); } },
        ondragleave: (e) => e.currentTarget.classList.remove('cible'),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('cible'); if (glisse) deplacer(glisse, null, null); } }, 'Déposer ici pour placer à la racine') : null);
    }
    if (filtre && !zoneArbre.querySelector('.noeud')) vider(zoneArbre, h('p', { class: 'vide' }, 'Aucun cours ne correspond à la recherche.'));
  }

  // glisser-déposer : sur un dossier → dedans ; sur un cours → juste avant lui
  function glissement(ligne, r) {
    ligne.addEventListener('dragstart', (e) => { glisse = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(r.id)); ligne.classList.add('glisse'); });
    ligne.addEventListener('dragend', () => { glisse = null; ligne.classList.remove('glisse'); zoneArbre.querySelectorAll('.dessus,.avant').forEach((x) => x.classList.remove('dessus', 'avant')); });
    ligne.addEventListener('dragover', (e) => {
      if (!glisse || glisse === r.id) return;
      if (descendants(glisse).some((d) => d.id === r.id)) return;
      e.preventDefault();
      const haut = e.offsetY < ligne.offsetHeight / 3;
      const dedans = r.type === 'dossier' && !haut;
      ligne.classList.toggle('dessus', dedans); ligne.classList.toggle('avant', !dedans);
    });
    ligne.addEventListener('dragleave', () => ligne.classList.remove('dessus', 'avant'));
    ligne.addEventListener('drop', (e) => {
      e.preventDefault();
      const dedans = ligne.classList.contains('dessus');
      ligne.classList.remove('dessus', 'avant');
      if (!glisse || glisse === r.id) return;
      if (dedans) { ouverts.add(r.id); memoOuverts(); deplacer(glisse, r.id, null); } else deplacer(glisse, r.parent_id, r.id);
    });
  }

  // ------------------------------------------------------------------ opérations
  async function renumeroter(liste) {
    const maj = liste.map((x, i) => [x, i + 1]).filter(([x, n]) => x.ordre !== n);
    for (const [x, n] of maj) { await db.modifier('cours', x.id, { ordre: n }); x.ordre = n; }
  }
  // déplacer l'élément id dans le dossier parent (null = racine), avant l'élément avant (null = à la fin)
  async function deplacer(id, parent, avant) {
    const r = R.get(id);
    if (!r || (parent && (parent === id || descendants(id).some((d) => d.id === parent)))) return;
    try {
      if (r.parent_id !== parent) { await db.modifier('cours', id, { parent_id: parent }); r.parent_id = parent; }
      const freres = enfants(parent, moi).filter((x) => x.id !== id);
      const i = avant ? freres.findIndex((x) => x.id === avant) : -1;
      freres.splice(i < 0 ? freres.length : i, 0, r);
      await renumeroter(freres);
      if (parent) ouverts.add(parent), memoOuverts();
      toast('Déplacé');
    } catch (e) { erreur(e); }
    dessinerArbre(); dessinerDetail();
  }
  async function monter(r, sens) {
    const freres = enfants(r.parent_id, moi), i = freres.indexOf(r), j = i + sens;
    if (j < 0 || j >= freres.length) return;
    [freres[i], freres[j]] = [freres[j], freres[i]];
    try { await renumeroter(freres); } catch (e) { erreur(e); }
    dessinerArbre();
  }
  // nouveau dossier / cours : dans le dossier ouvert (ou à côté du cours ouvert), sinon à la racine
  function parentCourant() {
    const s = sel && R.get(sel);
    if (!s || !aMoi(s) || vue !== 'mes') return null;
    return s.type === 'dossier' ? s.id : s.parent_id;
  }
  async function nouveau(type, parent = parentCourant(), valeurs = {}) {
    if (vue !== 'mes') { vue = 'mes'; majOnglets(); }
    try {
      const ordre = Math.max(0, ...enfants(parent, moi).map((x) => x.ordre)) + 1;
      const r = await db.ajouter('cours', { type, parent_id: parent, ordre, titre: type === 'dossier' ? 'Nouveau dossier' : 'Nouveau cours', ...valeurs });
      R.set(r.id, r);
      if (parent) ouverts.add(parent), memoOuverts();
      majOnglets(); choisir(r.id);
      const t = zoneDetail.querySelector('input.titre-cours'); if (t && !valeurs.titre) { t.focus(); t.select(); }
      return r;
    } catch (e) { erreur(e); return null; }
  }
  async function supprimer(r) {
    const d = descendants(r.id), nc = d.filter((x) => x.type === 'cours').length, nd = d.length - nc;
    const texte = r.type === 'dossier'
      ? `Supprimer le dossier « ${titreDe(r)} »${d.length ? ` et tout son contenu (${nc} cours${nd ? `, ${nd} sous-dossier(s)` : ''})` : ''} ? Cette suppression est définitive.`
      : `Supprimer le cours « ${titreDe(r)} » (son sommaire et ses savoirs associés) ? Le fichier du cours lui-même n’est pas touché.`;
    if (!(await confirmer('Supprimer', texte, 'Supprimer'))) return;
    try {
      await db.supprimer('cours', r.id);
      [r, ...d].forEach((x) => R.delete(x.id));
      P = P.filter((p) => R.has(p.cours_id));
      toast('Supprimé'); majOnglets(); majChoixSavoir(); choisir(r.parent_id && R.has(r.parent_id) ? r.parent_id : null);
    } catch (e) { erreur(e); }
  }
  // copie d'un élément (et de son contenu) dans mes cours
  async function copier(r, parent, suffixe = '') {
    try {
      const ordre = Math.max(0, ...enfants(parent, moi).map((x) => x.ordre)) + 1;
      const champs = (x) => ({ type: x.type, titre: x.titre, sommaire: x.sommaire, savoirs: x.savoirs || [] });
      const racine = await db.ajouter('cours', { ...champs(r), titre: titreDe(r) + suffixe, parent_id: parent, ordre });
      R.set(racine.id, racine);
      const file = [[r.id, racine.id]];
      while (file.length) {
        const [src, dst] = file.shift();
        for (const e of enfants(src)) {
          const n = await db.ajouter('cours', { ...champs(e), parent_id: dst, ordre: e.ordre });
          R.set(n.id, n); if (e.type === 'dossier') file.push([e.id, n.id]);
        }
      }
      toast(suffixe ? 'Dupliqué' : 'Copié dans mes cours');
      if (vue !== 'mes') vue = 'mes';
      majOnglets(); majChoixSavoir(); choisir(racine.id);
    } catch (e) { erreur(e); }
  }

  // ------------------------------------------------------------------ fenêtres
  // choisir un de mes dossiers (déplacer, destination d'un import)
  function arbreDossiers(courant, exclure = null) {
    let choix = courant ?? 0;
    const interdits = exclure ? new Set([exclure, ...descendants(exclure).map((d) => d.id)]) : new Set();
    const boite = h('div', { class: 'choix-dossier' });
    const ligne = (id, texte, prof) => h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } },
      h('input', { type: 'radio', name: 'dossier-dest', checked: (id ?? 0) === choix, onchange: () => { choix = id ?? 0; } }), texte);
    const branche = (parent, prof) => enfants(parent, moi).filter((x) => x.type === 'dossier' && !interdits.has(x.id))
      .flatMap((d) => [ligne(d.id, '📁 ' + titreDe(d), prof), ...branche(d.id, prof + 1)]);
    vider(boite, ligne(null, '🏠 Racine de mes cours', 0), branche(null, 1));
    return { el: boite, valeur: () => choix || null };
  }
  async function dialogueDeplacer(r) {
    const a = arbreDossiers(r.parent_id, r.type === 'dossier' ? r.id : null);
    const ok = await fenetre(`Déplacer « ${titreDe(r)} »`, h('div', {}, h('p', { class: 'aide' }, 'Choisissez le dossier de destination (vous pouvez aussi glisser-déposer dans l’arborescence).'), a.el),
      [{ texte: 'Annuler', valeur: false }, { texte: 'Déplacer ici', classe: 'principal', valeur: true }]);
    if (ok) deplacer(r.id, a.valeur(), null);
  }
  async function dialoguePartage(r) {
    const autres = (collegues || []).filter((c) => c.id !== moi);
    const coches = new Set(partagesDe(r.id).map((p) => p.destinataire));
    const tous = h('input', { type: 'checkbox', checked: r.partage_tous });
    const herite = partageHerite(r);
    const liste = h('div', { class: 'liste-choix colonnes' }, autres.length ? autres.map((c) => h('label', { class: 'option' },
      h('input', { type: 'checkbox', checked: coches.has(c.id), onchange: (e) => (e.target.checked ? coches.add(c.id) : coches.delete(c.id)) }), c.nom))
      : h('p', { class: 'vide' }, 'Aucun autre enseignant n’a encore de compte.'));
    const ok = await fenetre(`Partager « ${titreDe(r)} »`, h('div', { class: 'partage-cours' },
      h('p', { class: 'aide' }, r.type === 'dossier'
        ? 'Les collègues choisis pourront consulter ce dossier et tout son contenu (y compris les cours ajoutés plus tard), les imprimer et les copier dans leur propre espace. Ils ne peuvent rien modifier.'
        : 'Les collègues choisis pourront consulter ce cours, l’imprimer et le copier dans leur propre espace. Ils ne peuvent rien modifier.'),
      herite ? h('p', { class: 'info-herite' }, `ℹ Déjà partagé par le dossier « ${titreDe(herite)} »${herite.partage_tous ? ' avec toute l’équipe' : ' avec : ' + partagesDe(herite.id).map((p) => nomDe(p.destinataire)).join(', ')}.`) : null,
      h('label', { class: 'option tous' }, tous, h('b', {}, 'Toute l’équipe'), h('small', {}, ' (tous les enseignants, y compris ceux qui arriveront plus tard)')),
      h('p', { class: 'sous-titre-choix' }, 'Ou seulement certains collègues :'), liste),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer le partage', classe: 'principal', valeur: true }]);
    if (!ok) return;
    try {
      if (tous.checked !== r.partage_tous) { await db.modifier('cours', r.id, { partage_tous: tous.checked }); r.partage_tous = tous.checked; }
      const avant = new Set(partagesDe(r.id).map((p) => p.destinataire));
      for (const u of avant) if (!coches.has(u)) await db.supprimer('cours_partages', u, `cours_id=eq.${r.id}&destinataire`);
      const ajout = [...coches].filter((u) => !avant.has(u)).map((u) => ({ cours_id: r.id, destinataire: u }));
      if (ajout.length) await db.ajouter('cours_partages', ajout);
      P = P.filter((p) => p.cours_id !== r.id).concat([...coches].map((u) => ({ cours_id: r.id, destinataire: u })));
      toast(tous.checked || coches.size ? 'Partage enregistré' : 'Partage retiré : de nouveau privé');
    } catch (e) { erreur(e); }
    dessinerArbre(); dessinerDetail();
  }
  async function choisirSavoirs(r, apres) {
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
    const ok = await fenetre('Savoirs associés au cours', h('div', {}, rech, corps), [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true });
    if (!ok) return;
    const ordre = ref.savoirs.map((s) => s.code);
    const val = [...choix].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
    try { await db.modifier('cours', r.id, { savoirs: val }); r.savoirs = val; toast('Enregistré'); majChoixSavoir(); dessinerArbre(); apres(); } catch (e) { erreur(e); }
  }

  // import de fichiers Word : un cours par fichier, sommaire = titres du document
  async function importerWord(parent = parentCourant()) {
    const fichiers = h('input', { type: 'file', accept: '.docx', multiple: true });
    const niveaux = h('select', { class: 'champ' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === 3 }, n === 1 ? 'Titres de niveau 1' : `Titres de niveaux 1 à ${n}`)));
    const numeroter = h('input', { type: 'checkbox', checked: true });
    const dest = arbreDossiers(parent);
    const apercu = h('div', { class: 'apercu-import' }, h('p', { class: 'aide' }, 'Choisissez un ou plusieurs fichiers .docx.'));
    let lus = [];
    const lire = async () => {
      vider(apercu, h('p', { class: 'aide' }, 'Lecture…'));
      lus = [];
      for (const f of fichiers.files) {
        try { lus.push({ f, ...(await lireWord(f, ref, { niveaux: Number(niveaux.value), numeroter: numeroter.checked })) }); }
        catch (e) { lus.push({ f, erreur: e.message }); }
      }
      vider(apercu, lus.length ? h('table', { class: 'table-import' }, h('tr', {}, h('th', {}, 'Cours'), h('th', {}, 'Sommaire'), h('th', {}, 'Savoirs reconnus')),
        lus.map((x) => h('tr', {}, x.erreur ? h('td', { colspan: 3, class: 'erreur' }, x.erreur) : [
          h('td', {}, h('input', { class: 'champ', value: x.titre, oninput: (e) => { x.titre = e.target.value; } })),
          h('td', { class: x.nb ? '' : 'alerte' }, x.nb ? `${x.nb} titre(s)` : 'aucun titre trouvé'),
          h('td', {}, x.savoirs.join(', ') || '—')]))) : h('p', { class: 'aide' }, 'Aucun fichier choisi.'));
    };
    fichiers.addEventListener('change', lire); niveaux.addEventListener('change', lire); numeroter.addEventListener('change', lire);
    const ok = await fenetre('Créer des cours à partir de fichiers Word', h('div', { class: 'import-word' },
      h('p', { class: 'aide' }, 'Pour chaque fichier Word (.docx), seuls trois éléments sont repris : le titre du cours (ou le nom du fichier), son sommaire (les titres « Titre 1 », « Titre 2 »… du document) et les codes des savoirs du référentiel cités dans le texte (S11-1…). Le contenu du cours et le fichier lui-même ne sont ni copiés ni envoyés sur le site : le fichier est seulement lu sur votre ordinateur.'),
      h('div', { class: 'formulaire' }, h('label', { class: 'large' }, 'Fichiers Word', fichiers), h('label', {}, 'Sommaire', niveaux),
        h('label', { class: 'case' }, numeroter, ' Numéroter les titres (1., 1.1, 1.1.1)')),
      apercu, h('p', { class: 'sous-titre-choix' }, 'Ranger les cours dans :'), dest.el),
    [{ texte: 'Annuler', valeur: false }, { texte: '＋  Créer les cours (titre, sommaire, savoirs)', classe: 'principal', action: () => {
      if (!lus.some((x) => !x.erreur)) throw new Error('Choisissez au moins un fichier Word lisible.');
      return true;
    } }], { large: true });
    if (!ok) return;
    const p = dest.valeur();
    let n = 0, dernier = null;
    try {
      let ordre = Math.max(0, ...enfants(p, moi).map((x) => x.ordre));
      for (const x of lus.filter((y) => !y.erreur)) {
        const r = await db.ajouter('cours', { type: 'cours', parent_id: p, ordre: ++ordre, titre: x.titre.trim() || 'Cours importé', sommaire: x.sommaire, savoirs: x.savoirs });
        R.set(r.id, r); n++; dernier = r;
      }
      toast(`${n} cours créé(s)`);
    } catch (e) { erreur(e); }
    if (p) ouverts.add(p), memoOuverts();
    vue = 'mes'; majOnglets(); majChoixSavoir();
    choisir(n === 1 && dernier ? dernier.id : p);
  }

  // ------------------------------------------------------------------ détail
  function filAriane(r) {
    return h('nav', { class: 'fil-cours' },
      h('button', { class: 'lien', type: 'button', onclick: () => choisir(null) }, aMoi(r) ? '🏠 Mes cours' : '👤 ' + nomDe(r.proprietaire)),
      chemin(r).flatMap((d) => [h('span', {}, ' › '), h('button', { class: 'lien', type: 'button', onclick: () => choisir(d.id) }, titreDe(d))]));
  }
  function dessinerDetail() {
    const r = sel ? R.get(sel) : null;
    if (!r) return accueilDetail();
    const modif = aMoi(r);
    const T = termesDe(q);
    const enr = (col) => async (v) => { await db.modifier('cours', r.id, { [col]: v }); r[col] = v; r.maj_le = new Date().toISOString(); if (col === 'titre' || col === 'sommaire') dessinerArbre(); };
    const partage = modif ? (r.partage_tous ? 'toute l’équipe' : partagesDe(r.id).map((p) => nomDe(p.destinataire)).join(', ')) : '';
    const herite = modif ? partageHerite(r) : null;
    const boutons = modif ? [
      h('button', { class: 'btn petit', title: 'Monter', onclick: () => monter(r, -1) }, '↑'),
      h('button', { class: 'btn petit', title: 'Descendre', onclick: () => monter(r, 1) }, '↓'),
      h('button', { class: 'btn petit', onclick: () => dialogueDeplacer(r) }, '⇄ Déplacer'),
      h('button', { class: 'btn petit' + (estPartage(r) ? ' partage-actif' : ''), onclick: () => dialoguePartage(r) }, estPartage(r) ? '👥 Partagé' : '👥 Partager'),
      r.type === 'cours' ? h('button', { class: 'btn petit', onclick: () => copier(r, r.parent_id, ' (copie)') }, '⧉ Dupliquer') : null,
      h('button', { class: 'btn petit', onclick: () => dialoguePDF(r.id) }, '⬇ PDF'),
      h('button', { class: 'btn petit danger', onclick: () => supprimer(r) }, '✖ Supprimer')]
      : [h('button', { class: 'btn petit principal', onclick: () => copier(r, null) }, '⧉ Copier dans mes cours'),
        h('button', { class: 'btn petit', onclick: () => dialoguePDF(r.id) }, '⬇ PDF')];
    const tete = h('div', { class: 'tete-detail' }, filAriane(r),
      h('div', { class: 'ligne-titre' }, h('span', { class: 'ic-grand' }, r.type === 'dossier' ? '📁' : '📘'),
        modif ? Object.assign(champ(r.titre, enr('titre'), { classe: 'titre-cours', placeholder: r.type === 'dossier' ? 'Nom du dossier' : 'Titre du cours' }), { maxLength: 300 }) : h('h2', { class: 'titre-cours' }, surligner(titreDe(r), T))),
      h('div', { class: 'boutons-detail' }, boutons),
      modif && (partage || herite) ? h('p', { class: 'info-partage' }, '👥 ', partage ? `Partagé avec ${partage}` : '', partage && herite ? ' · ' : '', herite ? `partagé avec le dossier « ${titreDe(herite)} »` : '')
        : !modif ? h('p', { class: 'info-partage' }, `👤 Partagé par ${nomDe(r.proprietaire)} · consultation seule`) : null);

    if (r.type === 'dossier') {
      const fils = enfants(r.id);
      vider(zoneDetail, tete,
        h('div', { class: 'carte-detail' },
          h('div', { class: 'entete-bloc' }, h('h3', {}, `Contenu · ${nbCours(r.id)} cours`),
            modif ? h('div', { class: 'boutons-detail' },
              h('button', { class: 'btn petit principal', onclick: () => nouveau('cours', r.id) }, '＋ Cours'),
              h('button', { class: 'btn petit', onclick: () => nouveau('dossier', r.id) }, '📁 Sous-dossier'),
              h('button', { class: 'btn petit', onclick: () => importerWord(r.id) }, '📄 Sommaires depuis Word'),
              fils.length > 1 ? h('button', { class: 'btn petit', title: 'Classer le contenu par ordre alphabétique (K2 avant K10)', onclick: async () => {
                try { await renumeroter([...fils].sort((a, b) => compareTitres(titreDe(a), titreDe(b)))); toast('Classé de A à Z'); } catch (e) { erreur(e); }
                dessinerArbre(); dessinerDetail();
              } }, 'A→Z Classer') : null) : null),
          fils.length ? h('ul', { class: 'liste-contenu' }, fils.map((f) => h('li', {}, h('button', { class: 'lien', type: 'button', onclick: () => choisir(f.id) },
            h('span', {}, f.type === 'dossier' ? '📁 ' : '📘 '), h('b', {}, titreDe(f)),
            f.type === 'dossier' ? h('small', {}, ` · ${nbCours(f.id)} cours`) : h('small', {}, ` · ${lignesSommaire(f.sommaire).length} titre(s)${(f.savoirs || []).length ? ' · ' + f.savoirs.join(' ') : ''}`)))))
            : h('p', { class: 'vide' }, 'Dossier vide.')));
      return;
    }

    // cours
    const apercu = h('div', { class: 'zone-apercu' }, apercuSommaire(r.sommaire, T));
    let saisie = null;
    if (modif) {
      saisie = champ(r.sommaire, async (v) => { await enr('sommaire')(v); }, { multi: true, classe: 'saisie-sommaire', placeholder: '1. Premier titre\n  1.1 Sous-titre\n  1.2 Sous-titre\n2. Deuxième titre\n…' });
      saisie.maxLength = 20000;
      saisie.addEventListener('input', () => vider(apercu, apercuSommaire(saisie.value, T)));
      // Tab / Maj+Tab : décaler les lignes sélectionnées d'un niveau
      saisie.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const v = saisie.value, a = saisie.selectionStart, b = saisie.selectionEnd;
        const debut = v.lastIndexOf('\n', a - 1) + 1, finL = v.indexOf('\n', b === a ? b : b - 1), fin = finL < 0 ? v.length : finL;
        const bloc = v.slice(debut, fin).split('\n').map((l) => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l)).join('\n');
        saisie.value = v.slice(0, debut) + bloc + v.slice(fin);
        if (a === b) { const c = Math.max(debut, a + bloc.length - (fin - debut)); saisie.selectionStart = saisie.selectionEnd = c; }   // curseur gardé à sa place
        else { saisie.selectionStart = debut; saisie.selectionEnd = debut + bloc.length; }
        saisie.dispatchEvent(new Event('input'));
      });
    }
    const zoneSavoirs = h('div', { class: 'savoirs-cours' });
    const dessinerSavoirs = () => vider(zoneSavoirs,
      (r.savoirs || []).length ? (r.savoirs || []).map((c) => h('div', { class: 'code', title: libSavoir(c) }, h('b', { class: ref.sav[c] ? '' : 'inconnu' }, surligner(c, T)), h('span', {}, surligner(libSavoir(c), T))))
        : h('p', { class: 'vide-sommaire' }, 'Aucun savoir associé.'),
      modif ? h('button', { class: 'lien petit', type: 'button', onclick: () => choisirSavoirs(r, dessinerSavoirs) }, (r.savoirs || []).length ? '✎ modifier' : '＋ choisir dans le référentiel') : null);
    dessinerSavoirs();
    vider(zoneDetail, tete,
      h('div', { class: 'carte-detail' },
        h('div', { class: 'entete-bloc' }, h('h3', {}, 'Sommaire détaillé'),
          modif ? h('button', { class: 'btn petit', type: 'button', title: 'Remplacer le sommaire par les titres d’un fichier Word', onclick: async () => {
            const inp = h('input', { type: 'file', accept: '.docx' });
            inp.onchange = async () => {
              const f = inp.files[0]; if (!f) return;
              try {
                const x = await lireWord(f, ref);
                if (!x.nb) throw new Error('Aucun titre trouvé dans ce document (styles « Titre 1 », « Titre 2 »…).');
                if (r.sommaire.trim() && !(await confirmer('Remplacer le sommaire', `Remplacer le sommaire actuel par les ${x.nb} titres de « ${f.name} » ?`, 'Remplacer'))) return;
                const sav = [...new Set([...(r.savoirs || []), ...x.savoirs])];
                const ordre = ref.savoirs.map((s) => s.code); sav.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
                await db.modifier('cours', r.id, { sommaire: x.sommaire, savoirs: sav }); r.sommaire = x.sommaire; r.savoirs = sav;
                toast(`Sommaire repris (${x.nb} titres${x.savoirs.length ? ', savoirs : ' + x.savoirs.join(' ') : ''})`);
                majChoixSavoir(); dessinerArbre(); dessinerDetail();
              } catch (e) { erreur(e); }
            };
            inp.click();
          } }, '📄 Lire les titres d’un fichier Word') : null),
        modif ? h('p', { class: 'aide' }, 'Une ligne par titre. Décalez les sous-titres avec la touche Tab (Maj+Tab pour revenir), ou commencez la ligne par « - » / « -- ». Enregistrement automatique.') : null,
        h('div', { class: modif ? 'sommaire-double' : 'sommaire-seul' }, modif ? h('div', { class: 'col-saisie' }, h('small', { class: 'lib-col' }, 'Saisie'), saisie) : null,
          h('div', { class: 'col-apercu' }, modif ? h('small', { class: 'lib-col' }, 'Aperçu') : null, apercu))),
      h('div', { class: 'carte-detail' }, h('h3', {}, 'Savoirs associés'), zoneSavoirs),
      h('p', { class: 'dates-cours' }, `Créé le ${dateHeure(r.cree_le)} · modifié le ${dateHeure(r.maj_le)}`));
    if (saisie) requestAnimationFrame(() => ajuster(saisie));
  }
  function accueilDetail() {
    const l = [...R.values()].filter((r) => (vue === 'mes') === aMoi(r));
    const nc = l.filter((r) => r.type === 'cours').length, nd = l.length - nc;
    const sav = new Set(l.flatMap((r) => r.savoirs || []));
    vider(zoneDetail, h('div', { class: 'carte-detail accueil-cours' },
      h('h2', {}, vue === 'mes' ? '📚 Mon espace de cours' : '👥 Cours partagés avec moi'),
      h('div', { class: 'chiffres-cours' },
        h('div', {}, h('b', {}, nc), h('span', {}, 'cours')), h('div', {}, h('b', {}, nd), h('span', {}, 'dossiers')),
        h('div', { title: 'Savoirs du référentiel associés à au moins un cours' }, h('b', {}, `${sav.size} / ${ref.savoirs.length}`), h('span', {}, 'savoirs associés'))),
      vue === 'mes' ? h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, 'Ranger : '), 'créez des dossiers et sous-dossiers, puis glissez-déposez les cours (ou bouton « ⇄ Déplacer »).'),
        h('li', {}, h('b', {}, 'Remplir vite : '), '« 📄 Sommaires depuis Word » crée un cours par fichier en reprenant seulement son titre, son sommaire et les savoirs cités (le fichier n’est pas copié).'),
        h('li', {}, h('b', {}, 'Retrouver : '), 'la recherche porte sur les titres, les sommaires et les savoirs ; la liste « savoirs associés » montre tous les cours d’un savoir.'),
        h('li', {}, h('b', {}, 'Partager : '), 'ouvrez un dossier ou un cours puis « 👥 Partager » : vos collègues le consultent, l’impriment ou le copient, sans pouvoir le modifier.'),
        h('li', {}, h('b', {}, 'Séquençage : '), 'dans « Cours mobilisés », « ＋ depuis mes cours » coche vos cours : leurs savoirs associés s’ajoutent à la séance.'),
        h('li', {}, h('b', {}, 'Imprimer : '), '« ⬇ PDF / Imprimer » : cochez tout ou partie de vos cours, avec ou sans les sommaires.'))
        : h('p', { class: 'aide' }, 'Cours et dossiers que vos collègues ont partagés avec vous, en consultation. « ⧉ Copier dans mes cours » en fait une copie modifiable dans votre espace.')));
  }

  // ------------------------------------------------------------------ PDF
  async function dialoguePDF(depuis = null) {
    const base = depuis ? [R.get(depuis)] : racines();
    const coches = new Set();
    const tousDe = (r) => [r, ...descendants(r.id)];
    base.forEach((r) => tousDe(r).forEach((x) => coches.add(x.id)));
    const boite = h('div', { class: 'choix-dossier arbre-pdf' });
    const dessiner = () => {
      const ligne = (r, prof) => {
        const cb = h('input', { type: 'checkbox', checked: coches.has(r.id), onchange: (e) => {
          tousDe(r).forEach((x) => (e.target.checked ? coches.add(x.id) : coches.delete(x.id)));
          if (e.target.checked) chemin(r).forEach((d) => coches.add(d.id));
          dessiner();
        } });
        return [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, cb, r.type === 'dossier' ? '📁 ' : '📘 ', titreDe(r),
          !aMoi(r) && prof === 0 ? h('small', {}, ' · ' + nomDe(r.proprietaire)) : null),
        ...(r.type === 'dossier' ? enfants(r.id).flatMap((f) => ligne(f, prof + 1)) : [])];
      };
      vider(boite, base.flatMap((r) => ligne(r, 0)));
    };
    dessiner();
    const optSommaire = h('input', { type: 'checkbox', checked: true }), optSavoirs = h('input', { type: 'checkbox', checked: true });
    const mode = await fenetre('PDF / impression de mes cours', h('div', { class: 'dialogue-pdf-cours' },
      h('div', { class: 'boutons-detail' },
        h('button', { class: 'btn petit', type: 'button', onclick: () => { base.forEach((r) => tousDe(r).forEach((x) => coches.add(x.id))); dessiner(); } }, 'Tout cocher'),
        h('button', { class: 'btn petit', type: 'button', onclick: () => { coches.clear(); dessiner(); } }, 'Tout décocher')),
      boite,
      h('div', { class: 'options-pdf' }, h('b', {}, 'Contenu : '),
        h('label', { class: 'case' }, optSommaire, ' sommaires détaillés'), h('label', { class: 'case' }, optSavoirs, ' savoirs associés')),
      h('p', { class: 'aide' }, 'Sans les sommaires détaillés, le PDF est une liste des cours sous forme de tableau.')),
    [{ texte: 'Annuler', valeur: null }, { texte: '🖶  Imprimer', valeur: 'imprimer' }, { texte: '⬇  Télécharger le PDF', classe: 'principal', valeur: 'pdf' }], { large: true });
    if (!mode) return;
    const choisis = [];
    const parcourir = (liste) => liste.forEach((r) => { if (coches.has(r.id)) choisis.push(r); if (r.type === 'dossier') parcourir(enfants(r.id)); });
    parcourir(base);
    const lesCours = choisis.filter((r) => r.type === 'cours');
    if (!lesCours.length) { toast('Aucun cours coché', 'erreur'); return; }
    envoyerPDF(documentPDF(lesCours, { sommaire: optSommaire.checked, savoirs: optSavoirs.checked }, depuis ? R.get(depuis) : null), mode);
  }
  function documentPDF(lesCours, opt, depuis) {
    const proprios = [...new Set(lesCours.map((r) => r.proprietaire))];
    const auteur = proprios.length === 1 ? (proprios[0] === moi ? (ctx.enseignants.find((e) => e.profil_id === moi)?.nom || ctx.profil.nom || nomDe(moi)) : nomDe(proprios[0])) : 'Plusieurs enseignants';
    const cheminTexte = (r) => chemin(r).map(titreDe).join(' › ');
    const savTexte = (r) => (r.savoirs || []).map((c) => `${c} ${libSavoir(c)}`);
    const nbSav = new Set(lesCours.flatMap((r) => r.savoirs || [])).size;
    const titre = depuis ? titreDe(depuis) : 'Mes cours ressources';
    const blocs = [
      { t: 'titre', texte: depuis ? titre : 'COURS RESSOURCES', sous: `${auteur}${depuis ? '' : ' · ' + (vue === 'mes' ? 'mes cours' : 'cours partagés')}`, couleur: '#1E8F86' },
      { t: 'infos', paires: [['Enseignant', auteur], ['Édité le', new Date().toLocaleDateString('fr-FR')], ['Cours', String(lesCours.length)], ['Savoirs associés', `${nbSav} savoir(s) différent(s)`]] },
    ];
    // liste des cours (tableau groupé par dossier)
    const lignes = []; let grp = null;
    for (const r of lesCours) {
      const g = cheminTexte(r) || 'Racine';
      if (g !== grp) { grp = g; lignes.push({ groupe: g }); }
      const cell = [titreDe(r)];
      if (opt.savoirs) cell.push((r.savoirs || []).join(', '));
      if (!opt.sommaire) cell.splice(1, 0, String(lignesSommaire(r.sommaire).length || '—'));
      lignes.push(cell);
    }
    const colonnes = [{ titre: 'Cours', part: 55, gras: true }];
    if (!opt.sommaire) colonnes.push({ titre: 'Titres', part: 9, centre: true });
    if (opt.savoirs) colonnes.push({ titre: 'Savoirs associés', part: 36 });
    blocs.push({ t: 'table', titre: opt.sommaire ? 'Liste des cours' : 'Cours', colonnes, lignes, taille: 8 });
    if (opt.sommaire) {
      let dossier = null;
      for (const r of lesCours) {
        const g = cheminTexte(r);
        if (g !== dossier) { dossier = g; if (g) blocs.push({ t: 'dossier', texte: g }); }
        blocs.push({ t: 'cours', titre: titreDe(r), lignes: lignesSommaire(r.sommaire),
          savoirs: opt.savoirs ? savTexte(r) : [] });
      }
    }
    return { fichier: nomFichier(`Cours_${depuis ? titre : 'ressources'}_${auteur}.pdf`), titre, pied: `Cours ressources · ${auteur} · ${new Date().toLocaleDateString('fr-FR')}`, blocs };
  }

  majOnglets(); majChoixSavoir(); dessinerArbre(); dessinerDetail();
}
