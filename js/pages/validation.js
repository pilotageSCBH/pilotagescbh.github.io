// Validation des compétences : élèves × compétences du référentiel, à partir des contrats d'évaluation SOMMATIVE
// de toutes les matières de la promotion. Si une compétence est évaluée plusieurs fois, la meilleure note est retenue
// (à égalité, la plus récente) ; la case indique le niveau, la date et la matière.
import { db } from '../api.js';
import { h, vider, imprimer } from '../ui.js';
import { moyenne, niveau, arrondi } from './contrat.js';
import { anneau, empileH, carteGraph } from '../graphiques.js';

const CODES_MAT = { Projet: 'PR', Analyse: 'AD', Orga: 'OR', Labo: 'LA', 'Étude': 'EA', Atelier: 'AT' };

export async function pageValidation(zone, _arg, ctx) {
  const ref = await ctx.referentiel();
  const eleves = (await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`)).filter((e) => !e.arret);
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}`);
  const contrats = sequences.length ? await db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : [];
  const criteres = contrats.length ? (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif) : [];
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  const codeMat = (m) => CODES_MAT[m.abreviation] || (m.abreviation || m.nom).slice(0, 2).toUpperCase();

  // meilleure évaluation par élève et par compétence
  const best = new Map();
  for (const c of contrats) {
    const sq = sequences.find((s) => s.id === c.sequence_id), m = ctx.matieres.find((x) => x.id === sq?.matiere_id);
    const groupes = new Map();
    for (const k of criteres.filter((x) => x.contrat_id === c.id)) groupes.set(k.groupe, (groupes.get(k.groupe) || []).concat(k));
    for (const [code, ks] of groupes) for (const e of eleves) {
      const n = moyenne(ks, notes, e.id);
      if (n === null) continue;
      const cle = `${e.id}:${code}`, b = best.get(cle);
      if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || ''))) best.set(cle, { n, date: c.date_eval, mat: m ? codeMat(m) : '' });
    }
  }
  const comps = ref.competences;
  const familles = [];
  for (const c of comps) { const f = familles[familles.length - 1]; if (f && f.code === c.famille) f.n++; else familles.push({ code: c.famille, lib: c.famille_libelle, n: 1 }); }
  // séparation cœur de métier (C1 à C4) / transversales (à partir de C5-1)
  const premiereTransCode = comps.find((c) => ctx.transversale(c.code))?.code;
  const premiereTrans = (famille) => comps.find((c) => c.famille === famille)?.code === premiereTransCode;
  const jj = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');

  vider(zone,
    h('header', { class: 'entete-page ecran' }, h('div', {}, h('h1', {}, 'Validation des compétences'),
      h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ${eleves.length} élèves  ·  ${contrats.length} contrat(s) sommatif(s)`)),
      h('div', { class: 'actions-page' }, h('button', { class: 'btn', onclick: () => imprimer('A3 landscape') }, '🖶  Imprimer (A3 paysage)'))),
    h('p', { class: 'aide ecran' }, 'Meilleure évaluation obtenue dans les contrats sommatifs de toutes les matières (à égalité, la plus récente). Dans chaque case : niveau, date et matière ('
      + ctx.matieres.map((m) => `${codeMat(m)} ${m.nom}`).join(' · ') + ').'),
    h('div', { class: 'tableau-validation' }, h('table', { class: 'validation' },
      h('thead', {},
        h('tr', { class: 'categories' }, h('th', { rowspan: 3, class: 'nom' }, 'Élève'),
          [false, true].map((tr) => { const n = comps.filter((c) => ctx.transversale(c.code) === tr).length;
            return n ? h('th', { colspan: n, class: 'categorie' + (tr ? ' transversale' : '') }, tr ? 'Compétences transversales (C5 · C6)' : 'Compétences cœur de métier (C1 à C4)') : null; }),
          ['A', 'EVA', 'NA'].map((t) => h('th', { rowspan: 3, class: 'total niv-' + t.toLowerCase() }, t))),
        h('tr', {}, familles.map((f) => h('th', { colspan: f.n, class: 'famille' + (premiereTrans(f.code) ? ' debut-trans' : ''), title: f.lib }, f.code))),
        h('tr', {}, comps.map((c) => h('th', { class: 'comp' + (c.code === premiereTransCode ? ' debut-trans' : ''), title: `${c.code} · ${c.libelle}` }, h('span', {}, c.code))))),
      h('tbody', {}, eleves.map((e) => {
        const cpt = { A: 0, EVA: 0, NA: 0 };
        const cells = comps.map((c) => {
          const b = best.get(`${e.id}:${c.code}`);
          const nv = niveau(b ? b.n : null);
          if (b) cpt[nv.code]++;
          return h('td', { class: 'niv-' + nv.code.toLowerCase() + (c.code === premiereTransCode ? ' debut-trans' : ''), title: b ? `${c.code} : ${nv.lib} (${arrondi(b.n)} / 5)` : `${c.code} : non évaluée` },
            h('b', {}, nv.code), b ? h('small', {}, jj(b.date)) : null, b ? h('small', {}, b.mat) : null);
        });
        return h('tr', {}, h('td', { class: 'nom' }, h('b', {}, e.nom), ' ', e.prenom), cells,
          h('td', { class: 'total' }, cpt.A), h('td', { class: 'total' }, cpt.EVA), h('td', { class: 'total' }, cpt.NA));
      })))),
    eleves.length ? null : h('p', { class: 'vide' }, 'Aucun élève dans cette promotion.'),
    eleves.length ? graphiques() : null);

  // niveaux : effectifs par élève et par famille de compétences
  function graphiques() {
    const SERIES = [{ nom: 'Acquis (A)', couleur: 'var(--g-a)' }, { nom: 'En voie (EVA)', couleur: 'var(--g-eva)' }, { nom: 'Non acquis (NA)', couleur: 'var(--g-na)' }, { nom: 'Non évaluée', couleur: 'var(--g-ne)' }];
    const compte = (es, cs) => {
      const r = [0, 0, 0, 0];
      for (const e of es) for (const c of cs) { const b = best.get(`${e.id}:${c.code}`); const k = b ? ['A', 'EVA', 'NA'].indexOf(niveau(b.n).code) : 3; r[k]++; }
      return r;
    };
    const parts = [['Compétences cœur de métier', 'C1 à C4', comps.filter((c) => !ctx.transversale(c.code))],
      ['Compétences transversales', 'C5 et C6', comps.filter((c) => ctx.transversale(c.code))]];
    return h('section', { class: 'graphiques ecran-et-impression' },
      parts.map(([titre, codes, cs]) => { const t = compte(eleves, cs);
        return carteGraph(titre, `${codes} · bilan de la promotion (${cs.length} compétences × ${eleves.length} élèves)`, anneau(SERIES.map((x, i) => ({ ...x, valeur: t[i] })),
          { centre: `${Math.round((t[0] / Math.max(1, t.reduce((a, b) => a + b, 0))) * 100)} %`, sous: 'acquises' })); }),
      parts.map(([titre, codes, cs]) => carteGraph(`${titre} · par famille`, `${codes} · répartition des niveaux (tous élèves)`,
        empileH([...new Set(cs.map((c) => c.famille))].map((f) => ({ label: f, valeurs: compte(eleves, cs.filter((c) => c.famille === f)) })), SERIES, { pourcent: true }))),
      parts.map(([titre, codes, cs]) => carteGraph(`${titre} · par élève`, `${codes} · nombre de compétences à chaque niveau`,
        empileH(eleves.map((e) => ({ label: `${e.nom} ${e.prenom}`, valeurs: compte([e], cs) })), SERIES))));
  }
}
