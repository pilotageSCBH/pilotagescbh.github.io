// Fiche élève et livret de compétences : pour un élève de la promotion, ses résultats (moyennes par matière comparées à la
// classe, détail et évolution des notes, appréciations) et son livret de compétences C1 à C6 (meilleur niveau obtenu
// dans les contrats sommatifs). Export PDF A4 portrait de l'élève, ou de toute la classe dans un .zip.
import { db } from '../api.js';
import { h, vider, toast, erreur, champ, dateFr } from '../ui.js';
import { moyenne, niveau, arrondi } from './contrat.js';
import { barresH, courbe, anneau, carteGraph } from '../graphiques.js';
import { telecharger, nomFichier } from '../echange.js';

const CLE_PER = 'pilotage-scbh-eleve-periode';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
const virgule = (n, d = 2) => (n === null || n === undefined ? '—' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
const moyenneDe = (liste) => { let s = 0, c = 0; for (const [n, k] of liste) if (n !== null && n !== undefined && k > 0) { s += n * k; c += k; } return c > 0 ? s / c : null; };
const NIV = { A: ['Acquis', 'niv-a'], EVA: ['En voie d’acquisition', 'niv-eva'], NA: ['Non acquis', 'niv-na'], NE: ['Non évaluée', 'niv-ne'] };

export async function pageEleve(zone, arg, ctx) {
  const P = ctx.promo, Y = P.annee_debut;
  const PERIODES = [['tout', 'Toute la formation', null, null],
    ['a1', `1re année (${Y}-${Y + 1})`, `${Y}-09-01`, `${Y + 1}-09-01`], ['a2', `2e année (${Y + 1}-${Y + 2})`, `${Y + 1}-09-01`, `${Y + 2}-09-01`],
    ['s1', 'Semestre 1', `${Y}-09-01`, `${Y + 1}-02-01`], ['s2', 'Semestre 2', `${Y + 1}-02-01`, `${Y + 1}-09-01`],
    ['s3', 'Semestre 3', `${Y + 1}-09-01`, `${Y + 2}-02-01`], ['s4', 'Semestre 4', `${Y + 2}-02-01`, `${Y + 2}-09-01`]];
  let periode = PERIODES.some((p) => p[0] === lire(CLE_PER, 'tout')) ? lire(CLE_PER, 'tout') : 'tout';
  const ref = await ctx.referentiel();

  // ------------------------------------------------------------------------------------- données de la promotion
  const [el, sq, ev, ns, ap] = await Promise.all([
    db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`), db.lire('sequences', `promotion_id=eq.${P.id}&order=matiere_id,numero`),
    db.lire('evaluations', `promotion_id=eq.${P.id}&order=date_eval.nullslast,id`), db.rpc('notes_sommatives', { p: P.id }).catch(() => []),
    db.lire('appreciations', 'order=eleve_id').catch(() => [])]);
  const eleves = el.filter((e) => !e.arret).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  if (!eleves.length) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, 'Fiche élève et livret')), h('p', { class: 'vide' }, 'Aucun élève dans cette promotion.')); return; }
  const sequences = new Map(sq.map((s) => [s.id, s]));
  const [contrats, res] = await Promise.all([
    sq.length ? db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sq.map((s) => s.id).join(',')})&order=id`) : [],
    ev.length ? db.lire('resultats', `evaluation_id=in.(${ev.map((v) => v.id).join(',')})&order=evaluation_id,eleve_id`) : []]);
  const criteres = contrats.length ? (await db.lire('criteres', `contrat_id=in.(${contrats.map((c) => c.id).join(',')})&order=id`)).filter((k) => k.actif) : [];
  const notesL = criteres.length ? await db.lire('notes', `critere_id=in.(${criteres.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
  const notes = new Map(notesL.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
  const resultats = new Map(res.map((r) => [`${r.evaluation_id}:${r.eleve_id}`, r.valeur]));
  const sommatives = new Map((ns || []).map((r) => [`${r.contrat_id}:${r.eleve_id}`, Number(r.note)]));
  const appreciations = new Map(ap.map((a) => [`${a.eleve_id}:${a.matiere_id}`, a.texte]));

  // toutes les évaluations notées sur 20 : contrats sommatifs et résultats intermédiaires
  const items = [
    ...contrats.map((c) => { const s = sequences.get(c.sequence_id); return s && { matiere: s.matiere_id, titre: `Contrat séquence ${s.numero}${s.intitule ? ' · ' + s.intitule : ''}`, date: c.date_eval, coef: Number(c.coef_resultat ?? 1), note: (e) => sommatives.get(`${c.id}:${e.id}`) ?? null }; }).filter(Boolean),
    ...ev.map((v) => { const b = Number(v.bareme) || 20; return { matiere: v.matiere_id, titre: v.libelle || 'Résultat', date: v.date_eval, coef: Number(v.coefficient), note: (e) => { const r = resultats.get(`${v.id}:${e.id}`); return /^[0-9.]+$/.test(r || '') ? Number(r) * 20 / b : null; } }; }),
  ];
  const dansPeriode = (d) => { const [, , a, b] = PERIODES.find((p) => p[0] === periode); return periode === 'tout' || (d && d >= a && d < b); };
  const itemsP = () => items.filter((i) => dansPeriode(i.date));
  const moyMat = (e, m) => moyenneDe(itemsP().filter((i) => i.matiere === m.id).map((i) => [i.note(e), i.coef]));
  const moyGen = (e) => moyenneDe(ctx.matieres.map((m) => [moyMat(e, m), Number(m.coefficient ?? 1)]));
  const moyClasse = (f) => { const v = eleves.map(f).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  // livret : meilleur niveau par compétence (à égalité, le plus récent)
  const meilleur = (e) => {
    const best = new Map();
    for (const c of contrats) {
      const s = sequences.get(c.sequence_id), mat = ctx.matieres.find((x) => x.id === s?.matiere_id);
      const groupes = new Map();
      for (const k of criteres.filter((x) => x.contrat_id === c.id)) groupes.set(k.groupe, (groupes.get(k.groupe) || []).concat(k));
      for (const [code, ks] of groupes) {
        const n = moyenne(ks, notes, e.id);
        if (n === null) continue;
        const b = best.get(code);
        if (!b || n > b.n || (n === b.n && (c.date_eval || '') > (b.date || ''))) best.set(code, { n, date: c.date_eval, mat: mat ? ctx.codeMat(mat) : '', matNom: mat?.nom || '' });
      }
    }
    return best;
  };
  const niveauDe = (best, code) => { const b = best.get(code); return b ? niveau(b.n).code : 'NE'; };
  const categories = [['Compétences cœur de métier', 'C1 à C4', ref.competences.filter((c) => !ctx.transversale(c.code))],
    ['Compétences transversales', 'C5 et C6', ref.competences.filter((c) => ctx.transversale(c.code))]];

  let idx = Math.max(0, eleves.findIndex((e) => String(e.id) === String(arg)));
  const peutEcrireMat = (mid) => (mid === 0 ? ctx.peutEcrire() : ctx.peutMatiere(mid));

  // ------------------------------------------------------------------------------------- affichage
  function dessiner() {
    const e = eleves[idx], best = meilleur(e), per = PERIODES.find((p) => p[0] === periode);
    const mg = moyGen(e), mc = moyClasse(moyGen);
    const lignesMat = ctx.matieres.map((m) => ({ m, el: moyMat(e, m), cl: moyClasse((x) => moyMat(x, m)), n: itemsP().filter((i) => i.matiere === m.id && i.note(e) !== null).length }));
    const detail = itemsP().filter((i) => i.note(e) !== null).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const appr = (mid) => {
      const v = appreciations.get(`${e.id}:${mid}`) || '';
      return champ(v, async (t) => { await db.enregistrer('appreciations', [{ eleve_id: e.id, matiere_id: mid, texte: t }], 'eleve_id,matiere_id'); appreciations.set(`${e.id}:${mid}`, t); },
        { multi: true, lecture: !peutEcrireMat(mid), placeholder: peutEcrireMat(mid) ? 'Appréciation…' : '' });
    };
    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Fiche élève et livret de compétences'), h('p', { class: 'sous-titre' }, `Promotion ${P.libelle}  ·  ${eleves.length} élève(s)  ·  ${per[1]}`)),
        h('div', { class: 'actions-page' },
          h('button', { class: 'btn', title: 'Élève précédent', onclick: () => { idx = (idx - 1 + eleves.length) % eleves.length; location.hash = '#/eleve/' + eleves[idx].id; } }, '◀'),
          h('select', { class: 'champ choix-mat', onchange: (ev2) => { location.hash = '#/eleve/' + ev2.target.value; } },
            eleves.map((x) => h('option', { value: x.id, selected: x.id === e.id }, `${x.nom} ${x.prenom}`))),
          h('button', { class: 'btn', title: 'Élève suivant', onclick: () => { idx = (idx + 1) % eleves.length; location.hash = '#/eleve/' + eleves[idx].id; } }, '▶'),
          h('select', { class: 'champ choix-mat', onchange: (ev2) => { periode = ev2.target.value; ecrire(CLE_PER, periode); dessiner(); } },
            PERIODES.map(([k, t]) => h('option', { value: k, selected: k === periode }, t))),
          h('button', { class: 'btn principal', onclick: () => exporter([e]) }, '⬇  PDF de l’élève'),
          h('button', { class: 'btn', onclick: () => exporter(eleves) }, '⬇  Toute la classe (.zip)'))),
      // identité
      h('section', { class: 'profil-carte eleve' },
        h('span', { class: 'avatar grand' }, (e.prenom[0] || '') + (e.nom[0] || '')),
        h('div', { class: 'profil-infos' }, h('h2', {}, `${e.nom} ${e.prenom}`),
          h('div', { class: 'profil-badges' }, h('span', { class: 'badge ' + (e.statut === 'Apprenti' ? 'apprenti' : 'scolaire') }, e.statut),
            e.entreprise ? h('span', { class: 'role-pill' }, '🏭  ' + e.entreprise) : null, e.naissance ? h('span', { class: 'role-pill' }, 'né(e) le ' + dateFr(e.naissance)) : null),
          e.etudes ? h('p', { class: 'gris' }, `Parcours : ${e.etudes}${e.etablissement ? ' · ' + e.etablissement : ''}`) : null),
        h('div', { class: 'moy-eleve auto' }, h('span', {}, 'Moyenne générale'), h('strong', { class: mg !== null && mg < 10 ? 'faible' : '' }, virgule(mg)),
          h('small', {}, `classe : ${virgule(mc)}`))),
      // résultats par matière
      h('section', { class: 'bloc' }, h('h2', {}, '📈  Résultats par matière'),
        h('table', { class: 'liste resultats-eleve' },
          h('thead', {}, h('tr', {}, ['Matière', 'Moyenne', 'Classe', 'Écart', 'Évaluations', 'Appréciation'].map((t) => h('th', {}, t)))),
          h('tbody', {}, lignesMat.map((l) => h('tr', {},
            h('td', {}, h('span', { class: 'pastille', style: { background: l.m.couleur } }), ' ', h('b', {}, l.m.nom)),
            h('td', { class: 'centre auto ' + (l.el !== null && l.el < 10 ? 'faible' : '') }, h('b', {}, virgule(l.el))),
            h('td', { class: 'centre auto' }, virgule(l.cl)),
            h('td', { class: 'centre auto ' + (l.el !== null && l.cl !== null ? (l.el >= l.cl ? 'st-ok' : 'st-non') : '') }, l.el !== null && l.cl !== null ? (l.el >= l.cl ? '+' : '') + virgule(l.el - l.cl) : '—'),
            h('td', { class: 'centre auto' }, l.n),
            h('td', { class: 'appr' }, appr(l.m.id)))))),
        h('div', { class: 'appr-generale' }, h('b', {}, 'Appréciation générale'), appr(0))),
      // graphiques
      h('section', { class: 'graphiques' },
        carteGraph('Moyennes par matière', 'élève (barre) · moyenne de la classe au survol', barresH(lignesMat.map((l) => ({ label: l.m.nom, valeur: l.el, couleur: l.m.couleur,
          info: `${l.m.nom} : ${virgule(l.el)} (classe ${virgule(l.cl)})` })), { max: 20, format: (v) => virgule(v) })),
        carteGraph('Évolution des notes', 'toutes matières, sur 20, dans l’ordre des dates', courbe(detail.map((i) => ({ label: i.date ? dateFr(i.date).slice(0, 5) : '—', valeur: i.note(e),
          info: `${ctx.matieres.find((m) => m.id === i.matiere)?.nom} · ${i.titre} : ${virgule(i.note(e))}` })), { min: 0, max: 20, reference: { valeur: 10, nom: '10 / 20' }, format: (v) => virgule(v) })),
        categories.map(([t, codes, cs]) => {
          const n = { A: 0, EVA: 0, NA: 0, NE: 0 }; cs.forEach((c) => n[niveauDe(best, c.code)]++);
          return carteGraph(t, `${codes} · ${cs.length} compétences`, anneau([['A', 'var(--g-a)'], ['EVA', 'var(--g-eva)'], ['NA', 'var(--g-na)'], ['NE', 'var(--g-ne)']]
            .map(([k, c]) => ({ nom: NIV[k][0], valeur: n[k], couleur: c })), { centre: `${Math.round((n.A / Math.max(1, cs.length)) * 100)} %`, sous: 'acquises' }));
        })),
      // détail des évaluations
      h('section', { class: 'bloc' }, h('h2', {}, '📝  Détail des évaluations'),
        detail.length ? h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Date', 'Matière', 'Évaluation', 'Coef.', 'Note / 20', 'Classe'].map((t) => h('th', {}, t)))),
          h('tbody', {}, detail.map((i) => { const m = ctx.matieres.find((x) => x.id === i.matiere), n = i.note(e), c = moyClasse((x) => i.note(x));
            return h('tr', {}, h('td', {}, i.date ? dateFr(i.date) : 'sans date'), h('td', {}, h('span', { class: 'pastille', style: { background: m?.couleur } }), ' ', m?.nom),
              h('td', {}, i.titre), h('td', { class: 'centre' }, virgule(i.coef)), h('td', { class: 'centre auto ' + (n < 10 ? 'faible' : '') }, h('b', {}, virgule(n))), h('td', { class: 'centre auto' }, virgule(c))); })))
          : h('p', { class: 'vide' }, 'Aucune note pour cette période.')),
      // livret de compétences
      h('section', { class: 'bloc livret' }, h('h2', {}, '🎓  Livret de compétences'),
        h('p', { class: 'aide' }, 'Meilleur niveau obtenu dans les contrats sommatifs de toutes les matières (toute la formation), avec la date et la matière de l’évaluation.'),
        categories.map(([t, codes, cs]) => h('div', { class: 'categorie-livret' + (codes.startsWith('C5') ? ' transversale' : '') },
          h('h3', {}, `${t} (${codes})`),
          [...new Set(cs.map((c) => c.famille))].map((f) => h('div', { class: 'famille-livret' },
            h('div', { class: 'titre-famille' }, h('b', {}, f), ' ', cs.find((c) => c.famille === f)?.famille_libelle || ''),
            cs.filter((c) => c.famille === f).map((c) => { const b = best.get(c.code), nv = niveauDe(best, c.code);
              return h('div', { class: 'ligne-livret' }, h('span', { class: 'code' }, c.code), h('span', { class: 'lib' }, c.libelle),
                h('span', { class: 'niv ' + NIV[nv][1] }, nv), h('span', { class: 'quand gris' }, b ? `${b.date ? dateFr(b.date) : ''} · ${b.mat}` : '')); })))))));
    zone.querySelectorAll('textarea.champ').forEach((t) => { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 30) + 'px'; });
  }

  // ------------------------------------------------------------------------------------- PDF
  function modele(e) {
    const best = meilleur(e), per = PERIODES.find((p) => p[0] === periode);
    const lignesMat = ctx.matieres.map((m) => [m.nom, virgule(moyMat(e, m)), virgule(moyClasse((x) => moyMat(x, m))), String(itemsP().filter((i) => i.matiere === m.id && i.note(e) !== null).length), appreciations.get(`${e.id}:${m.id}`) || '']);
    const detail = itemsP().filter((i) => i.note(e) !== null).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const blocs = [
      { t: 'titre', texte: 'FICHE DE SUIVI ET LIVRET DE COMPÉTENCES', sous: `${e.nom} ${e.prenom} · Promotion ${P.libelle}`, couleur: '#146B63' },
      { t: 'infos', paires: [['Statut', e.statut], ['Né(e) le', e.naissance ? dateFr(e.naissance) : ''], ['Entreprise', e.entreprise], ['Parcours', [e.etudes, e.etablissement].filter(Boolean).join(' · ')],
        ['Période', per[1]], ['Moyenne générale', `${virgule(moyGen(e))}  (classe : ${virgule(moyClasse(moyGen))})`]] },
      { t: 'table', titre: 'Résultats par matière', colonnes: [{ titre: 'Matière', part: 20, gras: true }, { titre: 'Moyenne', part: 10, centre: true, gras: true },
        { titre: 'Classe', part: 9, centre: true }, { titre: 'Évals', part: 7, centre: true }, { titre: 'Appréciation', part: 54 }], lignes: lignesMat },
      { t: 'rubrique', titre: 'Appréciation générale', texte: appreciations.get(`${e.id}:0`) || '' },
      detail.length ? { t: 'table', titre: 'Détail des évaluations', colonnes: [{ titre: 'Date', part: 11 }, { titre: 'Matière', part: 17 }, { titre: 'Évaluation', part: 44 },
        { titre: 'Coef.', part: 7, centre: true }, { titre: 'Note / 20', part: 11, centre: true, gras: true }, { titre: 'Classe', part: 10, centre: true }],
      lignes: detail.map((i) => [i.date ? dateFr(i.date) : 'sans date', ctx.matieres.find((m) => m.id === i.matiere)?.nom, i.titre, virgule(i.coef), virgule(i.note(e)), virgule(moyClasse((x) => i.note(x)))]) } : null,
      ...categories.map(([t, codes, cs]) => {
        const n = { A: 0, EVA: 0, NA: 0, NE: 0 }; cs.forEach((c) => n[niveauDe(best, c.code)]++);
        const lignes = [];
        for (const f of [...new Set(cs.map((c) => c.famille))]) {
          lignes.push({ groupe: `${f} · ${cs.find((c) => c.famille === f)?.famille_libelle || ''}` });
          cs.filter((c) => c.famille === f).forEach((c) => { const b = best.get(c.code), nv = niveauDe(best, c.code);
            lignes.push({ fond: { A: '#CDE9BF', EVA: '#FBDDB0', NA: '#F6C9C3', NE: '#FFFFFF' }[nv], cellules: [`${c.code}  ${c.libelle}`, nv, b?.date ? dateFr(b.date) : '', b?.matNom || ''] }); });
        }
        return { t: 'table', titre: `Livret · ${t} (${codes}) — A : ${n.A} · EVA : ${n.EVA} · NA : ${n.NA} · non évaluées : ${n.NE}`,
          colonnes: [{ titre: 'Compétence', part: 62 }, { titre: 'Niveau', part: 9, centre: true, gras: true }, { titre: 'Date', part: 12, centre: true }, { titre: 'Matière', part: 17 }], lignes };
      }),
      { t: 'note', texte: 'Niveau : A acquis (4 à 5 / 5) · EVA en voie d’acquisition (2 à moins de 4) · NA non acquis (moins de 2) · NE non évaluée. Meilleur niveau obtenu dans les contrats sommatifs.' },
    ].filter(Boolean);
    return { fichier: nomFichier(`Fiche_${e.nom}_${e.prenom}.pdf`), titre: `Fiche de suivi · ${e.nom} ${e.prenom}`, pied: `${e.nom} ${e.prenom} · Promotion ${P.libelle} · ${per[1]}`, blocs };
  }
  async function exporter(liste) {
    try {
      toast(liste.length > 1 ? `Préparation de ${liste.length} fiches…` : 'Préparation du PDF…');
      const { chargerOutils, creerPDF, zipDePDF } = await import('../pdf.js');
      await chargerOutils();
      const logo = await fetch('img/logo.jpg').then((r) => r.arrayBuffer()).catch(() => null);
      if (liste.length === 1) { const d = modele(liste[0]); telecharger(d.fichier, new Blob([await creerPDF(d, logo)], { type: 'application/pdf' })); }
      else telecharger(nomFichier(`Fiches_eleves_${P.libelle}.zip`), await zipDePDF(liste.map(modele), logo));
      toast('Téléchargé');
    } catch (x) { erreur(x); }
  }

  dessiner();
}
