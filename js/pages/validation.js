// Validation des compétences : élèves × compétences du référentiel, à partir des contrats d'évaluation SOMMATIVE
// de toutes les matières de la promotion. Si une compétence est évaluée plusieurs fois, la meilleure note est retenue
// (à égalité, la plus récente) ; la case indique le niveau, la date et la matière.
import { db } from '../api.js';
import { h, vider, imprimer } from '../ui.js';
import { moyenne, niveau, arrondi } from './contrat.js';
import { empileH, carteGraph } from '../graphiques.js';

const CLE_CAT = 'pilotage-scbh-validation-categorie', CLE_TOUT = 'pilotage-scbh-validation-toutes';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
const SERIES = [{ nom: 'Acquis (A)', couleur: 'var(--g-a)' }, { nom: 'En voie d’acquisition (EVA)', couleur: 'var(--g-eva)' }, { nom: 'Non acquis (NA)', couleur: 'var(--g-na)' }];

export async function pageValidation(zone, _arg, ctx) {
  const ref = await ctx.referentiel();
  const eleves = (await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`)).filter((e) => !e.arret);
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}`);
  const contrats = sequences.length ? await db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sequences.map((s) => s.id).join(',')})`) : [];
  const criteres = contrats.length ? (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif) : [];
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));

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
      if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || ''))) best.set(cle, { n, date: c.date_eval, mat: m ? ctx.codeMat(m) : '', matNom: m?.nom || '' });
    }
  }
  const nv = (e, c) => { const b = best.get(`${e.id}:${c.code}`); return b ? niveau(b.n).code : 'NE'; };
  const evaluee = (c) => eleves.some((e) => best.has(`${e.id}:${c.code}`));
  const jj = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');

  let categorie = ['coeur', 'trans', 'toutes'].includes(lire(CLE_CAT, 'toutes')) ? lire(CLE_CAT, 'toutes') : 'toutes';
  let toutes = lire(CLE_TOUT, 'non') === 'oui';

  function dessiner() {
    const dansCat = ref.competences.filter((c) => categorie === 'toutes' || (categorie === 'trans') === ctx.transversale(c.code));
    const comps = toutes ? dansCat : dansCat.filter(evaluee);
    const nbEval = dansCat.filter(evaluee).length;
    // compteurs (cases élève × compétence évaluées)
    const cpt = { A: 0, EVA: 0, NA: 0 };
    for (const e of eleves) for (const c of dansCat) { const k = nv(e, c); if (k !== 'NE') cpt[k]++; }
    const totEval = cpt.A + cpt.EVA + cpt.NA, pc = (n, d) => (d ? Math.round((n / d) * 100) : 0);
    const familles = [];
    for (const c of comps) { const f = familles[familles.length - 1]; if (f && f.code === c.famille) f.n++; else familles.push({ code: c.famille, lib: c.famille_libelle, n: 1, trans: ctx.transversale(c.code) }); }
    const premiereTrans = comps.find((c) => ctx.transversale(c.code))?.code;
    const bouton = (v, t) => h('button', { class: 'btn' + (categorie === v ? ' principal' : ''), onclick: () => { categorie = v; ecrire(CLE_CAT, v); dessiner(); } }, t);

    vider(zone,
      h('header', { class: 'entete-page ecran' }, h('div', {}, h('h1', {}, 'Validation des compétences'),
        h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ${eleves.length} élèves  ·  ${contrats.length} fiche(s) contrat(s) sommatif(s)`)),
        h('div', { class: 'actions-page' }, h('button', { class: 'btn', onclick: () => imprimer('A3 landscape') }, '🖶  Imprimer (A3 paysage)'))),

      // ---------------------------------------------------------------- chiffres clés
      h('section', { class: 'kpi-ligne kpi-validation' },
        tuile('🧩', `${nbEval} / ${dansCat.length}`, 'compétences déjà évaluées', 'au moins une fois, pour au moins un élève', pc(nbEval, dansCat.length)),
        tuile('✅', `${pc(cpt.A, totEval)} %`, 'des évaluations sont « Acquis »', `${cpt.A} sur ${totEval} résultat(s)`, pc(cpt.A, totEval), 'vert'),
        tuile('🟠', `${pc(cpt.EVA, totEval)} %`, 'en voie d’acquisition', `${cpt.EVA} résultat(s)`, pc(cpt.EVA, totEval), 'orange'),
        tuile('🔴', `${pc(cpt.NA, totEval)} %`, 'non acquis', `${cpt.NA} résultat(s)`, pc(cpt.NA, totEval), 'rouge')),

      // ---------------------------------------------------------------- filtres
      h('div', { class: 'filtres-validation ecran' },
        h('div', { class: 'bascule' }, bouton('toutes', 'Toutes les compétences'), bouton('coeur', 'Cœur de métier (C1 à C4)'), bouton('trans', 'Transversales (C5 · C6)')),
        h('label', { class: 'interrupteur' }, h('input', { type: 'checkbox', checked: toutes, onchange: (e) => { toutes = e.target.checked; ecrire(CLE_TOUT, toutes ? 'oui' : 'non'); dessiner(); } }),
          'Afficher aussi les compétences jamais évaluées'),
        h('div', { class: 'legende-niv' }, ['A', 'EVA', 'NA'].map((k) => h('span', { class: 'niv-' + k.toLowerCase() }, k)), h('span', { class: 'gris' }, 'case vide = non évaluée'))),
      h('p', { class: 'aide ecran' }, 'Chaque case reprend la meilleure évaluation obtenue dans les fiches contrats sommatifs de toutes les matières (à égalité, la plus récente), avec sa date et la matière ('
        + ctx.matieres.map((m) => `${ctx.codeMat(m)} ${m.nom}`).join(' · ') + '). Survolez une case ou un code pour le détail.'),

      // ---------------------------------------------------------------- tableau
      comps.length ? h('div', { class: 'tableau-validation' }, h('table', { class: 'validation v2' },
        h('thead', {},
          h('tr', { class: 'familles' }, h('th', { rowspan: 2, class: 'nom' }, 'Élève'),
            familles.map((f) => h('th', { colspan: f.n, class: 'famille' + (f.trans ? ' trans' : '') + (comps.find((c) => c.famille === f.code)?.code === premiereTrans ? ' debut-trans' : ''), title: `${f.code} · ${f.lib}` }, f.code)),
            h('th', { rowspan: 2, class: 'total niv-a', title: 'Compétences acquises' }, 'A'), h('th', { rowspan: 2, class: 'total niv-eva', title: 'En voie d’acquisition' }, 'EVA'),
            h('th', { rowspan: 2, class: 'total niv-na', title: 'Non acquises' }, 'NA'), h('th', { rowspan: 2, class: 'total pc', title: 'Part des compétences évaluées qui sont acquises' }, '% A')),
          h('tr', {}, comps.map((c) => h('th', { class: 'comp' + (ctx.transversale(c.code) ? ' trans' : '') + (c.code === premiereTrans ? ' debut-trans' : ''), title: `${c.code} · ${c.libelle}` },
            h('span', {}, c.code.replace(/^C\d-\d/, '').trim() || c.code))))),
        h('tbody', {}, eleves.map((e) => {
          const t = { A: 0, EVA: 0, NA: 0 };
          const cells = comps.map((c) => {
            const b = best.get(`${e.id}:${c.code}`), k = nv(e, c);
            if (b) t[k]++;
            return h('td', { class: (b ? 'niv-' + k.toLowerCase() : 'vide') + (c.code === premiereTrans ? ' debut-trans' : ''),
              title: b ? `${e.nom} ${e.prenom} · ${c.code} : ${niveau(b.n).lib} (${arrondi(b.n)} / 5) · ${b.matNom} · ${jj(b.date)}` : `${e.nom} ${e.prenom} · ${c.code} : non évaluée` },
            b ? [h('b', {}, k), h('small', {}, `${jj(b.date)} ${b.mat}`)] : null);
          });
          const n = t.A + t.EVA + t.NA;
          return h('tr', {}, h('td', { class: 'nom' }, h('b', {}, e.nom), ' ', e.prenom), cells,
            h('td', { class: 'total' }, t.A), h('td', { class: 'total' }, t.EVA), h('td', { class: 'total' }, t.NA),
            h('td', { class: 'total pc' }, n ? `${pc(t.A, n)} %` : '—'));
        }))))
        : h('section', { class: 'bloc vide-validation' }, h('p', {}, 'Aucune compétence évaluée pour l’instant dans cette catégorie.'),
          h('p', { class: 'aide' }, 'Les niveaux apparaissent dès que des notes sont saisies dans les fiches contrats sommatifs. Cochez « Afficher aussi les compétences jamais évaluées » pour voir tout le référentiel.')),

      // ---------------------------------------------------------------- graphiques
      totEval ? h('section', { class: 'graphiques graphiques-validation ecran-et-impression' },
        carteGraph('Résultats par famille de compétences', 'Pour chaque famille : répartition des niveaux obtenus (compétences non évaluées exclues). Plus la barre est verte, mieux la famille est acquise.',
          empileH(familles.filter((f) => comps.some((c) => c.famille === f.code && evaluee(c))).map((f) => {
            const cs = comps.filter((c) => c.famille === f.code); const v = [0, 0, 0];
            for (const e of eleves) for (const c of cs) { const k = nv(e, c); if (k !== 'NE') v[['A', 'EVA', 'NA'].indexOf(k)]++; }
            return { label: `${f.code}`, valeurs: v };
          }), SERIES, { pourcent: true, largeur: 520 }),
          h('p', { class: 'note-graph' }, 'Familles jamais évaluées non représentées.')),
        carteGraph('Résultats par élève', 'Nombre de compétences à chaque niveau pour chaque élève, du meilleur taux d’acquisition au plus faible.',
          empileH(eleves.map((e) => { const v = [0, 0, 0]; for (const c of dansCat) { const k = nv(e, c); if (k !== 'NE') v[['A', 'EVA', 'NA'].indexOf(k)]++; } return { label: `${e.nom} ${e.prenom}`, valeurs: v }; })
            .sort((a, b) => (b.valeurs[0] / Math.max(1, b.valeurs[0] + b.valeurs[1] + b.valeurs[2])) - (a.valeurs[0] / Math.max(1, a.valeurs[0] + a.valeurs[1] + a.valeurs[2]))), SERIES, { largeur: 520 })))
        : null);
  }

  function tuile(icone, valeur, libelle, detail, pourcent, teinte = '') {
    return h('div', { class: 'kpi ' + teinte },
      h('div', { class: 'kpi-tete' }, h('span', { class: 'kpi-icone' }, icone), h('span', { class: 'kpi-lib' }, libelle)),
      h('div', { class: 'kpi-valeur' }, valeur),
      h('div', { class: 'kpi-jauge' }, h('i', { style: { width: Math.min(100, pourcent) + '%' } })),
      h('div', { class: 'kpi-detail' }, detail));
  }

  dessiner();
}
