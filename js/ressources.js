// Mes ressources : outils communs à « Ma bibliothèque » et « Mes cours ».
// Les fichiers restent sur le Nuage de chaque enseignant ; le site garde les fiches et le chemin de chaque fichier.
// Adresse d'un fichier = lien de partage du dossier (réglages Nuage) + chemin du fichier dans ce dossier.
// Les PDF et les dossiers choisis sur l'ordinateur sont lus dans le navigateur : rien n'est envoyé.
import { db } from './api.js';
import { h, vider, toast, erreur, fenetre } from './ui.js';

export const sansAccent = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const compareTitres = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
export const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// ------------------------------------------------------------------------------------------- réglages Nuage
let reglages = null;          // Map(propriétaire → réglages)
export async function chargerReglages(force = false) {
  if (reglages && !force) return reglages;
  const l = await db.lire('ressources_reglages').catch(() => []);
  reglages = new Map(l.map((r) => [r.proprietaire, r]));
  return reglages;
}
export const reglagesDe = (uid) => reglages?.get(uid) || { lien_bibliotheque: '', lien_cours: '', format_liens: 'dav' };

// lien de partage Nuage (Nextcloud) : https://serveur/index.php/s/JETON → { origine, jeton }
export function analyserLien(lien) {
  const m = String(lien || '').trim().match(/^(https?:\/\/[^/]+)(?:\/index\.php)?\/s\/([A-Za-z0-9]+)/);
  return m ? { origine: m[1], jeton: m[2] } : null;
}
const coder = (chemin) => String(chemin || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
// adresse d'un fichier du dossier partagé ; format « dav » (ouverture directe) ou « telechargement »
export function adresseFichier(lienPartage, chemin, format = 'dav') {
  const p = analyserLien(lienPartage); if (!p || !chemin) return '';
  if (format === 'telechargement') {
    const parts = String(chemin).split('/').filter(Boolean), nom = parts.pop();
    return `${p.origine}/index.php/s/${p.jeton}/download?path=${encodeURIComponent('/' + parts.join('/'))}&files=${encodeURIComponent(nom)}`;
  }
  return `${p.origine}/public.php/dav/files/${p.jeton}/${coder(chemin)}`;
}
// adresse d'un dossier du partage, ouvert dans Nuage
export function adresseDossier(lienPartage, chemin) {
  const p = analyserLien(lienPartage); if (!p) return '';
  return `${p.origine}/index.php/s/${p.jeton}` + (chemin ? `?path=${encodeURIComponent('/' + String(chemin).split('/').filter(Boolean).join('/'))}` : '');
}
export const lienOk = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());
export const accueilNuage = (lien) => { const p = analyserLien(lien); return p ? p.origine + '/' : 'https://nuage.apps.education.fr/'; };

// fenêtre des réglages Nuage de l'utilisateur connecté
export async function dialogueReglages(ctx, apres) {
  await chargerReglages();
  const r = { ...reglagesDe(ctx.profil.id) };
  const lb = h('input', { class: 'champ', type: 'url', value: r.lien_bibliotheque, placeholder: 'https://…/index.php/s/…' });
  const lc = h('input', { class: 'champ', type: 'url', value: r.lien_cours, placeholder: 'https://…/index.php/s/…' });
  const fmt = h('select', { class: 'champ' }, h('option', { value: 'dav', selected: r.format_liens !== 'telechargement' }, 'Ouverture directe dans le navigateur (recommandé)'),
    h('option', { value: 'telechargement', selected: r.format_liens === 'telechargement' }, 'Téléchargement du fichier'));
  const etat = (inp) => { const z = h('small', { class: 'etat-lien' }); const maj = () => { const v = inp.value.trim(); z.textContent = !v ? '' : analyserLien(v) ? '✔ lien de partage reconnu' : '✖ ce n’est pas un lien de partage Nuage (…/s/…)'; z.className = 'etat-lien ' + (!v ? '' : analyserLien(v) ? 'ok' : 'ko'); }; inp.addEventListener('input', maj); maj(); return z; };
  const ok = await fenetre('⚙  Mes réglages Nuage', h('div', { class: 'reglages-nuage' },
    h('p', { class: 'aide' }, 'Vos fichiers restent sur votre Nuage. Dans Nuage, créez UN lien de partage (lecture seule) sur le dossier de votre bibliothèque, et un autre sur votre dossier « Mes cours », puis collez-les ici : le site fabrique ensuite l’adresse de chaque fichier à partir de son chemin.'),
    h('label', {}, h('b', {}, '📖 Lien de partage de ma bibliothèque'), lb, etat(lb),
      h('small', { class: 'gris' }, 'Le dossier qui contient « Livres » et « _systeme » pour La bibliothèque du bois, ou directement vos dossiers de thèmes.')),
    h('label', {}, h('b', {}, '🎓 Lien de partage de « Mes cours »'), lc, etat(lc)),
    h('label', {}, h('b', {}, 'Ouverture des fichiers'), fmt,
      h('small', { class: 'gris' }, 'Si un fichier ne s’ouvre pas, essayez l’autre réglage (bouton « Tester » dans la bibliothèque).')),
    h('p', { class: 'aide' }, '🔒 Partage en lecture seule. Vos collègues ne verront que les documents que vous partagez avec eux dans le site ; pour ouvrir les fichiers, ils utilisent ces liens (donnez-leur le mot de passe si vous en avez mis un).')),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: () => {
    for (const i of [lb, lc]) if (i.value.trim() && !analyserLien(i.value)) throw new Error('Lien non reconnu : copiez le lien de partage de Nuage (il contient « /s/ »).');
    return true;
  } }]);
  if (!ok) return;
  try {
    const v = { proprietaire: ctx.profil.id, lien_bibliotheque: lb.value.trim(), lien_cours: lc.value.trim(), format_liens: fmt.value };
    await db.enregistrer('ressources_reglages', [v], 'proprietaire');
    reglages.set(ctx.profil.id, v);
    toast('Réglages Nuage enregistrés');
    apres?.();
  } catch (e) { erreur(e); }
}

// ------------------------------------------------------------------------------------------- collègues
let collegues = null;
export async function chargerCollegues() { if (!collegues) collegues = await db.rpc('collegues').catch(() => []); return collegues; }
export const nomCollegue = (uid) => (collegues || []).find((c) => c.id === uid)?.nom || 'Un collègue';

// ------------------------------------------------------------------------------------------- PDF (pdf.js, dans le navigateur)
let pdfjs = null;
export async function chargerPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('./lib/pdfjs/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdfjs/pdf.worker.min.js', import.meta.url).href;
  }
  return pdfjs;
}
export async function ouvrirPdf(fichier) {
  const P = await chargerPdfjs();
  return P.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), isEvalSupported: false }).promise;
}
// signets du PDF → sommaire [{ t, p, n }]
export async function signetsPdf(pdf) {
  const out = [];
  const parcourir = async (items, n) => {
    for (const it of items || []) {
      let p = null;
      try {
        const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
        if (dest && dest[0]) p = (await pdf.getPageIndex(dest[0])) + 1;
      } catch { /* destination illisible */ }
      if (it.title?.trim()) out.push({ t: it.title.trim(), p, n: Math.min(n, 4) });
      if (out.length < 3000) await parcourir(it.items, n + 1);
    }
  };
  await parcourir(await pdf.getOutline(), 0);
  return out;
}
// texte de pages du PDF, ligne par ligne
export async function textePages(pdf, debut, fin) {
  const lignes = [];
  for (let i = Math.max(1, debut); i <= Math.min(pdf.numPages, fin); i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    let y = null, l = '';
    for (const it of c.items) {
      const yy = Math.round(it.transform?.[5] ?? 0);
      if (y !== null && Math.abs(yy - y) > 3) { if (l.trim()) lignes.push(l.trim()); l = ''; }
      l += (l && !l.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str; y = yy;
    }
    if (l.trim()) lignes.push(l.trim());
  }
  return lignes;
}
// lignes « Titre ……… 12 » → sommaire (le numéro final est la page imprimée ; décalage = page du PDF − page imprimée)
export function sommaireDepuisTexte(lignes, decalage = 0) {
  const out = [];
  for (const brute of lignes) {
    const l = brute.replace(/\s+/g, ' ').trim(); if (!l) continue;
    const m = l.match(/^(.*?)[\s.…·_-]*(\d{1,4})$/);
    const n = (brute.match(/^\s*/)[0].replace(/\t/g, '  ').length / 2) | 0;
    if (m && m[1].trim().length > 1) out.push({ t: m[1].replace(/[\s.…·_-]+$/, '').trim(), p: Number(m[2]) + decalage, n: Math.min(n, 4) });
    else if (l.length > 1) out.push({ t: l, p: null, n: Math.min(n, 4) });
  }
  return out;
}
// image d'une page (couverture) → JPEG réduit
export async function imagePage(pdf, num = 1, largeur = 260) {
  const page = await pdf.getPage(Math.min(Math.max(1, num), pdf.numPages));
  const v1 = page.getViewport({ scale: 1 }), echelle = largeur / v1.width, v = page.getViewport({ scale: echelle });
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: v, canvas: c }).promise;
  return c.toDataURL('image/jpeg', 0.72);
}
// fiche d'un PDF choisi sur l'ordinateur : titre, nombre de pages, sommaire (signets), couverture
export async function lirePdf(fichier, { couverture = true } = {}) {
  const pdf = await ouvrirPdf(fichier);
  let titre = '';
  try { titre = (await pdf.getMetadata())?.info?.Title || ''; } catch { /* pas de métadonnées */ }
  const sommaire = await signetsPdf(pdf).catch(() => []);
  const vignette = couverture ? await imagePage(pdf, 1).catch(() => '') : '';
  const r = { pages: pdf.numPages, sommaire, source: sommaire.length ? 'signets' : 'aucun', vignette, titreMeta: titre.trim() };
  pdf.destroy?.();
  return r;
}

// ------------------------------------------------------------------------------------------- images
// image (fichier ou adresse) → JPEG réduit (couverture, tuile de thème)
export function reduireImage(source, largeur = 320, qualite = 0.75) {
  return new Promise((ok, ko) => {
    const img = new Image();
    const url = source instanceof Blob ? URL.createObjectURL(source) : source;
    img.onload = () => {
      const e = Math.min(1, largeur / img.width), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * e)); c.height = Math.max(1, Math.round(img.height * e));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      if (source instanceof Blob) URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', qualite));
    };
    img.onerror = () => ko(new Error('Image illisible.'));
    img.src = url;
  });
}

// ------------------------------------------------------------------------------------------- dossier de l'ordinateur
// choisir un dossier (synchronisé avec Nuage) : liste de ses fichiers avec leur chemin (rien n'est envoyé)
export function choisirDossier() {
  return new Promise((ok) => {
    const inp = h('input', { type: 'file', webkitdirectory: true, directory: true, multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', () => { const l = [...inp.files]; inp.remove(); ok(l); });
    document.body.append(inp); inp.click();
  });
}
// chemin relatif au dossier choisi (sans le nom du dossier choisi lui-même)
// (forme Unicode unique : certains systèmes écrivent « é » en deux caractères)
export const cheminRelatif = (f) => String(f.webkitRelativePath || f.name).normalize('NFC').split('/').slice(1).join('/');
export const ignore = (chemin) => chemin.split('/').some((p) => p.startsWith('.') || p.startsWith('_') || p.startsWith('~$') || /^(desktop\.ini|thumbs\.db)$/i.test(p));

// ------------------------------------------------------------------------------------------- veinage bois (tuiles)
function hachage(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
const ESSENCES = [['#c9965f', '#a8723f'], ['#d9a86c', '#b98446'], ['#b5703f', '#8f5129'], ['#7a4d31', '#5c3620'],
  ['#e2c18f', '#c7a06a'], ['#a86a45', '#834c2c'], ['#cfae7e', '#ad8a58'], ['#94603a', '#724424']];
export function grainDeBois(cle) {
  let g = hachage(String(cle)); const ess = ESSENCES[g % ESSENCES.length];
  const r = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
  const w = 400; let lignes = ''; const decal = r() * 60;
  for (let i = 0; i < 26; i++) {
    const y = i * 12 + decal - 30, amp = 4 + r() * 10; let d = 'M -10 ' + y.toFixed(1);
    for (let x = 0; x <= w + 20; x += 50) d += ` Q ${x + 25} ${(y + (r() - 0.5) * amp * 2).toFixed(1)} ${x + 50} ${(y + (r() - 0.5) * amp).toFixed(1)}`;
    lignes += `<path d="${d}" fill="none" stroke="${ess[1]}" stroke-opacity="${(0.25 + r() * 0.45).toFixed(2)}" stroke-width="${(0.6 + r() * 2.2).toFixed(1)}"/>`;
  }
  const nx = (60 + r() * 280).toFixed(0), ny = (60 + r() * 180).toFixed(0);
  const noeud = `<ellipse cx="${nx}" cy="${ny}" rx="${(10 + r() * 10).toFixed(0)}" ry="${(5 + r() * 4).toFixed(0)}" fill="${ess[1]}" fill-opacity=".55"/>`
    + `<ellipse cx="${nx}" cy="${ny}" rx="${(22 + r() * 10).toFixed(0)}" ry="${(11 + r() * 5).toFixed(0)}" fill="none" stroke="${ess[1]}" stroke-opacity=".5" stroke-width="1.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="100%" height="100%" fill="${ess[0]}"/>${lignes}${noeud}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export const couleurTranche = (t) => ESSENCES[hachage(String(t)) % ESSENCES.length][1];

// ------------------------------------------------------------------------------------------- partage (fenêtre commune)
// tous : partagé avec toute l'équipe ; qui : collègues déjà cochés ; renvoie { tous, qui } ou null
export async function dialoguePartage(titre, texteAide, { tous = false, qui = [], herite = '', moi = '' } = {}) {
  const autres = (await chargerCollegues()).filter((c) => c.id !== moi);
  const coches = new Set(qui);
  const cbTous = h('input', { type: 'checkbox', checked: tous });
  const ok = await fenetre(titre, h('div', { class: 'partage-cours' },
    h('p', { class: 'aide' }, texteAide),
    herite ? h('p', { class: 'info-herite' }, 'ℹ ' + herite) : null,
    h('label', { class: 'option tous' }, cbTous, h('b', {}, 'Toute l’équipe'), h('small', {}, ' (y compris les collègues qui arriveront plus tard)')),
    h('p', { class: 'sous-titre-choix' }, 'Ou seulement certains collègues :'),
    h('div', { class: 'liste-choix colonnes' }, autres.length ? autres.map((c) => h('label', { class: 'option' },
      h('input', { type: 'checkbox', checked: coches.has(c.id), onchange: (e) => (e.target.checked ? coches.add(c.id) : coches.delete(c.id)) }), c.nom))
      : h('p', { class: 'vide' }, 'Aucun autre enseignant n’a encore de compte.'))),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer le partage', classe: 'principal', valeur: true }]);
  return ok ? { tous: cbTous.checked, qui: [...coches] } : null;
}

// petit indicateur d'avancement dans une fenêtre
export function progression(titre) {
  const barre = h('div', { class: 'barre-progres' }, h('span', {}));
  const txt = h('p', { class: 'aide' }, '…');
  const fond = h('div', { class: 'fond-fenetre' }, h('div', { class: 'fenetre' }, h('div', { class: 'tete-fenetre' }, h('h2', {}, titre)), h('div', { class: 'corps-fenetre' }, txt, barre)));
  document.body.append(fond);
  return { maj: (n, total, t) => { barre.firstChild.style.width = Math.round((n / Math.max(1, total)) * 100) + '%'; if (t) txt.textContent = t; }, fin: () => fond.remove() };
}
export { vider };
