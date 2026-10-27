// Outils communs à « Ma semaine », au calendrier des évaluations et aux alertes de pilotage :
// semaines de la promotion (90 semaines, 2 × 45 depuis la rentrée), chargement des données de suivi, liste des
// évaluations datées et calcul des alertes.
import { db } from './api.js';

export const SEM_AN = 45, NB_SEM = 90;
const JOUR = 86400000;
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// lundi de la semaine w de la promotion qui commence l'année Y
export function lundi(Y, w) {
  const d = new Date(Y + Math.floor(w / SEM_AN), 8, 1);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (w % SEM_AN));
  return d;
}
export const jourDe = (Y, w, k) => { const d = lundi(Y, w); d.setDate(d.getDate() + k); return d; };
export const jj = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
export function semaineIso(d0) {
  const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / JOUR + 1) / 7);
}
export const libSemaine = (Y, w) => `S${semaineIso(lundi(Y, w))} · ${jj(lundi(Y, w))} → ${jj(jourDe(Y, w, 4))}`;
const local = (d) => (typeof d === 'string' ? new Date(d + 'T12:00:00') : d);
// semaine de la promotion contenant la date (null si hors des deux années scolaires)
export function semaineDe(Y, date) {
  const d = local(date);
  for (const a of [0, 1]) {
    const k = Math.floor((d - lundi(Y, a * SEM_AN)) / (7 * JOUR));
    if (k >= 0 && k < SEM_AN) return a * SEM_AN + k;
  }
  return null;
}
// semaine « actuelle » : celle d'aujourd'hui, sinon la plus proche (été, avant ou après la formation)
export function semaineActuelle(Y) {
  const t = new Date(), w = semaineDe(Y, t);
  if (w !== null) return w;
  if (t < lundi(Y, 0)) return 0;
  if (t < lundi(Y, SEM_AN)) return SEM_AN;
  return NB_SEM - 1;
}
export const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ------------------------------------------------------------------------------------------- données
export async function chargerSuivi(ctx) {
  const P = ctx.promo;
  const [sequences, semainesL, joursL, casesL, evaluations, couverture, eleves, sommes] = await Promise.all([
    db.lire('sequences', `promotion_id=eq.${P.id}&order=matiere_id,numero`), db.lire('progression_semaines', `promotion_id=eq.${P.id}`),
    db.lire('progression_jours', `promotion_id=eq.${P.id}`), db.lire('progression_cases', `promotion_id=eq.${P.id}`),
    db.lire('evaluations', `promotion_id=eq.${P.id}&order=date_eval.nullslast,id`).catch(() => []),
    db.lire('couverture', `promotion_id=eq.${P.id}&type=eq.competence`).catch(() => []),
    db.lire('eleves', `promotion_id=eq.${P.id}`), db.rpc('notes_sommatives', { p: P.id }).catch(() => [])]);
  const idsSeq = sequences.map((s) => s.id);
  const seancesL = idsSeq.length ? await db.lire('seances', `sequence_id=in.(${idsSeq.join(',')})&order=sequence_id,numero`) : [];
  const idsSe = seancesL.map((x) => x.id);
  const [contrats1, contrats2, fiches, resultats] = await Promise.all([
    idsSeq.length ? db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${idsSeq.join(',')})`) : [],
    idsSe.length ? db.lire('contrats', `type=eq.formatif&seance_id=in.(${idsSe.join(',')})`) : [],
    idsSe.length ? db.lire('fiches_seance', `seance_id=in.(${idsSe.join(',')})&select=seance_id,phases,maison_avant,maison_apres`) : [],
    evaluations.length ? db.lire('resultats', `evaluation_id=in.(${evaluations.map((v) => v.id).join(',')})&select=evaluation_id`) : []]);
  const contrats = [...contrats1, ...contrats2];
  const criteres = contrats.length ? await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&actif=is.true&select=id,contrat_id,groupe`) : [];
  const seqs = new Map(sequences.map((s) => [s.id, s]));
  const seances = new Map(seancesL.map((x) => [x.id, { ...x, seq: seqs.get(x.sequence_id), mat: ctx.matieres.find((m) => m.id === seqs.get(x.sequence_id)?.matiere_id) }]));
  return {
    P, Y: P.annee_debut, sequences, seqs, seances, contrats, criteres, evaluations, couverture,
    eleves: eleves.filter((e) => !e.arret),
    semaines: new Map(semainesL.map((s) => [s.semaine, s])), jours: new Map(joursL.map((j) => [j.jour, j.evenement])),
    cases: casesL, fiches: new Map(fiches.map((f) => [f.seance_id, f])),
    noteesContrats: new Set((sommes || []).map((r) => r.contrat_id)), noteesEvals: new Set(resultats.map((r) => r.evaluation_id)),
  };
}

// première semaine (et liste des semaines) où chaque séance est placée dans la progression
export function placements(D) {
  const r = new Map();
  for (const c of D.cases) if (c.seance_id) r.set(c.seance_id, (r.get(c.seance_id) || []).concat(c.semaine).sort((a, b) => a - b));
  return r;
}

// toutes les évaluations : contrats sommatifs, contrats formatifs et résultats intermédiaires
export function listeEvaluations(D, ctx) {
  const l = [];
  for (const c of D.contrats) {
    const x = c.seance_id ? D.seances.get(c.seance_id) : null, s = c.type === 'sommatif' ? D.seqs.get(c.sequence_id) : x?.seq;
    if (!s) continue;
    const m = ctx.matieres.find((y) => y.id === s.matiere_id);
    l.push({ type: c.type, id: c.id, date: c.date_eval, mat: m, notee: c.type === 'sommatif' ? D.noteesContrats.has(c.id) : null,
      titre: c.type === 'sommatif' ? `Contrat sommatif · séquence ${s.numero}${s.intitule ? ' · ' + s.intitule : ''}` : `Contrat formatif · séance ${s.numero}.${x.numero}${x.titre ? ' · ' + x.titre : ''}`,
      lien: c.type === 'sommatif' ? `#/fiches/${s.id}:sommatif` : `#/fiches/${s.id}:formatif-${x.id}`, forme: c.forme });
  }
  for (const v of D.evaluations) {
    const m = ctx.matieres.find((y) => y.id === v.matiere_id);
    l.push({ type: 'resultat', id: v.id, date: v.date_eval, mat: m, notee: D.noteesEvals.has(v.id), titre: v.libelle || 'Résultat intermédiaire', lien: '#/resultats' });
  }
  return l.filter((e) => e.mat);
}
export const TYPES_EVAL = { sommatif: 'Sommatif', formatif: 'Formatif', resultat: 'Résultat intermédiaire' };

// ------------------------------------------------------------------------------------------- alertes
// gravité : 3 importante, 2 à surveiller, 1 information. mats : matières suivies (ids).
export function calculerAlertes(D, ctx, ref, mats) {
  const suivies = new Set(mats);
  const dans = (m) => m && suivies.has(m.id);
  const pl = placements(D), auj = aujourdhui(), wAuj = semaineActuelle(D.Y);
  const miParcours = wAuj >= SEM_AN;
  const etiq = (x) => `${ctx.codeMat(x.mat)} ${x.seq.numero}.${x.numero}${x.titre ? ' · ' + x.titre : ''}`;
  const remplie = (x) => !!(x.titre || x.objectif_inter);
  const seancesSuivies = [...D.seances.values()].filter((x) => dans(x.mat) && remplie(x))
    .sort((a, b) => ctx.matieres.indexOf(a.mat) - ctx.matieres.indexOf(b.mat) || a.seq.numero - b.seq.numero || a.numero - b.numero);
  const A = [];
  const ajouter = (gravite, cle, titre, explication, elements) => { if (elements.length) A.push({ gravite, cle, titre, explication, elements }); };
  const lienSeq = (s) => `#/sequencage/${s.matiere_id}`;

  // prérequis non respectés dans la progression
  ajouter(3, 'prerequis', 'Prérequis non respectés', 'Séance placée avant (ou la même semaine que) une séance qui lui est prérequise.',
    seancesSuivies.filter((x) => pl.has(x.id)).flatMap((x) => (x.prerequis || []).map((i) => D.seances.get(Number(i))).filter(Boolean)
      .filter((y) => !pl.has(y.id) || pl.get(y.id)[0] >= pl.get(x.id)[0])
      .map((y) => ({ texte: `${etiq(x)}  ←  prérequis ${etiq(y)}${pl.has(y.id) ? '' : ' (non placée)'}`, lien: '#/progression/' + x.mat.id }))));
  // notes à saisir
  const evals = listeEvaluations(D, ctx).filter((e) => dans(e.mat));
  ajouter(3, 'notes', 'Notes à saisir', 'Évaluation dont la date est passée et pour laquelle aucune note n’a été saisie.',
    evals.filter((e) => e.type !== 'formatif' && e.date && e.date < auj && !e.notee)
      .map((e) => ({ texte: `${ctx.codeMat(e.mat)} · ${e.titre} (${e.date.split('-').reverse().join('/')})`, lien: e.lien })));
  // semaines chargées en évaluations (toutes matières, sommatifs et résultats)
  const parSem = new Map();
  for (const e of listeEvaluations(D, ctx)) {
    if (e.type === 'formatif' || !e.date) continue;
    const w = semaineDe(D.Y, e.date); if (w === null) continue;
    parSem.set(w, (parSem.get(w) || []).concat(e));
  }
  ajouter(2, 'surcharge', 'Semaines chargées en évaluations', 'Plusieurs évaluations (contrats sommatifs ou résultats) la même semaine, toutes matières confondues.',
    [...parSem].filter(([, l]) => l.length >= 2 && l.some((e) => dans(e.mat))).sort((a, b) => a[0] - b[0])
      .map(([w, l]) => ({ texte: `${libSemaine(D.Y, w)} : ${l.length} évaluations (${l.map((e) => ctx.codeMat(e.mat)).join(', ')})`, lien: '#/evaluations' })));
  // séquences sans contrat sommatif / contrats sans date ou sans critère
  const seqSuivies = D.sequences.filter((s) => suivies.has(s.matiere_id) && [...D.seances.values()].some((x) => x.sequence_id === s.id && remplie(x)));
  const somm = new Map(D.contrats.filter((c) => c.type === 'sommatif').map((c) => [c.sequence_id, c]));
  const libSeq = (s) => `${ctx.codeMat(ctx.matieres.find((m) => m.id === s.matiere_id))} séquence ${s.numero}${s.intitule ? ' · ' + s.intitule : ''}`;
  ajouter(2, 'sans-contrat', 'Séquences sans contrat sommatif', 'Aucun contrat d’évaluation sommative (ou aucun critère) : la séquence ne compte pas dans la validation des compétences ni dans les moyennes.',
    seqSuivies.filter((s) => !somm.has(s.id) || !D.criteres.some((k) => k.contrat_id === somm.get(s.id).id))
      .map((s) => ({ texte: libSeq(s), lien: `#/fiches/${s.id}:sommatif` })));
  ajouter(2, 'sans-date', 'Contrats sommatifs sans date', 'Sans date, l’évaluation n’apparaît pas dans le calendrier et n’est comptée que dans « Toute la formation ».',
    seqSuivies.filter((s) => somm.has(s.id) && !somm.get(s.id).date_eval && D.criteres.some((k) => k.contrat_id === somm.get(s.id).id))
      .map((s) => ({ texte: libSeq(s), lien: `#/fiches/${s.id}:sommatif` })));
  // séances non placées
  ajouter(2, 'non-placees', 'Séances non placées dans la progression', 'Séance rédigée dans le séquençage mais placée sur aucune semaine.',
    seancesSuivies.filter((x) => !pl.has(x.id)).map((x) => ({ texte: etiq(x), lien: '#/progression/' + x.mat.id })));
  // compétences
  const traitees = new Map();
  for (const x of D.seances.values()) if (remplie(x)) for (const c of x.competences || []) traitees.set(c, (traitees.get(c) || new Set()).add(x.mat?.id));
  const evaluees = new Set(D.criteres.filter((k) => D.contrats.find((c) => c.id === k.contrat_id)?.type === 'sommatif').map((k) => k.groupe));
  const prevuesNonTraitees = D.couverture.filter((c) => suivies.has(c.matiere_id) && !(traitees.get(c.code)?.has(c.matiere_id)) && ref.comp[c.code]);
  ajouter(miParcours ? 3 : 2, 'prevues', 'Compétences prévues sans séance', 'Compétence cochée « Prévue » dans la couverture d’une matière, mais traitée par aucune de ses séances.',
    prevuesNonTraitees.map((c) => ({ texte: `${ctx.codeMat(ctx.matieres.find((m) => m.id === c.matiere_id))} · ${c.code} · ${ref.comp[c.code].libelle}`, lien: '#/couverture/competences' })));
  ajouter(miParcours ? 3 : 1, 'non-couvertes', miParcours ? 'Compétences non couvertes à mi-parcours' : 'Compétences non encore couvertes',
    'Compétence du référentiel traitée par aucune séance, toutes matières confondues' + (miParcours ? ' : la formation a passé la mi-parcours.' : '.'),
    ref.competences.filter((c) => !traitees.has(c.code)).map((c) => ({ texte: `${c.code} · ${c.libelle}`, lien: '#/couverture/competences' })));
  if (miParcours) ajouter(2, 'non-evaluees', 'Compétences traitées mais jamais évaluées', 'Compétence traitée en séance mais présente dans aucun contrat sommatif, alors que la formation a passé la mi-parcours.',
    ref.competences.filter((c) => traitees.has(c.code) && !evaluees.has(c.code)).map((c) => ({ texte: `${c.code} · ${c.libelle}`, lien: '#/validation' })));
  // fiches
  const ficheVide = (x) => { const f = D.fiches.get(x.id); return !f || !(f.phases || []).some((p) => p.activite || p.phase || p.enseignant || p.eleves); };
  ajouter(1, 'sans-fiche', 'Séances sans fiche de déroulement', 'Aucune phase rédigée dans la fiche de déroulement.',
    seancesSuivies.filter(ficheVide).map((x) => ({ texte: etiq(x), lien: `#/fiches/${x.seq.id}:seance-${x.id}` })));
  ajouter(1, 'sans-competence', 'Séances sans compétence', 'Aucune compétence du référentiel choisie dans le séquençage.',
    seancesSuivies.filter((x) => !(x.competences || []).length).map((x) => ({ texte: etiq(x), lien: lienSeq(x.seq) })));
  // calendrier et équipe
  if (![...D.semaines.values()].some((s) => s.vacances)) ajouter(2, 'calendrier', 'Calendrier non renseigné', 'Aucune semaine de vacances, d’épreuves ou de stage dans la progression : les séances se placent sur toutes les semaines.',
    [{ texte: 'Renseigner les vacances dans la progression', lien: '#/progression' }]);
  ajouter(1, 'sans-enseignant', 'Matières sans enseignant', 'Matière attribuée à aucun enseignant dans « Matières et équipe ».',
    ctx.matieres.filter((m) => suivies.has(m.id) && !ctx.enseignantsDe(m.id).length).map((m) => ({ texte: m.nom, lien: '#/equipe' })));
  return A.sort((a, b) => b.gravite - a.gravite);
}

// matières suivies par défaut : celles qu'on enseigne, sinon toutes
export const mesMatieres = (ctx) => { const m = ctx.matieres.filter((y) => ctx.enseigne(y.id)); return m.length ? m : ctx.matieres; };
