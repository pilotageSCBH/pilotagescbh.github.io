// « Classeur » PDF d'une matière (A4 portrait, un seul fichier) : page de garde, sommaire, séquençage, puis pour chaque
// séquence sa fiche de préparation, son contrat sommatif, et pour chaque séance sa fiche de déroulement et son contrat formatif.
import { db } from './api.js';
import { h, toast, erreur, fenetre, heures } from './ui.js';
import { chargerOutils, creerPDF, nettoyer } from './pdf.js';
import { contexteSequence, modelesSequence } from './pages/fiches.js';
import { telecharger, nomFichier } from './echange.js';

const PARTIES = [['sequencage', 'Séquençage de la matière (toutes les séquences et séances)'], ['preparation', 'Fiches de préparation de séquence'],
  ['sommatif', 'Contrats d’évaluation sommative'], ['seance', 'Fiches de déroulement de séance (avec le travail à la maison)'], ['formatif', 'Contrats d’évaluation formative']];

// fenêtre de choix puis fabrication du classeur
export async function telechargerClasseur(m, ctx) {
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&matiere_id=eq.${m.id}&order=numero`);
  if (!sequences.length) return erreur(new Error(`Aucune séquence en ${m.nom} pour cette promotion.`));
  const cp = new Map(PARTIES.map(([k]) => [k, h('input', { type: 'checkbox', checked: true })]));
  const cs = new Map(sequences.map((s) => [s.id, h('input', { type: 'checkbox', checked: true })]));
  const ok = await fenetre(`Classeur PDF · ${m.nom}`, h('div', { class: 'choix-telecharger' },
    h('p', { class: 'aide' }, `Un seul PDF (A4 portrait) avec page de garde et sommaire, pour la promotion ${ctx.promo.libelle}. Les contrats contiennent la grille des élèves avec les notes déjà saisies.`),
    h('fieldset', { class: 'groupe-docs' }, h('legend', {}, 'Contenu'), PARTIES.map(([k, t]) => h('label', { class: 'choix-doc' }, cp.get(k), t))),
    h('fieldset', { class: 'groupe-docs' }, h('legend', {}, 'Séquences'), sequences.map((s) => h('label', { class: 'choix-doc' }, cs.get(s.id), `Séquence ${s.numero} · ${s.intitule || 'sans intitulé'}`)))),
  [{ texte: 'Annuler', valeur: false }, { texte: '⬇  Télécharger le classeur', classe: 'principal', action: () => {
    if (![...cp.values()].some((c) => c.checked)) throw new Error('Cochez au moins une partie.');
    if (![...cs.values()].some((c) => c.checked)) throw new Error('Cochez au moins une séquence.');
    return true;
  } }], { large: true });
  if (!ok) return;
  const parties = new Set(PARTIES.map(([k]) => k).filter((k) => cp.get(k).checked));
  const choisies = sequences.filter((s) => cs.get(s.id).checked);
  try {
    toast('Préparation du classeur… (quelques secondes)');
    await chargerOutils();
    const logo = await fetch('img/logo.jpg').then((r) => r.arrayBuffer()).catch(() => null);
    const octets = await fabriquer(m, ctx, choisies, parties, logo);
    telecharger(nomFichier(`Classeur_${ctx.codeMat(m)}_${m.nom}_${ctx.promo.libelle}.pdf`), new Blob([octets], { type: 'application/pdf' }));
    toast('Classeur téléchargé');
  } catch (x) { erreur(x); }
}

async function fabriquer(m, ctx, sequences, parties, logo) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const ref = await ctx.referentiel();
  const ctxs = await Promise.all(sequences.map((s) => contexteSequence(s, ctx)));
  const promo = ctx.promo.libelle, profs = ctx.enseignantsDe(m.id).join(', ') || '—';
  const pied = `Classeur · ${m.nom} · Promotion ${promo}`;
  // ---------------------------------------------------------------- documents de contenu
  const docs = [];                                  // { titre, groupe, doc }
  if (parties.has('sequencage')) {
    const blocs = [{ t: 'titre', texte: 'SÉQUENÇAGE DE LA MATIÈRE', sous: `${m.nom} · Promotion ${promo}`, couleur: m.couleur },
      { t: 'infos', paires: [['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Volume', volumeTotal(ctxs)]] }];
    for (const S of ctxs) {
      blocs.push({ t: 'rubrique', titre: `Séquence ${S.sq.numero} · ${S.sq.intitule || 'sans intitulé'}`, texte: S.sq.objectif ? 'Objectif principal : ' + S.sq.objectif : '—', gras: true });
      blocs.push({ t: 'table', colonnes: [{ titre: 'N°', part: 6, gras: true }, { titre: 'Séance', part: 22, gras: true }, { titre: 'Durée', part: 7 },
        { titre: 'Objectif intermédiaire', part: 33 }, { titre: 'Compétences', part: 15 }, { titre: 'Savoirs', part: 17 }],
      lignes: S.seances.map((y) => [`${S.sq.numero}.${y.numero}`, y.titre, heures(y.duree == null ? null : Number(y.duree)), y.objectif_inter, (y.competences || []).join(' '), (y.savoirs || []).join(' ')]) });
    }
    docs.push({ titre: 'Séquençage de la matière', groupe: null, doc: { titre: 'Séquençage', pied, blocs } });
  }
  for (const S of ctxs) {
    const choix = [];
    if (parties.has('preparation')) choix.push(['preparation', '', null]);
    if (parties.has('sommatif')) choix.push(['sommatif', '', null]);
    for (const x of S.seances) {
      if (parties.has('seance')) choix.push([`seance-${x.id}`, '', x]);
      if (parties.has('formatif')) choix.push([`formatif-${x.id}`, '', x]);
    }
    if (!choix.length) continue;
    const modeles = await modelesSequence(S, ctx, choix);
    const groupe = `Séquence ${S.sq.numero} · ${S.sq.intitule || 'sans intitulé'}`;
    const nom = ([k, , x]) => (k === 'preparation' ? 'Fiche de préparation de séquence' : k === 'sommatif' ? 'Contrat d’évaluation sommative'
      : `Séance ${S.sq.numero}.${x.numero}${x.titre ? ' · ' + x.titre : ''} : ${k.startsWith('seance-') ? 'fiche de déroulement' : 'contrat formatif'}`);
    modeles.forEach((d, i) => docs.push({ titre: nom(choix[i]), groupe, doc: { ...d, pied } }));
  }
  const contenus = [];
  for (const d of docs) contenus.push(await PDFDocument.load(await creerPDF(d.doc, logo, { pied: false })));
  // ---------------------------------------------------------------- sommaire (2 passes : nombre de pages connu ensuite)
  const sommaire = (debut) => {
    let p = debut;
    const lignes = []; let g = undefined;
    docs.forEach((d, i) => {
      if (d.groupe !== g) { g = d.groupe; if (g) lignes.push({ groupe: g }); }
      lignes.push([d.groupe ? '      ' + d.titre : d.titre, String(p)]);
      p += contenus[i].getPageCount();
    });
    return { titre: 'Sommaire', pied, blocs: [{ t: 'titre', texte: 'SOMMAIRE', sous: `${m.nom} · Promotion ${promo}`, couleur: m.couleur },
      { t: 'table', taille: 9, colonnes: [{ titre: 'Document', part: 88 }, { titre: 'Page', part: 12, centre: true, gras: true }], lignes }] };
  };
  let som = await PDFDocument.load(await creerPDF(sommaire(3), logo, { pied: false }));
  const nSom = som.getPageCount();
  if (nSom !== 1) som = await PDFDocument.load(await creerPDF(sommaire(2 + nSom), logo, { pied: false }));
  // ---------------------------------------------------------------- assemblage
  const pdf = await PDFDocument.create();
  pdf.setTitle(nettoyer(`Classeur · ${m.nom} · ${promo}`)); pdf.setCreator('Pilotage BTS SCBH');
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const C = (hex) => { const n = parseInt(String(hex || '#1E8F86').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  pageDeGarde(pdf, { F, FB, C, logo: logo ? await pdf.embedJpg(logo).catch(() => null) : null }, m, ctx, ctxs, profs, parties);
  for (const src of [som, ...contenus]) (await pdf.copyPages(src, src.getPageIndices())).forEach((p) => pdf.addPage(p));
  const N = pdf.getPageCount(), GRIS = C('#5F6F6C');
  pdf.getPages().forEach((p, i) => {
    if (i === 0) return;
    const n = `${i + 1} / ${N}`;
    p.drawText(nettoyer(pied), { x: 40, y: 22, size: 7, font: F, color: GRIS });
    p.drawText(n, { x: 595.28 - 40 - F.widthOfTextAtSize(n, 7), y: 22, size: 7, font: F, color: GRIS });
  });
  return pdf.save();
}

const volumeTotal = (ctxs) => {
  const se = ctxs.flatMap((S) => S.seances.filter((x) => x.titre || x.objectif_inter));
  return `${ctxs.length} séquence(s) · ${se.length} séance(s) · ${heures(se.reduce((a, x) => a + (Number(x.duree) || 0), 0)) || '0 h'}`;
};

function pageDeGarde(pdf, { F, FB, C, logo }, m, ctx, ctxs, profs, parties) {
  const W = 595.28, H = 841.89, p = pdf.addPage([W, H]);
  const T = (t, x, y, f, s, c) => p.drawText(nettoyer(t), { x, y, size: s, font: f, color: c });
  const coul = C(m.couleur), FONCE = C('#146B63'), GRIS = C('#5F6F6C');
  p.drawRectangle({ x: 0, y: 0, width: 26, height: H, color: coul });
  p.drawRectangle({ x: 26, y: H - 300, width: W - 26, height: 300, color: C('#F1F4F3') });
  if (logo) { const s = 58 / logo.height; p.drawImage(logo, { x: 70, y: H - 110, width: logo.width * s, height: 58 }); }
  T('CLASSEUR PÉDAGOGIQUE', 70, H - 170, FB, 13, GRIS);
  // nom de la matière, sur deux lignes si besoin
  const mots = nettoyer(m.nom).split(' '), lignes = []; let cur = '';
  for (const w of mots) { const e = cur ? cur + ' ' + w : w; if (FB.widthOfTextAtSize(e, 40) > W - 130 && cur) { lignes.push(cur); cur = w; } else cur = e; }
  lignes.push(cur);
  lignes.slice(0, 2).forEach((l, i) => T(l, 70, H - 220 - i * 46, FB, 40, coul));
  T(`Promotion ${ctx.promo.libelle}`, 70, H - 330, FB, 18, FONCE);
  T('BTS Systèmes Constructifs Bois et Habitat', 70, H - 352, F, 12, GRIS);
  T('Enseignant(s)', 70, H - 400, FB, 10, GRIS);
  T(profs, 70, H - 416, F, 13, C('#1F2D2B'));
  // chiffres clés
  const se = ctxs.flatMap((S) => S.seances.filter((x) => x.titre || x.objectif_inter));
  const vol = se.reduce((a, x) => a + (Number(x.duree) || 0), 0);
  const cases = [[String(ctxs.length), 'séquence(s)'], [String(se.length), 'séance(s)'], [heures(vol) || '0 h', 'volume horaire']];
  const lc = (W - 140 - 2 * 14) / 3;
  cases.forEach(([v, l], i) => {
    const x = 70 + i * (lc + 14), y = H - 520;
    p.drawRectangle({ x, y, width: lc, height: 74, color: C('#FFFFFF'), borderColor: coul, borderWidth: 1.4 });
    T(v, x + 14, y + 36, FB, 26, coul); T(l, x + 14, y + 16, F, 10, GRIS);
  });
  // séquences
  T('Séquences', 70, H - 562, FB, 10, GRIS);
  ctxs.slice(0, 10).forEach((S, i) => {
    const y = H - 582 - i * 17;
    p.drawCircle({ x: 75, y: y + 3.5, size: 3, color: coul });
    let t = `Séquence ${S.sq.numero} · ${S.sq.intitule || 'sans intitulé'}`;
    while (F.widthOfTextAtSize(nettoyer(t), 11) > W - 160) t = t.slice(0, -2);
    T(t, 86, y, F, 11, C('#1F2D2B'));
  });
  const contenu = nettoyer(`Contenu : ${PARTIES.filter(([k]) => parties.has(k)).map(([, t]) => t.replace(/ \(.*\)/, '').toLowerCase()).join(', ')}.`);
  const lc2 = []; let c2 = '';
  for (const w of contenu.split(' ')) { const e = c2 ? c2 + ' ' + w : w; if (F.widthOfTextAtSize(e, 8) > W - 120 && c2) { lc2.push(c2); c2 = w; } else c2 = e; }
  lc2.push(c2);
  lc2.slice(0, 3).forEach((l, i) => T(l, 70, 82 - i * 11, F, 8, GRIS));
  T(`Édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 70, 54, F, 8, GRIS);
}
