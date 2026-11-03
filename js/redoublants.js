// Élèves redoublants : repères communs aux pages (badge, évaluations antérieures à l'arrivée, acquis de la promotion
// d'origine). Un redoublant a une fiche dans la promotion en cours (redoublant = true, date_arrivee) reliée à sa fiche
// d'origine (origine_eleve_id) qui garde ses notes et ses compétences de la promotion précédente.
import { db } from './api.js';
import { h, dateFr } from './ui.js';
import { moyenne } from './pages/contrat.js';

export const libPromo = (ctx, id) => ctx.promotions.find((p) => p.id === id)?.libelle || '';

// petit badge « R » à côté du nom
export function badgeRedoublant(e, ctx, long = false) {
  if (!e?.redoublant) return null;
  const origine = e.origine_promotion_id ? ` · vient de la promotion ${libPromo(ctx, e.origine_promotion_id)}` : '';
  const arrivee = e.date_arrivee ? ` · arrivé(e) le ${dateFr(e.date_arrivee)}` : '';
  return h('span', { class: 'badge-redoublant' + (long ? ' long' : ''), title: `Redoublant(e)${origine}${arrivee}` }, long ? '↻ Redoublant(e)' : 'R');
}

// l'évaluation datée du jour d concerne-t-elle l'élève ? (non si elle a eu lieu avant son arrivée dans la promotion)
export const concerne = (e, d) => !(e?.date_arrivee && d && d < e.date_arrivee);

// acquis antérieurs : pour chaque élève relié à une fiche d'origine (et, en chaîne, aux fiches plus anciennes),
// meilleur niveau obtenu par compétence dans les contrats sommatifs de ses promotions précédentes.
// Résultat : Map(id de l'élève → Map(code → { n, date, mat, matNom, promo }))
export async function acquisAnterieurs(ctx, eleves) {
  const R = new Map();
  const suivis = eleves.filter((e) => e.origine_eleve_id);
  if (!suivis.length) return R;
  // remonter les fiches d'origine (3 niveaux au plus)
  const fiches = new Map(), chaine = new Map(suivis.map((e) => [e.id, []]));
  let aLire = [...new Set(suivis.map((e) => e.origine_eleve_id))];
  for (let niveauChaine = 0; niveauChaine < 3 && aLire.length; niveauChaine++) {
    const lues = await db.lire('eleves', `id=in.(${aLire.join(',')})`);
    lues.forEach((o) => fiches.set(o.id, o));
    aLire = [...new Set(lues.map((o) => o.origine_eleve_id).filter((x) => x && !fiches.has(x)))];
  }
  for (const e of suivis) { let o = fiches.get(e.origine_eleve_id); const l = chaine.get(e.id);
    while (o && !l.includes(o.id) && l.length < 3) { l.push(o.id); o = fiches.get(o.origine_eleve_id); } }
  const ids = [...fiches.keys()], promos = [...new Set([...fiches.values()].map((o) => o.promotion_id))];
  const sequences = await db.lire('sequences', `promotion_id=in.(${promos.join(',')})`);
  const contrats = [...(sequences.length ? await db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : []),
    ...(await db.lire('contrats', `type=eq.sommatif&promotion_id=in.(${promos.join(',')})`).catch(() => []))];   // + contrats hors séquence
  if (!contrats.length) return R;
  const criteres = (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif);
  if (!criteres.length) return R;
  const notesL = await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&eleve_id=in.(${ids.join(',')})`);
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  const parFiche = new Map();
  for (const oid of ids) {
    const best = new Map(), o = fiches.get(oid);
    for (const c of contrats) {
      const s = sequences.find((x) => x.id === c.sequence_id);
      if ((s ? s.promotion_id : c.promotion_id) !== o.promotion_id) continue;
      const mat = ctx.matieres.find((x) => x.id === (s ? s.matiere_id : c.matiere_id)), groupes = new Map();
      for (const k of criteres.filter((x) => x.contrat_id === c.id)) groupes.set(k.groupe, (groupes.get(k.groupe) || []).concat(k));
      for (const [code, ks] of groupes) {
        const n = moyenne(ks, notes, oid);
        if (n === null) continue;
        const b = best.get(code);
        if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || '')))
          best.set(code, { n, date: c.date_eval, mat: mat ? ctx.codeMat(mat) : '', matNom: mat?.nom || '', promo: libPromo(ctx, o.promotion_id), anterieur: true });
      }
    }
    parFiche.set(oid, best);
  }
  for (const [eid, l] of chaine) {
    const m = new Map();
    for (const oid of l) for (const [code, b] of parFiche.get(oid) || []) { const x = m.get(code); if (!x || b.n > x.n) m.set(code, b); }
    if (m.size) R.set(eid, m);
  }
  return R;
}

// ajoute à « best » (meilleurs niveaux dans la promotion en cours) les acquis antérieurs meilleurs (à égalité : l'actuel)
export function fusionnerAcquis(best, anterieurs) {
  if (!anterieurs) return best;
  for (const [code, b] of anterieurs) { const x = best.get(code); if (!x || b.n > x.n) best.set(code, b); }
  return best;
}
