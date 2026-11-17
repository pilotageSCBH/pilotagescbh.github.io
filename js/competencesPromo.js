// Meilleur niveau obtenu par élève et par compétence dans une promotion : contrats sommatifs de toutes les matières
// (y compris hors séquence), évaluations directes (ex. en entreprise) et, pour les redoublants, acquis de la promotion d'origine.
// Même règle que « Validation des compétences » : la meilleure note, à égalité la plus récente.
import { db } from './api.js';
import { moyenne } from './pages/contrat.js';
import { acquisAnterieurs, fusionnerAcquis, chargerManuelles, ajouterManuelles } from './redoublants.js';

export async function meilleursNiveaux(ctx, eleves) {
  const P = ctx.promo;
  const sequences = await db.lire('sequences', `promotion_id=eq.${P.id}`);
  const contrats = [...(sequences.length ? await db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : []),
    ...(await db.lire('contrats', `type=eq.sommatif&promotion_id=eq.${P.id}`).catch(() => []))];
  const criteres = contrats.length ? (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif) : [];
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  const R = new Map(eleves.map((e) => [e.id, new Map()]));
  for (const c of contrats) {
    const sq = sequences.find((s) => s.id === c.sequence_id), m = ctx.matieres.find((x) => x.id === (sq?.matiere_id ?? c.matiere_id));
    const groupes = new Map();
    for (const k of criteres.filter((x) => x.contrat_id === c.id)) groupes.set(k.groupe, (groupes.get(k.groupe) || []).concat(k));
    for (const [code, ks] of groupes) for (const e of eleves) {
      const n = moyenne(ks, notes, e.id); if (n === null) continue;
      const best = R.get(e.id), b = best.get(code);
      if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || ''))) best.set(code, { n, date: c.date_eval, mat: m ? ctx.codeMat(m) : '' });
    }
  }
  const manuelles = await chargerManuelles(P.id);
  const anterieurs = await acquisAnterieurs(ctx, eleves);
  for (const e of eleves) fusionnerAcquis(ajouterManuelles(R.get(e.id), manuelles, e.id), anterieurs.get(e.id));
  return R;
}

// codes du référentiel couverts par un code d'épreuve : « C2-2 » → C2-2a, C2-2b… ; « C6 » → C6a, C6b
export const codesDe = (competences, codeEpreuve) => competences.filter((c) => c.code === codeEpreuve || (c.code.startsWith(codeEpreuve) && /^[a-z]$/i.test(c.code.slice(codeEpreuve.length))));
