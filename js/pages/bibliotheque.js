// Ma bibliothèque : bibliothèque personnelle de chaque enseignant :
// thèmes et sous-thèmes (tuiles), ouvrages (fiche, couverture, sommaire avec les pages), recherche dans les sommaires.
// Les fichiers restent sur le Nuage de l'enseignant ; un ouvrage ou un thème peut être partagé avec des collègues.
// #/biblio : accueil · #/biblio/t-ID : un thème · #/biblio/l-ID : un ouvrage · #/biblio/partages : partagés avec moi
import { db } from '../api.js';
import { h, vider, toast, erreur, confirmer, fenetre } from '../ui.js';
import {
  sansAccent, compareTitres, pluriel, chargerReglages, reglagesDe, adresseFichier, adresseDossier, accueilNuage, dialogueReglages,
  chargerCollegues, nomCollegue, lirePdf, ouvrirPdf, signetsPdf, textePages, sommaireDepuisTexte, imagePage, reduireImage,
  choisirDossier, cheminRelatif, ignore, grainDeBois, couleurTranche, dialoguePartage, progression,
} from '../ressources.js';

const A_COMPLETER = { scan: 'PDF scanné', aucun: 'Sommaire introuvable', protege: 'PDF protégé', erreur: 'PDF illisible' };
const CLE_GESTION = 'pilotage-scbh-biblio-gestion';
let cache = null;            // { themes, livres, partages, t }
let recherche = '';          // gardée d'une page à l'autre

async function charger(force) {
  if (cache && !force && Date.now() - cache.t < 120000) return cache;
  const [themes, livres, partages] = await Promise.all([db.lire('biblio_themes', 'order=ordre,id'), db.lire('biblio_livres', 'order=ordre,id'), db.lire('biblio_partages')]);
  cache = { themes: new Map(themes.map((t) => [t.id, t])), livres: new Map(livres.map((l) => [l.id, l])), partages, t: Date.now() };
  return cache;
}
export const oublierBibliotheque = () => { cache = null; };

export async function pageBibliotheque(zone, arg, ctx) {
  if (!ctx.peutEcrire()) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📖  Ma bibliothèque')), h('p', { class: 'vide' }, 'Cet espace personnel est réservé aux enseignants.')); return; }
  const moi = ctx.profil.id;
  let C;
  try { [C] = await Promise.all([charger(), chargerReglages(), chargerCollegues()]); }
  catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📖  Ma bibliothèque')), h('div', { class: 'erreur-page' }, h('h2', {}, 'Espace pas encore installé'),
      h('p', {}, ctx.estAdmin() ? 'Exécutez le script « 25_bibliotheque.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord terminer l’installation de cet espace.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const ref = await ctx.referentiel();
  const { themes: T, livres: L } = C;
  let gestion = (() => { try { return sessionStorage.getItem(CLE_GESTION) === '1'; } catch { return false; } })();

  // ------------------------------------------------------------------ outils
  const aMoi = (x) => x.proprietaire === moi;
  const sousThemes = (id, proprio = null) => [...T.values()].filter((t) => (t.parent_id ?? null) === id && (proprio === null || t.proprietaire === proprio)).sort((a, b) => a.ordre - b.ordre || compareTitres(a.nom, b.nom));
  const livresDe = (id, proprio) => [...L.values()].filter((l) => (l.theme_id ?? null) === id && (id !== null || l.proprietaire === proprio)).sort((a, b) => a.ordre - b.ordre || compareTitres(a.titre, b.titre));
  const descendants = (id) => { const o = []; const p = [id]; while (p.length) { const x = p.pop(); for (const t of sousThemes(x)) { o.push(t); p.push(t.id); } } return o; };
  const total = (id) => [id, ...descendants(id).map((t) => t.id)].reduce((s, x) => s + livresDe(x).length, 0);
  const chemin = (t) => { const l = []; let p = t; let n = 0; while (p && n++ < 50) { l.unshift(p); p = p.parent_id ? T.get(p.parent_id) : null; } return l; };
  const P = () => C.partages;
  const partagesDe = (cle, id) => P().filter((p) => p[cle] === id);
  const estPartage = (x, cle) => x.partage_tous || partagesDe(cle, x.id).length > 0;
  const urlLivre = (l, page) => {
    if (l.lien) return l.lien + (page ? '#page=' + page : '');
    const r = reglagesDe(l.proprietaire), u = adresseFichier(r.lien_bibliotheque, l.chemin, r.format_liens);
    return u ? u + (page && r.format_liens !== 'telechargement' ? '#page=' + page : '') : '';
  };
  const urlTheme = (t) => adresseDossier(reglagesDe(t.proprietaire).lien_bibliotheque, t.dossier);
  const libSavoir = (c) => ref.sav[c]?.libelle || '';
  const memoGestion = (v) => { gestion = v; try { sessionStorage.setItem(CLE_GESTION, v ? '1' : '0'); } catch { /* sans stockage */ } };
  const recharger = () => ctx.recharger();

  // route
  const [k, idTxt] = String(arg || '').split('-');
  const themeCourant = k === 't' ? T.get(Number(idTxt)) : null;
  const livreCourant = k === 'l' ? L.get(Number(idTxt)) : null;
  const vue = arg === 'partages' || (themeCourant && !aMoi(themeCourant)) || (livreCourant && !aMoi(livreCourant)) ? 'partages' : 'mes';
  const modif = vue === 'mes' && gestion;

  const mesLivres = [...L.values()].filter(aMoi), sesLivres = [...L.values()].filter((l) => !aMoi(l));
  const reglage = reglagesDe(moi);

  // ------------------------------------------------------------------ squelette
  const contenu = h('div', { class: 'contenu-biblio' });
  const champ = h('input', { class: 'recherche-biblio', type: 'search', value: recherche, placeholder: 'Rechercher dans les titres, auteurs et sommaires : contreventement, lamellé-collé, DTU 31.2…', 'aria-label': 'Rechercher dans la bibliothèque',
    oninput: () => { recherche = champ.value; dessiner(); } });
  vider(zone,
    h('header', { class: 'entete-biblio', style: { '--fond-biblio': grainDeBois('entete-bibliotheque-' + moi) + ' center/cover' } },
      h('div', { class: 'tete-biblio' },
        h('div', {}, h('h1', {}, '📖  Ma bibliothèque'),
          h('p', { class: 'sous-titre' }, `${pluriel(mesLivres.length, 'ouvrage', 'ouvrages')} · ${pluriel([...T.values()].filter(aMoi).length, 'thème', 'thèmes')}${sesLivres.length ? ` · ${sesLivres.length} partagé(s) avec moi` : ''} · fichiers sur votre Nuage`)),
        h('div', { class: 'actions-page' },
          h('button', { class: 'btn principal', onclick: () => ajouterLivres(themeCourant && aMoi(themeCourant) ? themeCourant.id : null) }, '＋  Ajouter des livres'),
          h('button', { class: 'btn', title: 'Relire votre dossier de bibliothèque (synchronisé avec Nuage) : nouveaux fichiers, nouveaux dossiers, fichiers disparus', onclick: () => mettreAJour() }, '↻  Mettre à jour depuis mon dossier'),
          h('button', { class: 'btn', onclick: () => partagerLot() }, '👥  Partager'),
          h('button', { class: 'btn', onclick: () => dialogueReglages(ctx, recharger) }, '⚙  Réglages Nuage'),
          h('button', { class: 'btn' + (gestion ? ' actif-gestion' : ''), title: 'Créer, renommer, ranger les thèmes ; modifier ou supprimer les fiches', onclick: () => { memoGestion(!gestion); recharger(); } }, gestion ? '✔  Terminer la gestion' : '✎  Gérer'))),
      h('div', { class: 'zone-recherche-biblio' }, champ, recherche ? h('button', { class: 'effacer-recherche', type: 'button', title: 'Effacer', onclick: () => { recherche = ''; champ.value = ''; dessiner(); champ.focus(); } }, '×') : null)),
    h('nav', { class: 'onglets onglets-cours' },
      h('a', { href: '#/biblio', class: vue === 'mes' ? 'actif' : '' }, `📖 Ma bibliothèque (${mesLivres.length})`),
      h('a', { href: '#/biblio/partages', class: vue === 'partages' ? 'actif' : '' }, `👥 Partagés avec moi (${sesLivres.length})`)),
    !reglage.lien_bibliotheque && vue === 'mes' ? h('div', { class: 'avertissement' }, '🔗  Pour ouvrir vos fichiers depuis le site, collez le lien de partage du dossier de votre bibliothèque dans ',
      h('button', { class: 'lien', type: 'button', onclick: () => dialogueReglages(ctx, recharger) }, '⚙ Réglages Nuage'), '.') : null,
    contenu);

  // ------------------------------------------------------------------ rendu
  function dessiner() {
    if (recherche.trim()) return vider(contenu, resultats());
    if (livreCourant) return vider(contenu, ficheLivre(livreCourant));
    if (themeCourant) return vider(contenu, pageTheme(themeCourant));
    vider(contenu, vue === 'mes' ? accueil() : accueilPartages());
  }
  function ariane(t, dernierLien = false) {
    const l = t ? chemin(t) : [];
    return h('nav', { class: 'ariane-biblio' }, h('a', { href: vue === 'mes' ? '#/biblio' : '#/biblio/partages' }, vue === 'mes' ? 'Accueil' : 'Partagés avec moi'),
      l.map((x, i) => [' › ', i === l.length - 1 && !dernierLien ? h('b', {}, x.nom) : h('a', { href: '#/biblio/t-' + x.id }, x.nom)]));
  }
  function tuile(t) {
    const n = total(t.id), ns = sousThemes(t.id).length;
    const el = h('a', { class: 'tuile-biblio', href: '#/biblio/t-' + t.id, style: { backgroundImage: t.image ? `url("${t.image}")` : grainDeBois(chemin(t).map((x) => x.nom).join('/')) }, 'data-id': t.id },
      h('div', { class: 'etiquette-tuile' }, h('div', { class: 'nom' }, t.nom),
        h('div', { class: 'compte' }, [ns ? pluriel(ns, 'sous-thème', 'sous-thèmes') : '', pluriel(n, 'ouvrage', 'ouvrages')].filter(Boolean).join(' · '),
          aMoi(t) && estPartage(t, 'theme_id') ? ' · 👥' : '')),
      modif ? h('div', { class: 'outils-tuile' },
        h('button', { type: 'button', title: 'Modifier le thème', onclick: (e) => { e.preventDefault(); modifierTheme(t); } }, '✎'),
        h('button', { type: 'button', title: 'Partager le thème', onclick: (e) => { e.preventDefault(); partagerUn('theme_id', t); } }, '👥'),
        h('button', { type: 'button', title: 'Supprimer le thème', onclick: (e) => { e.preventDefault(); supprimerTheme(t); } }, '✖')) : null);
    if (modif) glisserTuile(el, t);
    return el;
  }
  function tuiles(liste, parent) {
    return h('div', { class: 'tuiles-biblio' }, liste.map(tuile),
      modif ? h('button', { class: 'tuile-biblio nouvelle', type: 'button', onclick: () => nouveauTheme(parent) }, h('span', { class: 'plus' }, '＋'), h('span', {}, parent ? 'Nouveau sous-thème' : 'Nouveau thème')) : null);
  }
  function accueil() {
    const racines = sousThemes(null, moi), nonClasses = livresDe(null, moi);
    if (!racines.length && !nonClasses.length) return h('div', { class: 'carte-detail accueil-cours' },
      h('h2', {}, '📖 Votre bibliothèque est vide'),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, 'Depuis Nuage : '), 'rangez vos fichiers sur Nuage dans un dossier « Bibliothèque » avec un sous-dossier par thème, puis « ↻ Mettre à jour depuis mon dossier » (le dossier synchronisé sur votre ordinateur) : le site crée les thèmes et les fiches.'),
        h('li', {}, h('b', {}, 'Ou à la main : '), '« ✎ Gérer » → « ＋ Nouveau thème », puis « ＋ Ajouter des livres ».')));
    return h('div', {}, modif ? h('p', { class: 'aide' }, 'Mode gestion : glissez une tuile pour changer sa place ; ✎ modifie un thème (nom, dossier Nuage, image).') : null,
    tuiles(racines, null),
    nonClasses.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Non classés'), listeLivres(nonClasses)) : null);
  }
  function accueilPartages() {
    const autres = [...new Set([...T.values(), ...L.values()].filter((x) => !aMoi(x)).map((x) => x.proprietaire))];
    if (!autres.length) return h('p', { class: 'vide' }, 'Aucun ouvrage n’est encore partagé avec vous.');
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
          modif ? h('button', { class: 'btn petit', onclick: () => modifierTheme(t) }, '✎ Modifier le thème') : null,
          vue === 'mes' ? h('button', { class: 'btn petit' + (estPartage(t, 'theme_id') ? ' partage-actif' : ''), onclick: () => partagerUn('theme_id', t) }, estPartage(t, 'theme_id') ? '👥 Partagé' : '👥 Partager') : null,
          vue === 'partages' ? h('span', { class: 'info-partage' }, '👤 Partagé par ' + nomCollegue(t.proprietaire)) : null)),
      st.length || modif ? tuiles(st, t.id) : null,
      li.length ? h('section', {}, st.length ? h('h2', { class: 'titre-section' }, 'Ouvrages de ce thème') : null, listeLivres(li))
        : !st.length ? h('p', { class: 'vide' }, 'Aucun ouvrage dans ce thème.') : null);
  }

  // ------------------------------------------------------------------ ouvrages
  const couverture = (l, classe = 'couv-mini') => (l.vignette ? h('img', { class: classe, src: l.vignette, alt: '', loading: 'lazy' })
    : h('div', { class: 'tranche ' + classe, style: { '--couleur': couleurTranche(l.titre) } }, (l.titre || '?').charAt(0).toUpperCase()));
  const details = (l, sur = (x) => x) => [l.auteur, l.editeur, l.annee].filter(Boolean).map((x) => sur(x));
  const boutonOuvrir = (l, classe = 'btn petit principal') => { const u = urlLivre(l); return u ? h('a', { class: classe, href: u, target: '_blank', rel: 'noopener' }, 'Ouvrir') : h('span', { class: classe + ' desactive', title: 'Renseignez le lien de partage de la bibliothèque dans ⚙ Réglages Nuage' }, 'Ouvrir'); };
  function carteLivre(l, { lignes = null, termes = [] } = {}) {
    const sur = (x) => surligner(String(x), termes);
    const t = l.theme_id ? T.get(l.theme_id) : null;
    const meta = [];
    if (lignes || recherche) meta.push(t ? h('span', { class: 'chemin' }, chemin(t).flatMap((x, i) => [i ? ' › ' : '', h('a', { href: '#/biblio/t-' + x.id }, x.nom)])) : 'Non classé');
    if (l.pages) meta.push(pluriel(l.pages, 'page', 'pages'));
    if (l.sommaire?.length && !A_COMPLETER[l.source]) meta.push(pluriel(l.sommaire.length, 'entrée au sommaire', 'entrées au sommaire'));
    if (A_COMPLETER[l.source]) meta.push(h('span', { class: 'pastille-a-completer' }, A_COMPLETER[l.source] + (modif ? ' : à compléter' : '')));
    if (aMoi(l) && estPartage(l, 'livre_id')) meta.push('👥 partagé');
    if (!aMoi(l)) meta.push('👤 ' + nomCollegue(l.proprietaire));
    let corps = null;
    if (lignes?.length) {
      const visibles = lignes.slice(0, 15), reste = lignes.length - visibles.length;
      const ol = h('ol', { class: 'sommaire-biblio' }, visibles.map((e) => ligneSommaire(l, e, termes)));
      corps = h('div', { class: 'extraits-biblio' }, ol, reste > 0 ? h('button', { class: 'lien petit', type: 'button', onclick: (ev) => { vider(ol, lignes.map((e) => ligneSommaire(l, e, termes))); ev.target.remove(); } }, `Voir ${pluriel(reste, 'autre passage', 'autres passages')}`) : null);
    }
    return h('article', { class: 'livre-biblio' },
      h('div', { class: 'livre-tete' },
        h('a', { class: 'lien-couv', href: '#/biblio/l-' + l.id, tabindex: -1 }, couverture(l)),
        h('div', { class: 'livre-infos' },
          h('div', { class: 'livre-titre' }, h('a', { href: '#/biblio/l-' + l.id }, sur(l.titre || 'Sans titre'))),
          details(l).length ? h('div', { class: 'livre-details' }, details(l, sur).flatMap((x, i) => [i ? ' · ' : '', x])) : null,
          h('div', { class: 'livre-meta' }, meta.flatMap((x, i) => [i ? ' · ' : '', x]))),
        h('div', { class: 'actions-livre' },
          modif && aMoi(l) ? [h('button', { class: 'btn petit', onclick: () => modifierLivre(l) }, '✎ Modifier'), h('button', { class: 'btn petit danger', onclick: () => supprimerLivre(l) }, '✖')] : null,
          h('a', { class: 'btn petit', href: '#/biblio/l-' + l.id }, '☰ Sommaire'), boutonOuvrir(l))),
      corps);
  }
  const listeLivres = (liste, opts) => h('div', { class: 'livres-biblio' }, liste.map((l) => carteLivre(l, opts)));
  function ligneSommaire(l, e, termes = []) {
    const u = urlLivre(l, e.p);
    const corps = [h('span', {}, surligner(e.t, termes)), e.p ? h('span', { class: 'pg' }, 'p. ' + e.p) : null];
    return h('li', { class: 'niv-som' + (e.n || 0) }, u ? h('a', { href: u, target: '_blank', rel: 'noopener', title: e.p ? `Ouvrir le PDF à la page ${e.p}` : 'Ouvrir le PDF' }, corps) : h('span', { class: 'sans-lien' }, corps));
  }
  function ficheLivre(l) {
    const t = l.theme_id ? T.get(l.theme_id) : null;
    const infos = [['Auteur', l.auteur], ['Éditeur', l.editeur], ['Année', l.annee], ['ISBN', l.isbn], ['Pages', l.pages || ''],
      ['Thème', t ? chemin(t).map((x) => x.nom).join(' › ') : 'Non classé'], ['Fichier sur Nuage', l.chemin || (l.lien ? 'lien direct' : '—')]].filter(([, v]) => v !== '' && v != null);
    const sav = l.savoirs || [];
    return h('div', { class: 'fiche-livre' },
      ariane(t, true),
      h('div', { class: 'grille-fiche-livre' },
        h('div', { class: 'col-couv' }, couverture(l, 'couv-grande'),
          h('div', { class: 'boutons-fiche' }, boutonOuvrir(l, 'btn principal'),
            aMoi(l) ? h('button', { class: 'btn' + (estPartage(l, 'livre_id') ? ' partage-actif' : ''), onclick: () => partagerUn('livre_id', l) }, estPartage(l, 'livre_id') ? '👥 Partagé' : '👥 Partager') : null,
            aMoi(l) ? h('button', { class: 'btn', onclick: () => modifierLivre(l) }, '✎ Modifier') : null,
            aMoi(l) ? h('button', { class: 'btn danger', onclick: () => supprimerLivre(l) }, '✖ Supprimer la fiche') : null)),
        h('div', { class: 'col-infos' },
          h('h2', { class: 'titre-livre' }, l.titre || 'Sans titre'),
          !aMoi(l) ? h('p', { class: 'info-partage' }, `👤 Partagé par ${nomCollegue(l.proprietaire)} · consultation seule`) : null,
          h('dl', { class: 'infos-livre' }, infos.flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, String(b))])),
          sav.length || aMoi(l) ? h('div', { class: 'savoirs-cours' }, h('h3', {}, 'Savoirs associés'),
            sav.length ? sav.map((c) => h('div', { class: 'code' }, h('b', {}, c), h('span', {}, libSavoir(c)))) : h('p', { class: 'vide-sommaire' }, 'Aucun savoir associé.'),
            aMoi(l) ? h('button', { class: 'lien petit', type: 'button', onclick: () => choisirSavoirs(l) }, sav.length ? '✎ modifier' : '＋ choisir dans le référentiel') : null) : null,
          l.notes ? h('div', { class: 'notes-livre' }, h('h3', {}, 'Notes'), h('p', { class: 'pre' }, l.notes)) : null,
          h('h3', {}, 'Sommaire'),
          A_COMPLETER[l.source] && !l.sommaire?.length ? h('p', { class: 'note' }, `${A_COMPLETER[l.source]} : aucun sommaire pour l’instant.`, aMoi(l) ? [' ', h('button', { class: 'lien petit', type: 'button', onclick: () => modifierLivre(l, 'sommaire') }, 'Compléter le sommaire')] : null) : null,
          l.source === 'page' ? h('p', { class: 'note' }, 'Sommaire lu dans le texte du livre.') : null,
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
    const liste = (vue === 'mes' ? mesLivres : sesLivres);
    const trouves = [];
    for (const l of liste) {
      const tete = sansAccent([l.titre, l.auteur, l.editeur, l.isbn, l.notes, ...(l.savoirs || [])].join(' '));
      const lignes = (l.sommaire || []).filter((e) => { const s = sansAccent(e.t); return T2.every((m) => s.includes(m)); });
      const lignesUn = lignes.length ? lignes : (l.sommaire || []).filter((e) => { const s = sansAccent(e.t); return T2.some((m) => s.includes(m)); });
      const tout = sansAccent(tete + ' ' + (l.sommaire || []).map((e) => e.t).join(' '));
      if (!T2.every((m) => tout.includes(m))) continue;
      trouves.push({ l, lignes: lignesUn, score: (T2.every((m) => tete.includes(m)) ? 1000 : 0) + lignes.length * 10 + lignesUn.length });
    }
    trouves.sort((a, b) => b.score - a.score || compareTitres(a.l.titre, b.l.titre));
    const nl = trouves.reduce((s, x) => s + x.lignes.length, 0);
    return h('div', {}, h('p', { class: 'compte-recherche' }, trouves.length ? `${pluriel(trouves.length, 'ouvrage', 'ouvrages')} · ${pluriel(nl, 'passage', 'passages')} du sommaire` : 'Aucun résultat.'),
      h('div', { class: 'livres-biblio' }, trouves.map((x) => carteLivre(x.l, { lignes: x.lignes, termes: T2 }))));
  }

  // ------------------------------------------------------------------ gestion des thèmes
  function selectTheme(choisi, { racine = 'Non classé', exclure = null } = {}) {
    const interdits = exclure ? new Set([exclure, ...descendants(exclure).map((t) => t.id)]) : new Set();
    const opts = [h('option', { value: '' }, racine)];
    const parcourir = (id, niv) => sousThemes(id, moi).filter((t) => !interdits.has(t.id)).forEach((t) => { opts.push(h('option', { value: t.id, selected: t.id === choisi }, '   '.repeat(niv) + (niv ? '↳ ' : '') + t.nom)); parcourir(t.id, niv + 1); });
    parcourir(null, 0);
    return h('select', { class: 'champ' }, opts);
  }
  async function nouveauTheme(parent) {
    const nom = h('input', { class: 'champ', placeholder: 'Ex. : Escaliers' });
    const r = await fenetre(parent ? 'Nouveau sous-thème' : 'Nouveau thème', h('div', { class: 'formulaire' }, h('label', { class: 'large' }, 'Nom', nom),
      h('p', { class: 'aide' }, 'Créez aussi le dossier du même nom sur votre Nuage (le site retient ce chemin pour ouvrir le dossier et ranger les fichiers).')),
    [{ texte: 'Annuler', valeur: null }, { texte: 'Créer', classe: 'principal', action: () => { if (!nom.value.trim()) throw new Error('Donnez un nom.'); return nom.value.trim(); } }]);
    if (!r) return;
    const p = parent ? T.get(parent) : null;
    try {
      const t = await db.ajouter('biblio_themes', { parent_id: parent, nom: r, dossier: (p?.dossier ? p.dossier + '/' : '') + r, ordre: Math.max(0, ...sousThemes(parent, moi).map((x) => x.ordre)) + 1 });
      T.set(t.id, t); toast('Thème créé'); dessiner();
    } catch (e) { erreur(e); }
  }
  async function modifierTheme(t) {
    const nom = h('input', { class: 'champ', value: t.nom });
    const dossier = h('input', { class: 'champ', value: t.dossier, placeholder: 'ex. Livres/01 - Matériau bois' });
    const parent = selectTheme(t.parent_id, { racine: 'Accueil (thème principal)', exclure: t.id });
    let image = t.image;
    const apercu = h('div', { class: 'apercu-tuile', style: { backgroundImage: image ? `url("${image}")` : grainDeBois(t.nom) } });
    const fichier = h('input', { type: 'file', accept: 'image/*', onchange: async () => { try { image = await reduireImage(fichier.files[0], 520, 0.72); apercu.style.backgroundImage = `url("${image}")`; } catch (e) { erreur(e); } } });
    const ok = await fenetre('Modifier le thème', h('div', { class: 'formulaire' },
      h('label', {}, 'Nom de la tuile', nom), h('label', {}, 'Ranger dans', parent),
      h('label', { class: 'large' }, 'Dossier sur Nuage (depuis le dossier partagé)', dossier),
      h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Image de la tuile'), apercu, fichier,
        h('button', { class: 'lien petit', type: 'button', onclick: () => { image = ''; apercu.style.backgroundImage = grainDeBois(nom.value); } }, 'Revenir au veinage bois'))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', valeur: true }], { large: true });
    if (!ok) return;
    try {
      const v = { nom: nom.value.trim() || t.nom, dossier: dossier.value.trim(), image, parent_id: parent.value ? Number(parent.value) : null };
      await db.modifier('biblio_themes', t.id, v); Object.assign(t, v); toast('Thème enregistré'); dessiner();
    } catch (e) { erreur(e); }
  }
  async function supprimerTheme(t) {
    const d = descendants(t.id), n = total(t.id);
    if (!(await confirmer('Supprimer le thème', `Supprimer le thème « ${t.nom} »${d.length ? ` et ses ${d.length} sous-thème(s)` : ''} ? ${n ? `Ses ${n} ouvrage(s) ne sont pas supprimés : ils passent dans « Non classés». ` : ''}Les fichiers sur Nuage ne sont pas touchés.`, 'Supprimer'))) return;
    try { await db.supprimer('biblio_themes', t.id); [t, ...d].forEach((x) => T.delete(x.id)); [...L.values()].forEach((l) => { if (l.theme_id && !T.has(l.theme_id)) l.theme_id = null; }); toast('Thème supprimé'); if (themeCourant?.id === t.id) location.hash = '#/biblio'; else dessiner(); }
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

  // ------------------------------------------------------------------ gestion des ouvrages
  async function supprimerLivre(l) {
    if (!(await confirmer('Supprimer la fiche', `Supprimer la fiche de « ${l.titre} » ? Le fichier sur votre Nuage n’est pas touché.`, 'Supprimer'))) return;
    try { await db.supprimer('biblio_livres', l.id); L.delete(l.id); toast('Fiche supprimée'); if (livreCourant?.id === l.id) location.hash = l.theme_id ? '#/biblio/t-' + l.theme_id : '#/biblio'; else dessiner(); }
    catch (e) { erreur(e); }
  }
  const versTexte = (som) => (som || []).map((e) => '  '.repeat(e.n || 0) + e.t + (e.p ? ' … ' + e.p : '')).join('\n');
  async function modifierLivre(l, focus = '') {
    const ch = (v, ph = '') => h('input', { class: 'champ', value: v || '', placeholder: ph });
    const titre = ch(l.titre), auteur = ch(l.auteur), editeur = ch(l.editeur), annee = ch(l.annee), isbn = ch(l.isbn, '978…');
    const theme = selectTheme(l.theme_id), cheminF = ch(l.chemin, 'ex. Livres/01 - Matériau bois/Mon livre.pdf'), lien = ch(l.lien, 'https://… (facultatif : remplace le chemin)');
    const notes = h('textarea', { class: 'champ', rows: 2 }); notes.value = l.notes || '';
    const som = h('textarea', { class: 'champ saisie-sommaire', rows: 10, placeholder: 'Chapitre 1 - Les bases du trait … 12\n  1.1 Les épures … 14\nChapitre 2 - Les assemblages … 35' }); som.value = versTexte(l.sommaire);
    let vignette = l.vignette, source = l.source, pages = l.pages;
    const couv = h('div', { class: 'apercu-couv' }, couverture(l, 'couv-moyenne'));
    const majCouv = () => vider(couv, couverture({ ...l, vignette, titre: titre.value }, 'couv-moyenne'));
    const propositions = h('div', { class: 'propositions-isbn' });
    // fichier PDF choisi sur l'ordinateur (pour la couverture et le sommaire)
    let pdfLocal = null;
    const choixPdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', onchange: async () => { try { pdfLocal = await ouvrirPdf(choixPdf.files[0]); pages = pdfLocal.numPages; toast(`PDF lu : ${pdfLocal.numPages} pages`); } catch (e) { erreur(e); } } });
    const pageCouv = h('input', { class: 'champ court', type: 'number', min: 1, value: 1 });
    const debut = h('input', { class: 'champ court', type: 'number', min: 1, placeholder: 'de' }), fin = h('input', { class: 'champ court', type: 'number', min: 1, placeholder: 'à' });
    const decalage = h('input', { class: 'champ court', type: 'number', value: 0, title: 'Page du PDF − page imprimée (ex. 2 si la page imprimée 1 est la 3e page du PDF)' });
    const exigerPdf = () => { if (!pdfLocal) throw new Error('Choisissez d’abord le fichier PDF du livre (sur votre ordinateur).'); };
    const ok = await fenetre(`Modifier « ${l.titre || 'ouvrage'} »`, h('div', { class: 'modif-livre' },
      h('div', { class: 'formulaire' },
        h('label', { class: 'large' }, 'Titre', titre), h('label', {}, 'Auteur', auteur), h('label', {}, 'Éditeur', editeur), h('label', {}, 'Année', annee),
        h('label', {}, 'ISBN', h('span', { class: 'ligne-lien' }, isbn, h('button', { class: 'btn petit', type: 'button', onclick: () => chercherEnLigne() }, '🔎 Rechercher en ligne'))),
        h('div', { class: 'large' }, propositions),
        h('label', {}, 'Ranger dans', theme), h('label', {}, 'Fichier sur Nuage (chemin)', cheminF), h('label', { class: 'large' }, 'Lien direct', lien),
        h('label', { class: 'large' }, 'Notes', notes)),
      h('fieldset', { class: 'groupe-docs' }, h('legend', {}, 'Le fichier PDF sur cet ordinateur (couverture et sommaire)'),
        h('p', { class: 'aide' }, 'Facultatif : choisissez le PDF (par exemple dans votre dossier synchronisé avec Nuage) pour refaire la couverture ou lire le sommaire. Le fichier est lu ici, il n’est pas envoyé.'), choixPdf),
      h('div', { class: 'deux-colonnes-partage' },
        h('div', {}, h('p', { class: 'sous-titre-choix' }, 'Couverture'), couv,
          h('div', { class: 'boutons-detail' }, h('span', {}, 'Page du PDF'), pageCouv, h('button', { class: 'btn petit', type: 'button', onclick: async () => { try { exigerPdf(); vignette = await imagePage(pdfLocal, Number(pageCouv.value) || 1); majCouv(); } catch (e) { erreur(e); } } }, 'Utiliser cette page')),
          h('label', { class: 'lib-form' }, 'Ou une image (photo, scan) ', h('input', { type: 'file', accept: 'image/*', onchange: async (e) => { try { vignette = await reduireImage(e.target.files[0], 260, 0.75); majCouv(); } catch (x) { erreur(x); } } }))),
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
    if (!ok) { pdfLocal?.destroy?.(); return; }
    const sommaire = sommaireDepuisTexte(som.value.split('\n'));
    if (sommaire.length && A_COMPLETER[source]) source = 'saisi';
    const v = { titre: titre.value.trim() || l.titre, auteur: auteur.value.trim(), editeur: editeur.value.trim(), annee: annee.value.trim(), isbn: isbn.value.trim(),
      theme_id: theme.value ? Number(theme.value) : null, chemin: cheminF.value.trim(), lien: lien.value.trim(), notes: notes.value.trim(), vignette, sommaire, source, pages };
    try { await db.modifier('biblio_livres', l.id, v); Object.assign(l, v); toast('Fiche enregistrée'); dessiner(); } catch (e) { erreur(e); }
    pdfLocal?.destroy?.();
  }
  async function choisirSavoirs(l) {
    const choix = new Set(l.savoirs || []);
    const corps = h('div', { class: 'liste-choix' }, ref.savoirs.map((s) => h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: choix.has(s.code), onchange: (e) => (e.target.checked ? choix.add(s.code) : choix.delete(s.code)) }), h('b', {}, s.code), ' ', s.libelle)));
    if (!(await fenetre('Savoirs associés', corps, [{ texte: 'Annuler', valeur: false }, { texte: 'Valider', classe: 'principal', valeur: true }], { large: true }))) return;
    const ordre = ref.savoirs.map((s) => s.code), v = [...choix].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
    try { await db.modifier('biblio_livres', l.id, { savoirs: v }); l.savoirs = v; dessiner(); } catch (e) { erreur(e); }
  }
  // ajouter des livres : PDF choisis sur l'ordinateur → fiches (pages, signets, couverture) ; chemin = dossier du thème + nom du fichier
  async function ajouterLivres(themeId) {
    const fichiers = h('input', { type: 'file', multiple: true });
    const theme = selectTheme(themeId);
    const lire = h('input', { type: 'checkbox', checked: true });
    const ok = await fenetre('Ajouter des livres', h('div', { class: 'formulaire' },
      h('p', { class: 'aide' }, '1. Déposez les fichiers dans le dossier du thème sur votre Nuage (ou dans votre dossier synchronisé). 2. Choisissez-les ici : le site crée une fiche par fichier, lit les PDF (nombre de pages, sommaire, couverture) sur votre ordinateur, sans rien envoyer.'),
      h('label', { class: 'large' }, 'Fichiers (tous types)', fichiers), h('label', {}, 'Ranger dans le thème', theme),
      h('label', { class: 'case' }, lire, ' Lire les PDF (sommaire et couverture)'),
      h('p', { class: 'aide' }, h('a', { href: accueilNuage(reglage.lien_bibliotheque), target: '_blank', rel: 'noopener' }, '📂 Ouvrir mon Nuage'), ' pour y déposer les fichiers.')),
    [{ texte: 'Annuler', valeur: false }, { texte: '＋ Créer les fiches', classe: 'principal', action: () => { if (!fichiers.files.length) throw new Error('Choisissez au moins un fichier.'); return true; } }]);
    if (!ok) return;
    const t = theme.value ? T.get(Number(theme.value)) : null;
    await creerFiches([...fichiers.files].map((f) => ({ f, chemin: ((t?.dossier ? t.dossier + '/' : '') + f.name).normalize('NFC'), themeId: t?.id ?? null })), lire.checked);
  }
  async function creerFiches(liste, lirePdfs) {
    const pr = progression('Création des fiches'); let n = 0;
    try {
      for (const [i, x] of liste.entries()) {
        pr.maj(i, liste.length, x.f ? x.f.name : x.chemin);
        const nom = x.chemin.split('/').pop(), titre = nom.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
        let info = { pages: null, sommaire: [], source: '', vignette: '' };
        if (lirePdfs && x.f && /\.pdf$/i.test(nom)) { try { info = await lirePdf(x.f); } catch { info = { ...info, source: 'erreur' }; } }
        const l = await db.ajouter('biblio_livres', { theme_id: x.themeId, titre: info.titreMeta && info.titreMeta.length > 3 && !/^microsoft|untitled|sans titre/i.test(info.titreMeta) ? info.titreMeta : titre,
          chemin: x.chemin, pages: info.pages, sommaire: info.sommaire, source: info.source, vignette: info.vignette, ordre: 1000 + i });
        L.set(l.id, l); n++;
      }
    } catch (e) { erreur(e); }
    pr.fin(); toast(`${n} fiche(s) créée(s)`); dessiner();
  }

  // ------------------------------------------------------------------ mise à jour depuis le dossier synchronisé
  async function mettreAJour() {
    toast('Choisissez le dossier de votre bibliothèque (synchronisé avec Nuage)');
    const tous = await choisirDossier();
    if (!tous.length) return;
    // dossier « Livres » choisi directement : les chemins enregistrés commencent par « Livres/ »
    const racineChoisie = String(tous[0].webkitRelativePath || '').split('/')[0];
    const prefixe = racineChoisie === 'Livres' && mesLivres.some((l) => l.chemin.startsWith('Livres/')) ? 'Livres/' : '';
    let fichiers = tous.map((f) => ({ f, c: prefixe + cheminRelatif(f) })).filter((x) => x.c && !ignore(x.c));
    // les images de tuiles « illustration.* » ne sont pas des livres
    const images = new Map(fichiers.filter((x) => /(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c)).map((x) => [x.c.split('/').slice(0, -1).join('/'), x.f]));
    fichiers = fichiers.filter((x) => !/(^|\/)illustration\.(jpe?g|png|webp)$/i.test(x.c) && !/\.(html?|js|py|bat|command|sh|ini)$/i.test(x.c));
    const mesT = [...T.values()].filter(aMoi), parDossier = new Map(mesT.map((t) => [t.dossier.normalize('NFC'), t]));
    const connus = new Set(mesLivres.map((l) => l.chemin.normalize('NFC')));
    const nouveaux = fichiers.filter((x) => !connus.has(x.c));
    const presents = new Set(fichiers.map((x) => x.c));
    const disparus = mesLivres.filter((l) => l.chemin && !presents.has(l.chemin.normalize('NFC')));
    const dossiers = [...new Set(nouveaux.map((x) => x.c.split('/').slice(0, -1).join('/')).filter(Boolean))];
    const aCreer = [...new Set(dossiers.flatMap((d) => d.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))))].filter((d) => d !== 'Livres' && !parDossier.has(d)).sort();
    const lire = h('input', { type: 'checkbox', checked: true }), retirer = h('input', { type: 'checkbox' });
    const ok = await fenetre('Mettre à jour depuis mon dossier', h('div', {},
      h('p', {}, `Dossier lu : ${pluriel(fichiers.length, 'fichier', 'fichiers')}.`),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, h('b', {}, pluriel(nouveaux.length, 'nouveau fichier', 'nouveaux fichiers')), nouveaux.length ? ' : ' + nouveaux.slice(0, 8).map((x) => x.c.split('/').pop()).join(', ') + (nouveaux.length > 8 ? '…' : '') : ''),
        h('li', {}, h('b', {}, pluriel(aCreer.length, 'nouveau thème', 'nouveaux thèmes')), aCreer.length ? ' : ' + aCreer.slice(0, 8).map((d) => d.split('/').pop()).join(', ') : ''),
        h('li', {}, h('b', {}, pluriel(disparus.length, 'fiche dont le fichier est introuvable', 'fiches dont le fichier est introuvable')), disparus.length ? ' : ' + disparus.slice(0, 6).map((l) => l.titre).join(', ') : '')),
      nouveaux.length ? h('label', { class: 'case' }, lire, ' Lire les nouveaux PDF (sommaire, couverture) — plus long') : null,
      disparus.length ? h('label', { class: 'case' }, retirer, ' Supprimer les fiches dont le fichier est introuvable') : null,
      h('p', { class: 'aide' }, 'Seuls les noms des fichiers et dossiers sont lus (et les PDF nouveaux, si coché) : rien n’est envoyé.')),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Mettre à jour', classe: 'principal', valeur: true }]);
    if (!ok) return;
    try {
      for (const d of aCreer) {
        const parts = d.split('/'), nom = parts.pop().replace(/^\d+\s*-\s*/, ''), parentD = parts.join('/');
        const parent = parDossier.get(parentD) || null;
        const ordre = Math.max(0, ...sousThemes(parent?.id ?? null, moi).map((x) => x.ordre)) + 1;
        let image = '';
        if (images.has(d)) { try { image = await reduireImage(images.get(d), 520, 0.72); } catch { /* image illisible */ } }
        const t = await db.ajouter('biblio_themes', { parent_id: parent?.id ?? null, nom, dossier: d, ordre, image });
        T.set(t.id, t); parDossier.set(d, t);
      }
      if (retirer.checked) for (const l of disparus) { await db.supprimer('biblio_livres', l.id); L.delete(l.id); }
    } catch (e) { erreur(e); }
    await creerFiches(nouveaux.map((x) => ({ f: x.f, chemin: x.c, themeId: parDossier.get(x.c.split('/').slice(0, -1).join('/'))?.id ?? null })), lire.checked);
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
    const nom = cle === 'theme_id' ? `le thème « ${x.nom} »` : `« ${x.titre} »`;
    const r = await dialoguePartage(`Partager ${nom}`, cle === 'theme_id'
      ? 'Les collègues choisis verront ce thème, ses sous-thèmes et tous leurs ouvrages (y compris ceux ajoutés plus tard), en consultation. Pour ouvrir les fichiers, ils utilisent le lien de partage de votre bibliothèque sur Nuage.'
      : 'Les collègues choisis verront cette fiche (sommaire, couverture) en consultation. Pour ouvrir le fichier, ils utilisent le lien de partage de votre bibliothèque sur Nuage.',
    { tous: x.partage_tous, qui: partagesDe(cle, x.id).map((p) => p.destinataire), moi });
    if (!r) return;
    try { await enregistrerPartage(cle, x, r); toast(r.tous || r.qui.length ? 'Partage enregistré' : 'De nouveau privé'); dessiner(); } catch (e) { erreur(e); }
  }
  async function partagerLot() {
    const coches = new Set();
    const boite = h('div', { class: 'choix-dossier arbre-pdf' });
    const dessinerArbre = () => {
      const ligneL = (l, prof) => h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: coches.has('l' + l.id), onchange: (e) => { e.target.checked ? coches.add('l' + l.id) : coches.delete('l' + l.id); } }), '📕 ', l.titre,
        estPartage(l, 'livre_id') ? h('small', { class: 'deja-partage' }, ' 👥') : null);
      const ligneT = (t, prof) => [h('label', { class: 'option', style: { paddingLeft: 8 + prof * 18 + 'px' } }, h('input', { type: 'checkbox', checked: coches.has('t' + t.id), onchange: (e) => { e.target.checked ? coches.add('t' + t.id) : coches.delete('t' + t.id); } }), '📁 ', h('b', {}, t.nom), h('small', { class: 'gris' }, ` (thème entier, ${total(t.id)} ouvrage(s))`),
        estPartage(t, 'theme_id') ? h('small', { class: 'deja-partage' }, ' 👥') : null),
      ...sousThemes(t.id, moi).flatMap((s) => ligneT(s, prof + 1)), ...livresDe(t.id).map((l) => ligneL(l, prof + 1))];
      vider(boite, sousThemes(null, moi).flatMap((t) => ligneT(t, 0)), livresDe(null, moi).map((l) => ligneL(l, 0)));
    };
    dessinerArbre();
    const qui = new Set(), tous = h('input', { type: 'checkbox' });
    const autres = (await chargerCollegues()).filter((c) => c.id !== moi);
    const mode = h('select', { class: 'champ' }, h('option', { value: 'ajouter' }, 'Ajouter ces collègues (garder les partages existants)'), h('option', { value: 'retirer' }, 'Retirer ces collègues'),
      h('option', { value: 'remplacer' }, 'Partager uniquement avec eux (remplacer)'), h('option', { value: 'prive' }, 'Rendre privé (retirer tous les partages)'));
    const ok = await fenetre('Partager des ouvrages', h('div', { class: 'partage-lot' },
      h('p', { class: 'aide' }, 'Cochez un ou plusieurs ouvrages, ou des thèmes entiers, puis les collègues. Ils consultent les fiches et ouvrent les fichiers par le lien de partage de votre bibliothèque ; ils ne modifient rien.'),
      h('div', { class: 'deux-colonnes-partage' },
        h('div', {}, h('p', { class: 'sous-titre-choix' }, '1. Les ouvrages'), boite),
        h('div', {}, h('p', { class: 'sous-titre-choix' }, '2. Les collègues'),
          h('label', { class: 'option tous' }, tous, h('b', {}, 'Toute l’équipe')),
          h('div', { class: 'liste-choix' }, autres.map((c) => h('label', { class: 'option' }, h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? qui.add(c.id) : qui.delete(c.id)) }), c.nom))),
          h('p', { class: 'sous-titre-choix' }, '3. Action'), mode))),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Appliquer', classe: 'principal', action: () => {
      if (!coches.size) throw new Error('Cochez au moins un ouvrage ou un thème.');
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

  dessiner();
  if (recherche) { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); }
}
