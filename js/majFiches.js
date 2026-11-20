// Mise à jour des fiches d'une matière d'après son séquençage (après un import ou une refonte du séquençage) :
// - contrats sommatifs : une rubrique par compétence des séances de la séquence (ajout des nouvelles, retrait des anciennes) ;
// - contrats formatifs : une rubrique par objectif opérationnel de la séance (critères = résultats attendus de la tâche citée) ;
// - fiches de préparation : « Activités et tâches visées » = tâches citées dans les séances [A1-T1] (si elles en citent) ;
// - en option, prérequis des fiches de préparation = séances prérequises du séquençage (les fiches de déroulement les lisent directement).
// Une rubrique devenue inutile est supprimée, sauf si des notes y sont saisies ou si un QCM est couplé au contrat :
// elle est alors seulement « retirée » (masquée, récupérable avec « Voir les critères retirés »).
import { db } from './api.js';
import { h, fenetre, toast } from './ui.js';

const ligneOp = (l) => l.replace(/^\s*(?:[-*•–]+|\d+[.)])\s*/, '').trim();
const objectifs = (x) => String(x.objectifs_ops || '').replace(/\r/g, '').split('\n').map(ligneOp).filter(Boolean);
const tachesDe = (txt) => [...String(txt || '').matchAll(/\[(A\d+-T\d+)\]/g)].map((m) => m[1]);
const parPaquets = async (table, col, ids, suite = '') => {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...await db.lire(table, `${col}=in.(${ids.slice(i, i + 150).join(',')})${suite}`));
  return out;
};

async function analyser(m, ctx, ref) {
  const S = (await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&matiere_id=eq.${m.id}&order=numero`));
  const X = S.length ? await parPaquets('seances', 'sequence_id', S.map((s) => s.id), '&order=sequence_id,numero') : [];
  const fichesS = S.length ? await parPaquets('fiches_sequence', 'sequence_id', S.map((s) => s.id)) : [];
  const fichesX = X.length ? await parPaquets('fiches_seance', 'seance_id', X.map((x) => x.id)) : [];
  const contrats = [...(S.length ? await parPaquets('contrats', 'sequence_id', S.map((s) => s.id), '&type=eq.sommatif') : []),
    ...(X.length ? await parPaquets('contrats', 'seance_id', X.map((x) => x.id), '&type=eq.formatif') : [])];
  const criteres = contrats.length ? await parPaquets('criteres', 'contrat_id', contrats.map((c) => c.id)) : [];
  const notees = new Set(criteres.length ? (await parPaquets('notes', 'critere_id', criteres.map((k) => k.id))).map((n) => n.critere_id) : []);
  const qcm = contrats.length ? new Set((await parPaquets('qcm', 'contrat_id', contrats.map((c) => c.id)).catch(() => [])).map((q) => q.contrat_id)) : new Set();
  // séances prérequises (toutes matières de la promotion) pour les libellés
  const preIds = [...new Set(X.flatMap((x) => x.prerequis || []))];
  const preX = preIds.length ? await parPaquets('seances', 'id', preIds) : [];
  const preS = preX.length ? await parPaquets('sequences', 'id', [...new Set(preX.map((y) => y.sequence_id))]) : [];
  const libPre = (id) => {
    const y = preX.find((z) => z.id === Number(id)); if (!y) return null;
    const s = preS.find((z) => z.id === y.sequence_id); const mat = ctx.matieres.find((z) => z.id === s?.matiere_id);
    return { s, y, txt: `${mat ? ctx.codeMat(mat) + ' ' : ''}${s?.numero}.${y.numero} · ${y.titre || 'sans titre'}${mat && mat.id !== m.id ? ' (' + mat.nom + ')' : ''}` };
  };
  const ordreC = new Map(ref.competences.map((c, i) => [c.code, i]));
  const groupesDe = (c) => { const g = new Map(); for (const k of criteres.filter((k) => k.contrat_id === c.id)) { if (!g.has(k.groupe)) g.set(k.groupe, []); g.get(k.groupe).push(k); } return g; };
  const protege = (c, ks) => qcm.has(c.id) || ks.some((k) => notees.has(k.id));

  const plan = [];   // [{ seq, lignes: [texte], actions: [async fn], type }]
  for (const s of S) {
    const xs = X.filter((x) => x.sequence_id === s.id);
    const fs = fichesS.find((f) => f.sequence_id === s.id) || {};
    const p = { seq: s, contrats: [], activites: null, prerequis: [] };
    // contrat sommatif
    const cs = contrats.find((c) => c.type === 'sommatif' && c.sequence_id === s.id);
    if (cs) {
      const veut = [...new Set(xs.flatMap((x) => x.competences || []))].sort((a, b) => (ordreC.get(a) ?? 999) - (ordreC.get(b) ?? 999));
      const g = groupesDe(cs);
      const anciens = [...g.keys()].filter((k) => ref.comp[k] && !veut.includes(k) && g.get(k).some((c) => c.actif));
      const nouveaux = veut.filter((k) => !g.has(k));
      const reactiver = veut.filter((k) => g.has(k) && g.get(k).every((c) => !c.actif));
      if (anciens.length || nouveaux.length || reactiver.length) {
        p.contrats.push({ lib: `Contrat sommatif : ${[nouveaux.length ? '+ ' + nouveaux.join(' ') : '', anciens.length ? '− ' + anciens.join(' ') : '', reactiver.length ? '↺ ' + reactiver.join(' ') : ''].filter(Boolean).join('  ·  ')}`,
          retenus: anciens.filter((k) => protege(cs, g.get(k))),
          faire: async () => {
            for (const k of anciens) {
              const ks = g.get(k);
              if (protege(cs, ks)) { for (const c of ks.filter((c) => c.actif)) await db.modifier('criteres', c.id, { actif: false }); }
              else for (const c of ks) await db.supprimer('criteres', c.id);
            }
            for (const k of reactiver) for (const c of g.get(k)) await db.modifier('criteres', c.id, { actif: true });
            if (nouveaux.length) await db.rpc('contrat_sommatif', { s: s.id });
          } });
      }
    }
    // contrats formatifs
    for (const x of xs) {
      const cf = contrats.find((c) => c.type === 'formatif' && c.seance_id === x.id);
      if (!cf) continue;
      const veut = objectifs(x); if (!veut.length) veut.push('Objectif de la séance');
      const g = groupesDe(cf);
      const anciens = [...g.keys()].filter((k) => !veut.includes(k) && g.get(k).some((c) => c.actif));
      const nouveaux = veut.filter((k) => !g.has(k));
      const desordre = veut.some((k, i) => g.has(k) && g.get(k).some((c) => c.groupe_ordre !== i + 1));
      if (!anciens.length && !nouveaux.length && !desordre) continue;
      p.contrats.push({ lib: `Contrat formatif ${s.numero}.${x.numero} : ${nouveaux.length} objectif(s) ajouté(s), ${anciens.length} retiré(s)${!nouveaux.length && !anciens.length ? ' (ordre)' : ''}`,
        retenus: anciens.filter((k) => protege(cf, g.get(k))).map((k) => `${s.numero}.${x.numero} « ${k.slice(0, 60)} »`),
        faire: async () => {
          for (const k of anciens) {
            const ks = g.get(k);
            if (protege(cf, ks)) { for (const c of ks.filter((c) => c.actif)) await db.modifier('criteres', c.id, { actif: false, groupe_ordre: 900 }); }
            else for (const c of ks) await db.supprimer('criteres', c.id);
          }
          for (const [i, k] of veut.entries()) {
            if (g.has(k)) { for (const c of g.get(k).filter((c) => c.groupe_ordre !== i + 1)) await db.modifier('criteres', c.id, { groupe_ordre: i + 1 }); continue; }
            const t = tachesDe(k)[0]; const res = (t && ref.taches.find((z) => z.code === t)?.resultats) || [];
            const lignes = res.length ? res.map((r, j) => ({ contrat_id: cf.id, groupe: k, groupe_ordre: i + 1, ordre: j + 1, texte: r }))
              : [1, 2].map((j) => ({ contrat_id: cf.id, groupe: k, groupe_ordre: i + 1, ordre: j, texte: '', libre: true }));
            await db.ajouter('criteres', lignes);
          }
        } });
    }
    // activités et tâches visées (fiche de préparation)
    const taches = [...new Set(xs.flatMap((x) => tachesDe(x.objectifs_ops)))];
    if (taches.length) {
      const txt = taches.map((t) => `${t} – ${ref.taches.find((z) => z.code === t)?.libelle || ''}`).join('\n');
      if (txt !== (fs.activites || '')) p.activites = { txt, faire: () => db.enregistrer('fiches_sequence', [{ sequence_id: s.id, activites: txt }], 'sequence_id') };
    } else p.sansTaches = true;
    // prérequis (option) : séquence = séances prérequises situées hors de la séquence ; séance = ses séances prérequises
    const preSeq = [...new Set(xs.flatMap((x) => x.prerequis || []))].map(libPre).filter((v) => v && v.y.sequence_id !== s.id);
    const autresSeq = [...new Set(xs.map((x) => x.prerequis_texte).filter(Boolean))];
    const txtSeq = [...preSeq.map((v) => '- ' + v.txt), ...autresSeq.map((t) => '- ' + t)].join('\n');
    if (txtSeq && txtSeq !== (fs.prerequis || '')) p.prerequis.push({ lib: `Fiche de préparation ${s.numero}`, faire: () => db.enregistrer('fiches_sequence', [{ sequence_id: s.id, prerequis: txtSeq }], 'sequence_id') });
    // (fiches de déroulement : les prérequis sont lus directement dans le séquençage)
    plan.push(p);
  }
  return plan;
}

export async function mettreAJourFiches(m, ctx, { apresImport = false } = {}) {
  const ref = await ctx.referentiel();
  const plan = await analyser(m, ctx, ref);
  const nbContrats = plan.reduce((a, p) => a + p.contrats.length, 0);
  const nbAct = plan.filter((p) => p.activites).length;
  const nbPre = plan.reduce((a, p) => a + p.prerequis.length, 0);
  const sansTaches = plan.filter((p) => p.sansTaches).map((p) => p.seq.numero);
  const retenus = plan.flatMap((p) => p.contrats.flatMap((c) => c.retenus));
  if (!nbContrats && !nbAct && !nbPre) {
    toast('Les fiches sont déjà à jour du séquençage');
    return false;
  }
  const cContrats = h('input', { type: 'checkbox', checked: nbContrats > 0, disabled: !nbContrats });
  const cAct = h('input', { type: 'checkbox', checked: nbAct > 0, disabled: !nbAct });
  const cPre = h('input', { type: 'checkbox', checked: false, disabled: !nbPre });
  const ok = await fenetre(`Mettre à jour les fiches · ${m.nom}`, h('div', { class: 'maj-fiches' },
    apresImport ? h('p', {}, 'Le séquençage a changé : voici ce qui peut être mis à jour dans les fiches de la matière.') : null,
    h('label', { class: 'case-maj' }, cContrats, h('span', {}, h('b', {}, `Fiches contrats (${nbContrats})`),
      h('small', {}, 'Sommatif : une rubrique par compétence de la séquence. Formatif : une rubrique par objectif opérationnel de la séance, critères repris des résultats attendus de la tâche citée.'))),
    nbContrats ? h('ul', { class: 'liste-maj' }, plan.flatMap((p) => p.contrats.map((c) => h('li', {}, c.lib)))) : null,
    h('label', { class: 'case-maj' }, cAct, h('span', {}, h('b', {}, `Activités et tâches visées (${nbAct})`),
      h('small', {}, 'Fiches de préparation : remplacées par les tâches citées entre crochets dans les objectifs opérationnels, ex. [A1-T1].'
        + (sansTaches.length ? ` Séquence(s) ${sansTaches.join(', ')} : aucune tâche citée, rubrique laissée telle quelle.` : '')))),
    h('label', { class: 'case-maj' }, cPre, h('span', {}, h('b', {}, `Prérequis (${nbPre})`),
      h('small', {}, 'Fiches de préparation : remplacés par les séances prérequises du séquençage (ce que vous y avez écrit est remplacé). Les fiches de déroulement reprennent toujours le séquençage.'))),
    retenus.length ? h('p', { class: 'avert-import' }, `⚠ ${retenus.length} rubrique(s) notée(s) ou liée(s) à un QCM ne sont pas supprimées mais retirées (récupérables) : ${retenus.join(' · ')}`) : null,
    h('p', { class: 'aide' }, 'Situation, modalités, ressources, phases de déroulement et bilans ne sont pas modifiés. Les contrats pas encore ouverts seront créés d’après le nouveau séquençage à leur ouverture.')),
  [{ texte: apresImport ? 'Plus tard' : 'Annuler', valeur: false }, { texte: '↻  Mettre à jour', classe: 'principal', valeur: true }], { large: true });
  if (!ok) return false;
  const attente = h('div', { class: 'toast' }, '⏳ Mise à jour des fiches…'); document.body.append(attente);
  let n = 0;
  try {
    for (const p of plan) {
      if (cContrats.checked) for (const c of p.contrats) { await c.faire(); n++; }
      if (cAct.checked && p.activites) { await p.activites.faire(); n++; }
      if (cPre.checked) for (const q of p.prerequis) { await q.faire(); n++; }
    }
    toast(`${n} fiche(s) mise(s) à jour`);
  } finally { attente.remove(); }
  return true;
}
