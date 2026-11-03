// Validation des compétences : élèves × compétences du référentiel, à partir des contrats d'évaluation SOMMATIVE
// de toutes les matières de la promotion. Si une compétence est évaluée plusieurs fois, la meilleure note est retenue
// (à égalité, la plus récente) ; la case indique le niveau, la date et la matière.
import { db } from '../api.js';
import { h, vider, imprimer } from '../ui.js';
import { moyenne, niveau, arrondi } from './contrat.js';
import { acquisAnterieurs, fusionnerAcquis, badgeRedoublant } from '../redoublants.js';

const CODES_MAT = { Projet: 'PR', Analyse: 'AD', Orga: 'OR', Labo: 'LA', 'Étude': 'EA', Atelier: 'AT' };

export async function pageValidation(zone, _arg, ctx) {
  const ref = await ctx.referentiel();
  const eleves = (await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`)).filter((e) => !e.arret);
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}`);
  const contrats = [...(sequences.length ? await db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : []),
    ...(await db.lire('contrats', `type=eq.sommatif&promotion_id=eq.${ctx.promo.id}&order=id`).catch(() => []))];   // + contrats hors séquence
  const criteres = contrats.length ? (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif) : [];
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  const codeMat = (m) => CODES_MAT[m.abreviation] || (m.abreviation || m.nom).slice(0, 2).toUpperCase();

  // meilleure évaluation par élève et par compétence
  const best = new Map();
  for (const c of contrats) {
    const sq = sequences.find((s) => s.id === c.sequence_id), m = ctx.matieres.find((x) => x.id === (sq?.matiere_id ?? c.matiere_id));
    const groupes = new Map();
    for (const k of criteres.filter((x) => x.contrat_id === c.id)) groupes.set(k.groupe, (groupes.get(k.groupe) || []).concat(k));
    for (const [code, ks] of groupes) for (const e of eleves) {
      const n = moyenne(ks, notes, e.id);
      if (n === null) continue;
      const cle = `${e.id}:${code}`, b = best.get(cle);
      if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || ''))) best.set(cle, { n, date: c.date_eval, mat: m ? codeMat(m) : '' });
    }
  }
  // redoublants : compétences validées dans leur promotion d'origine (si meilleures)
  const anterieurs = await acquisAnterieurs(ctx, eleves);
  for (const [eid, m] of anterieurs) {
    const b = new Map([...best].filter(([k]) => k.startsWith(eid + ':')).map(([k, v]) => [k.split(':')[1], v]));
    for (const [code, v] of fusionnerAcquis(b, m)) best.set(`${eid}:${code}`, v);
  }
  const nbRed = eleves.filter((e) => e.redoublant).length;
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
      + ctx.matieres.map((m) => `${codeMat(m)} ${m.nom}`).join(' · ') + ').'
      + (nbRed ? ' Élèves redoublants (R) : les compétences validées dans leur promotion d’origine sont reprises si elles sont meilleures (case hachurée, mention « N-1 »).' : '')),
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
          return h('td', { class: 'niv-' + nv.code.toLowerCase() + (c.code === premiereTransCode ? ' debut-trans' : '') + (b?.anterieur ? ' anterieur' : ''),
            title: b ? `${c.code} : ${nv.lib} (${arrondi(b.n)} / 5)${b.anterieur ? ` · obtenu dans la promotion ${b.promo}` : ''}` : `${c.code} : non évaluée` },
            h('b', {}, nv.code), b ? h('small', {}, jj(b.date)) : null, b ? h('small', {}, b.anterieur ? 'N-1' : b.mat) : null);
        });
        return h('tr', {}, h('td', { class: 'nom' }, h('b', {}, e.nom), ' ', e.prenom, ' ', badgeRedoublant(e, ctx)), cells,
          h('td', { class: 'total' }, cpt.A), h('td', { class: 'total' }, cpt.EVA), h('td', { class: 'total' }, cpt.NA));
      })))),
    eleves.length ? null : h('p', { class: 'vide' }, 'Aucun élève dans cette promotion.'),
    eleves.length ? graphiques() : null);

  // graphiques : seules les compétences réellement évaluées comptent dans les répartitions (les non évaluées sont à part)
  function graphiques() {
    const NIV = [['A', 'Acquis', 'a'], ['EVA', 'En voie', 'eva'], ['NA', 'Non acquis', 'na']];
    const compte = (es, cs) => {
      const r = { A: 0, EVA: 0, NA: 0, NE: 0 };
      for (const e of es) for (const c of cs) { const b = best.get(`${e.id}:${c.code}`); r[b ? niveau(b.n).code : 'NE']++; }
      return r;
    };
    // barre 100 % A / EVA / NA avec les pourcentages écrits dans la barre
    const barre = (r, titre = '') => {
      const t = r.A + r.EVA + r.NA;
      if (!t) return h('div', { class: 'barre-niv vide' }, 'non évaluée');
      return h('div', { class: 'barre-niv', title: titre || `A ${r.A} · EVA ${r.EVA} · NA ${r.NA}` }, NIV.map(([k, lib, cl]) => {
        const p = Math.round((r[k] / t) * 100);
        return r[k] ? h('span', { class: 'seg seg-' + cl, style: { flex: r[k] }, title: `${lib} : ${r[k]} (${p} %)` }, p >= 8 ? `${p} %` : '') : null;
      }));
    };
    const pcA = (r) => { const t = r.A + r.EVA + r.NA; return t ? Math.round((r.A / t) * 100) : null; };
    const parts = [['Cœur de métier', 'C1 à C4', comps.filter((c) => !ctx.transversale(c.code)), ''], ['Transversales', 'C5 et C6', comps.filter((c) => ctx.transversale(c.code)), 'trans']];
    const legendeNiv = h('div', { class: 'legende-barres' }, NIV.map(([k, lib, cl]) => h('span', {}, h('i', { class: 'seg-' + cl }), `${lib} (${k})`)), h('span', { class: 'gris' }, 'Les compétences non évaluées ne sont pas comptées dans les pourcentages.'));

    return h('section', { class: 'graphiques-val ecran-et-impression' },
      // 1. bilan de la promotion
      h('article', { class: 'carte-val large' }, h('h3', {}, 'Bilan de la promotion'),
        h('p', { class: 'sous' }, 'Pour chaque catégorie : combien de compétences ont déjà été évaluées, puis comment se répartissent les résultats obtenus.'),
        parts.map(([titre, codes, cs, cl]) => {
          const r = compte(eleves, cs), ev = cs.filter((c) => eleves.some((e) => best.has(`${e.id}:${c.code}`))).length;
          return h('div', { class: 'ligne-bilan ' + cl },
            h('div', { class: 'lib' }, h('b', {}, titre), h('small', {}, codes)),
            h('div', { class: 'avance' }, h('div', { class: 'jauge-ev' }, h('i', { style: { width: (cs.length ? (ev / cs.length) * 100 : 0) + '%' } })),
              h('small', {}, `${ev} / ${cs.length} compétences évaluées`)),
            h('div', { class: 'resultat' }, barre(r), h('small', {}, `${r.A + r.EVA + r.NA} résultat(s) · ${pcA(r) ?? 0} % acquis`)));
        }), legendeNiv),
      // 2. par famille
      h('article', { class: 'carte-val' }, h('h3', {}, 'Résultats par famille de compétences'),
        h('p', { class: 'sous' }, 'Répartition des niveaux obtenus par toute la classe dans chaque famille. Plus la barre est verte, mieux la famille est acquise.'),
        parts.map(([titre, , cs, cl]) => [h('div', { class: 'sous-titre-val ' + cl }, titre),
          [...new Set(cs.map((c) => c.famille))].map((f) => {
            const cf = cs.filter((c) => c.famille === f), r = compte(eleves, cf);
            return h('div', { class: 'ligne-barre' }, h('span', { class: 'lib', title: cf[0]?.famille_libelle || '' }, f), barre(r, `${f} · ${cf[0]?.famille_libelle || ''}`),
              h('span', { class: 'val' }, pcA(r) === null ? '—' : `${pcA(r)} %`));
          })])),
      // 3. par élève
      h('article', { class: 'carte-val' }, h('h3', {}, 'Résultats par élève'),
        h('p', { class: 'sous' }, 'Répartition des niveaux de chaque élève sur les compétences évaluées, du meilleur taux d’acquisition au plus faible. À droite : % de compétences acquises.'),
        eleves.map((e) => ({ e, r: compte([e], comps) })).sort((a, b) => (pcA(b.r) ?? -1) - (pcA(a.r) ?? -1)).map(({ e, r }) =>
          h('div', { class: 'ligne-barre' }, h('span', { class: 'lib eleve' }, h('b', {}, e.nom), ' ', e.prenom), barre(r, `${e.nom} ${e.prenom} · A ${r.A} · EVA ${r.EVA} · NA ${r.NA} · non évaluées ${r.NE}`),
            h('span', { class: 'val' }, pcA(r) === null ? '—' : `${pcA(r)} %`)))));
  }
}
