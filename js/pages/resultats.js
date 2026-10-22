// Résultats et moyennes : notes / 20 des contrats d'évaluation sommative (calculées automatiquement) et résultats
// intermédiaires saisis par matière (hors contrats), avec coefficients ; moyenne de chaque élève par matière,
// moyenne générale (coefficients des matières), moyenne de la classe, notes la plus basse et la plus haute.
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, imprimer, dateFr, nombre } from '../ui.js';
import { boutonAnnuler } from '../annuler.js';
import { barresH, colonnes as graphColonnes, courbe, carteGraph } from '../graphiques.js';

const CLE_MAT = 'pilotage-scbh-resultats-matiere', CLE_PER = 'pilotage-scbh-resultats-periode';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
const virgule = (n, d = 2) => (n === null || n === undefined ? '' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
const moyenneDe = (liste) => {                                    // liste de [note, coefficient] → moyenne pondérée
  let s = 0, c = 0;
  for (const [n, k] of liste) if (n !== null && n !== undefined && k > 0) { s += n * k; c += k; }
  return c > 0 ? s / c : null;
};

export async function pageResultats(zone, arg, ctx) {
  const P = ctx.promo, Y = P.annee_debut;
  const PERIODES = [
    ['tout', 'Toute la formation', null, null],
    ['a1', `1re année (${Y}-${Y + 1})`, `${Y}-09-01`, `${Y + 1}-09-01`], ['a2', `2e année (${Y + 1}-${Y + 2})`, `${Y + 1}-09-01`, `${Y + 2}-09-01`],
    ['s1', 'Semestre 1 (sept. → janv.)', `${Y}-09-01`, `${Y + 1}-02-01`], ['s2', 'Semestre 2 (févr. → juil.)', `${Y + 1}-02-01`, `${Y + 1}-09-01`],
    ['s3', 'Semestre 3 (sept. → janv.)', `${Y + 1}-09-01`, `${Y + 2}-02-01`], ['s4', 'Semestre 4 (févr. → juil.)', `${Y + 2}-02-01`, `${Y + 2}-09-01`],
  ];
  let filtre = arg && ctx.matieres.some((m) => String(m.id) === String(arg)) ? String(arg) : lire(CLE_MAT, 'toutes');
  if (filtre !== 'toutes' && !ctx.matieres.some((m) => String(m.id) === filtre)) filtre = 'toutes';
  let periode = PERIODES.some((p) => p[0] === lire(CLE_PER, 'tout')) ? lire(CLE_PER, 'tout') : 'tout';

  // ------------------------------------------------------------------------------------- données
  let eleves, sequences, contrats, evaluations, resultats, sommatives;
  async function charger() {
    const [el, sq, ev, ns] = await Promise.all([
      db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`), db.lire('sequences', `promotion_id=eq.${P.id}&order=matiere_id,numero`),
      db.lire('evaluations', `promotion_id=eq.${P.id}&order=date_eval.nullslast,id`), db.rpc('notes_sommatives', { p: P.id })]);
    eleves = el.filter((e) => !e.arret).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
    sequences = new Map(sq.map((s) => [s.id, s]));
    evaluations = ev;
    const [co, re] = await Promise.all([
      sq.length ? db.lire('contrats', `type=eq.sommatif&sequence_id=in.(${sq.map((s) => s.id).join(',')})&order=id`) : [],
      ev.length ? db.lire('resultats', `evaluation_id=in.(${ev.map((v) => v.id).join(',')})&order=evaluation_id,eleve_id`) : []]);
    contrats = co;
    resultats = new Map(re.map((r) => [`${r.evaluation_id}:${r.eleve_id}`, r.valeur]));
    sommatives = new Map((ns || []).map((r) => [`${r.contrat_id}:${r.eleve_id}`, Number(r.note)]));
  }

  // colonnes d'une matière : contrats sommatifs de ses séquences + résultats intermédiaires, par date
  function colonnes(m) {
    const [, , debut, fin] = PERIODES.find((p) => p[0] === periode);
    const dansPeriode = (d) => periode === 'tout' || (d && d >= debut && d < fin);
    const cols = [];
    for (const c of contrats) {
      const s = sequences.get(c.sequence_id);
      if (!s || s.matiere_id !== m.id || !dansPeriode(c.date_eval)) continue;
      cols.push({ type: 'contrat', id: c.id, objet: c, seq: s, titre: `Contrat séq. ${s.numero}`, sous: s.intitule || '', date: c.date_eval,
        coef: Number(c.coef_resultat), bareme: 20, note: (e) => sommatives.get(`${c.id}:${e.id}`) ?? null, brut: (e) => sommatives.get(`${c.id}:${e.id}`) ?? null });
    }
    for (const v of evaluations) {
      if (v.matiere_id !== m.id || !dansPeriode(v.date_eval)) continue;
      const bareme = Number(v.bareme) || 20;
      const brut = (e) => resultats.get(`${v.id}:${e.id}`) ?? '';
      cols.push({ type: 'eval', id: v.id, objet: v, titre: v.libelle || 'Résultat', sous: bareme !== 20 ? `noté sur ${virgule(bareme)}` : '', date: v.date_eval,
        coef: Number(v.coefficient), bareme, brut, note: (e) => { const b = brut(e); return /^[0-9.]+$/.test(b) ? Number(b) * 20 / bareme : null; } });
    }
    cols.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.type === b.type ? 0 : a.type === 'contrat' ? -1 : 1) || (a.seq?.numero || 0) - (b.seq?.numero || 0));
    return cols;
  }
  const moyenneMatiere = (m, e, cols = colonnes(m)) => moyenneDe(cols.map((c) => [c.note(e), c.coef]));
  const moyenneGenerale = (e) => moyenneDe(ctx.matieres.map((m) => [moyenneMatiere(m, e), Number(m.coefficient ?? 1)]));
  const sansDate = () => (contrats.filter((c) => !c.date_eval).length + evaluations.filter((v) => !v.date_eval).length);

  // ligne de statistiques (moyenne, plus basse, plus haute) d'une série de notes
  const stats = (notes) => {
    const n = notes.filter((x) => x !== null && x !== undefined);
    return { moy: n.length ? n.reduce((a, b) => a + b, 0) / n.length : null, min: n.length ? Math.min(...n) : null, max: n.length ? Math.max(...n) : null };
  };
  const classeNote = (n) => (n === null ? '' : n < 8 ? 'faible' : n < 10 ? 'moyen' : n >= 14 ? 'bon' : '');

  // ------------------------------------------------------------------------------------- dessin
  function dessiner() {
    const m = filtre === 'toutes' ? null : ctx.matieres.find((x) => String(x.id) === filtre);
    const modif = m ? ctx.peutMatiere(m.id) : ctx.estAdmin();
    const per = PERIODES.find((p) => p[0] === periode);
    const nbSansDate = sansDate();
    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, m ? h('span', { class: 'pastille', style: { background: m.couleur } }) : null, m ? `Résultats · ${m.nom}` : 'Résultats et moyennes'),
          h('p', { class: 'sous-titre' }, `Promotion ${P.libelle}  ·  ${per[1]}  ·  ${eleves.length} élève(s)  ·  notes sur 20`)),
        h('div', { class: 'actions-page' },
          m && modif ? boutonAnnuler(ctx, 'resultats') : null,
          h('select', { class: 'champ choix-mat', onchange: (e) => { periode = e.target.value; ecrire(CLE_PER, periode); dessiner(); } },
            PERIODES.map(([k, t]) => h('option', { value: k, selected: k === periode }, t))),
          h('select', { class: 'champ choix-mat', onchange: (e) => { filtre = e.target.value; ecrire(CLE_MAT, filtre); dessiner(); } },
            h('option', { value: 'toutes', selected: !m }, 'Toutes les matières (moyennes)'),
            ctx.matieres.map((x) => h('option', { value: x.id, selected: m && x.id === m.id }, x.nom))),
          h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer'),
          m && modif ? h('button', { class: 'btn principal', onclick: () => editerEvaluation(m, null) }, '＋  Résultat intermédiaire') : null)),
      periode !== 'tout' && nbSansDate ? h('p', { class: 'avertissement ecran' },
        `${nbSansDate} évaluation(s) sans date ne sont comptées que dans « Toute la formation » : renseignez la date dans le contrat ou le résultat.`) : null,
      eleves.length ? (m ? tableauMatiere(m, modif) : tableauSynthese()) : h('p', { class: 'vide' }, 'Aucun élève dans cette promotion.'),
      h('p', { class: 'aide ecran' }, m
        ? 'Contrats sommatifs : note / 20 calculée automatiquement (moyenne des niveaux des compétences × 4), à modifier dans « Fiches et contrats ». '
          + 'Résultats intermédiaires : saisir la note (virgule acceptée), « abs » pour une absence ou « ne » pour non évalué (non comptés dans la moyenne). Entrée : élève suivant.'
        : 'Moyenne générale = moyenne des matières pondérée par leurs coefficients' + (ctx.estAdmin() ? ' (modifiables par l’administrateur, ligne « Coefficient »)' : '') + '. Cliquer le nom d’une matière pour le détail.'));
  }

  function tableauSynthese() {
    const admin = ctx.estAdmin();
    const lignes = eleves.map((e) => ({ e, notes: ctx.matieres.map((m) => moyenneMatiere(m, e)), gen: moyenneGenerale(e) }));
    const st = (i) => stats(lignes.map((l) => (i === -1 ? l.gen : l.notes[i])));
    const piedLigne = (lib, k) => h('tr', { class: 'pied-res' }, h('th', {}, lib),
      ctx.matieres.map((_, i) => h('td', {}, virgule(st(i)[k]))), h('td', { class: 'gen' }, virgule(st(-1)[k])));
    const tableau = h('div', { class: 'tableau-defile' }, h('table', { class: 'resultats' },
      h('thead', {},
        h('tr', {}, h('th', { class: 'col-eleve' }, 'Élève'),
          ctx.matieres.map((m) => h('th', { class: 'col-res mat', style: { '--couleur': m.couleur } },
            h('a', { href: '#/resultats/' + m.id, onclick: () => { filtre = String(m.id); ecrire(CLE_MAT, filtre); } }, m.nom))),
          h('th', { class: 'col-res gen' }, 'Moyenne générale')),
        h('tr', { class: 'coefs' }, h('th', {}, 'Coefficient'),
          ctx.matieres.map((m) => h('td', {}, admin ? saisieCoef(Number(m.coefficient ?? 1), async (n) => { await db.modifier('matieres', m.id, { coefficient: n }); m.coefficient = n; dessiner(); })
            : virgule(Number(m.coefficient ?? 1)))),
          h('td', {}))),
      h('tbody', {}, lignes.map((l) => h('tr', {}, h('th', { class: 'col-eleve' }, h('b', {}, l.e.nom), ' ', l.e.prenom),
        l.notes.map((n) => h('td', { class: 'note-res ' + classeNote(n) }, virgule(n))),
        h('td', { class: 'note-res gen ' + classeNote(l.gen) }, virgule(l.gen))))),
      h('tfoot', {}, piedLigne('Moyenne de la classe', 'moy'), piedLigne('Note la plus basse', 'min'), piedLigne('Note la plus haute', 'max'))));
    const gens = lignes.map((l) => l.gen);
    return h('div', {}, tableau, h('section', { class: 'graphiques' },
      carteGraph('Moyenne de la classe par matière', 'sur 20', barresH(ctx.matieres.map((m, i) => ({ label: m.nom, valeur: st(i).moy, couleur: m.couleur,
        info: `${m.nom} : moyenne ${virgule(st(i).moy)} · de ${virgule(st(i).min)} à ${virgule(st(i).max)}` })), { max: 20, format: (v) => virgule(v) })),
      carteGraph('Répartition des moyennes générales', 'nombre d’élèves par tranche de notes', histogramme(gens)),
      carteGraph('Moyenne générale par élève', 'sur 20, de la plus haute à la plus basse', barresH(lignes.filter((l) => l.gen !== null)
        .sort((a, b) => b.gen - a.gen).map((l) => ({ label: `${l.e.nom} ${l.e.prenom}`, valeur: l.gen, couleur: l.gen < 10 ? 'var(--g-na)' : 'var(--g1)' })), { max: 20, format: (v) => virgule(v) }))));
  }

  // nombre d'élèves par tranche de notes (sur 20)
  function histogramme(notes) {
    const T = [[0, 4], [4, 8], [8, 10], [10, 12], [12, 14], [14, 16], [16, 20.01]];
    return graphColonnes(T.map(([a, b]) => {
      const n = notes.filter((x) => x !== null && x >= a && x < b).length;
      return { label: `${a}–${Math.floor(b)}`, valeur: n, couleur: b <= 10 ? 'var(--g-na)' : 'var(--g1)', info: `${n} élève(s) entre ${a} et ${b > 20 ? 20 : b}${b > 20 ? '' : ' (exclu)'}` };
    }));
  }

  function tableauMatiere(m, modif) {
    const cols = colonnes(m);
    const cellMoy = new Map(), cellPied = {};
    const zoneGraph = h('section', { class: 'graphiques' });
    const graphes = () => {
      const moys = eleves.map((e) => moyenneMatiere(m, e, cols));
      vider(zoneGraph,
        carteGraph('Moyenne de la classe à chaque évaluation', 'dans l’ordre des dates, sur 20', courbe(cols.map((c) => {
          const st = stats(eleves.map((e) => c.note(e)));
          return { label: c.date ? dateFr(c.date).slice(0, 5) : c.titre.slice(0, 10), valeur: st.moy, info: `${c.titre}${c.date ? ' (' + dateFr(c.date) + ')' : ''} : moyenne ${virgule(st.moy)} · de ${virgule(st.min)} à ${virgule(st.max)}` };
        }), { min: 0, max: 20, reference: { valeur: 10, nom: '10 / 20' }, couleur: m.couleur, format: (v) => virgule(v) })),
        carteGraph(`Répartition des moyennes en ${m.nom}`, 'nombre d’élèves par tranche de notes', histogramme(moys)),
        carteGraph(`Moyenne par élève en ${m.nom}`, 'sur 20, de la plus haute à la plus basse', barresH(eleves.map((e, i) => ({ e, n: moys[i] })).filter((x) => x.n !== null)
          .sort((a, b) => b.n - a.n).map((x) => ({ label: `${x.e.nom} ${x.e.prenom}`, valeur: x.n, couleur: x.n < 10 ? 'var(--g-na)' : m.couleur })), { max: 20, format: (v) => virgule(v) })));
    };
    const recalculer = () => {
      graphes();
      for (const e of eleves) { const n = moyenneMatiere(m, e, cols), td = cellMoy.get(e.id); td.textContent = virgule(n); td.className = 'note-res gen ' + classeNote(n); }
      for (const [k, tds] of Object.entries(cellPied)) {
        tds.forEach((td, i) => {
          const s = stats(eleves.map((e) => (i === cols.length ? moyenneMatiere(m, e, cols) : cols[i].note(e))));
          td.textContent = virgule(s[k]);
        });
      }
    };
    const entete = h('tr', {}, h('th', { class: 'col-eleve' }, 'Élève'),
      cols.map((c) => h('th', { class: 'col-res ' + c.type, title: c.sous || '' },
        c.type === 'contrat'
          ? h('a', { href: `#/fiches/${c.seq.id}:sommatif`, title: 'Ouvrir le contrat' }, c.titre)
          : modif ? h('button', { class: 'lien', type: 'button', title: 'Modifier ou supprimer', onclick: () => editerEvaluation(m, c.objet) }, c.titre) : c.titre,
        h('small', {}, c.type === 'contrat' ? c.sous : c.sous || 'résultat intermédiaire'),
        h('small', { class: 'date' }, c.date ? dateFr(c.date) : 'sans date'))),
      h('th', { class: 'col-res gen' }, `Moyenne ${m.nom}`));
    const coefs = h('tr', { class: 'coefs' }, h('th', {}, 'Coefficient'),
      cols.map((c) => h('td', {}, modif ? saisieCoef(c.coef, async (n) => {
        if (c.type === 'contrat') { await db.modifier('contrats', c.id, { coef_resultat: n }); c.objet.coef_resultat = n; }
        else { await db.modifier('evaluations', c.id, { coefficient: n }); c.objet.coefficient = n; }
        c.coef = n; recalculer();
      }) : virgule(c.coef))), h('td', {}));
    const corps = eleves.map((e, i) => {
      const td = h('td', { class: 'note-res gen' });
      cellMoy.set(e.id, td);
      return h('tr', {}, h('th', { class: 'col-eleve' }, h('b', {}, e.nom), ' ', e.prenom),
        cols.map((c, j) => {
          if (c.type === 'contrat') { const n = c.note(e); return h('td', { class: 'note-res auto ' + classeNote(n), title: 'Calculée d’après le contrat' }, n === null ? '—' : virgule(n)); }
          if (!modif) { const b = c.brut(e); return h('td', { class: 'note-res ' + classeNote(c.note(e)) }, /^[0-9.]+$/.test(b) ? virgule(Number(b)) : b === 'ABS' ? 'abs' : b === 'NE' ? 'ne' : ''); }
          return h('td', { class: 'note-res saisie' }, saisieNote(c, e, i, j, recalculer));
        }), td);
    });
    const pied = (lib, k) => {
      cellPied[k] = cols.map(() => h('td', {})).concat(h('td', { class: 'gen' }));
      return h('tr', { class: 'pied-res' }, h('th', {}, lib), cellPied[k]);
    };
    const t = h('div', { class: 'tableau-defile' }, h('table', { class: 'resultats detail' },
      h('thead', {}, entete, coefs), h('tbody', {}, corps),
      h('tfoot', {}, pied('Moyenne de la classe', 'moy'), pied('Note la plus basse', 'min'), pied('Note la plus haute', 'max'))));
    recalculer();
    return cols.length ? h('div', {}, t, zoneGraph) : h('div', {}, h('p', { class: 'vide' }, 'Aucune évaluation pour cette période : les contrats sommatifs des séquences de la matière et les résultats intermédiaires s’afficheront ici.'));
  }

  function saisieCoef(valeur, enregistrer) {
    const i = h('input', { class: 'champ coef-res', value: virgule(valeur), inputmode: 'decimal', title: 'Coefficient (0 = non compté)' });
    i.addEventListener('change', async () => {
      const n = nombre(i.value);
      if (n === null || n < 0) { erreur(new Error('Coefficient : un nombre positif (0 = non compté).')); i.value = virgule(valeur); return; }
      try { await enregistrer(n); valeur = n; i.value = virgule(n); toast('Coefficient enregistré'); } catch (e) { erreur(e); i.value = virgule(valeur); }
    });
    return i;
  }

  function saisieNote(c, e, i, j, recalculer) {
    const cle = `${c.id}:${e.id}`;
    const affiche = (b) => (/^[0-9.]+$/.test(b) ? virgule(Number(b)) : b === 'ABS' ? 'abs' : b === 'NE' ? 'ne' : '');
    let actuel = c.brut(e);
    const inp = h('input', { class: 'champ note-saisie ' + classeNote(c.note(e)), value: affiche(actuel), inputmode: 'decimal', 'data-l': i, 'data-c': j,
      title: `${e.nom} ${e.prenom} · ${c.titre} (sur ${virgule(c.bareme)})` });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const s = zone.querySelector(`input.note-saisie[data-l="${i + (ev.key === 'ArrowUp' ? -1 : 1)}"][data-c="${j}"]`);
        if (s) { s.focus(); s.select(); } else inp.blur();
      }
    });
    inp.addEventListener('change', async () => {
      const t = inp.value.trim().toLowerCase();
      let v;
      if (t === '') v = '';
      else if (t === 'abs' || t === 'a') v = 'ABS';
      else if (t === 'ne') v = 'NE';
      else {
        const n = nombre(t);
        if (n === null || n < 0 || n > c.bareme) { erreur(new Error(`Note entre 0 et ${virgule(c.bareme)}, « abs » ou « ne ».`)); inp.value = affiche(actuel); return; }
        v = String(n);
      }
      inp.classList.add('envoi');
      try {
        if (v === '') { if (actuel) await db.supprimer('resultats', c.id, `eleve_id=eq.${e.id}&evaluation_id`); resultats.delete(cle); }
        else { await db.enregistrer('resultats', [{ evaluation_id: c.id, eleve_id: e.id, valeur: v }], 'evaluation_id,eleve_id'); resultats.set(cle, v); }
        actuel = v; inp.value = affiche(v);
        inp.className = 'champ note-saisie ' + classeNote(c.note(e));
        recalculer();
      } catch (x) { erreur(x); inp.value = affiche(actuel); inp.classList.remove('envoi'); }
    });
    return inp;
  }

  // ajout ou modification d'un résultat intermédiaire (hors contrat sommatif)
  async function editerEvaluation(m, v) {
    const lib = h('input', { class: 'champ', value: v?.libelle || '', placeholder: 'ex. Devoir maison n°1, oral, TP chronométré…' });
    const date = h('input', { class: 'champ', type: 'date', value: v?.date_eval || '' });
    const coef = h('input', { class: 'champ', value: virgule(Number(v?.coefficient ?? 1)), inputmode: 'decimal' });
    const bar = h('input', { class: 'champ', value: virgule(Number(v?.bareme ?? 20)), inputmode: 'decimal' });
    const boutons = [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: async () => {
      const c = nombre(coef.value), b = nombre(bar.value);
      if (!lib.value.trim()) throw new Error('Donnez un intitulé.');
      if (c === null || c < 0) throw new Error('Coefficient : un nombre positif.');
      if (b === null || b <= 0) throw new Error('« Noté sur » : un nombre positif (20 en général).');
      const d = { libelle: lib.value.trim(), date_eval: date.value || null, coefficient: c, bareme: b };
      if (v) await db.modifier('evaluations', v.id, d); else await db.ajouter('evaluations', { ...d, promotion_id: P.id, matiere_id: m.id });
      return 'maj';
    } }];
    if (v) boutons.unshift({ texte: 'Supprimer', classe: 'danger gauche', action: async () => {
      const n = eleves.filter((e) => resultats.has(`${v.id}:${e.id}`)).length;
      if (!(await confirmer('Supprimer le résultat', `Supprimer « ${v.libelle} »${n ? ` et ses ${n} note(s)` : ''} ? (« Annuler » permet de revenir en arrière.)`, 'Supprimer'))) return false;
      await db.supprimer('evaluations', v.id);
      return 'maj';
    } });
    const r = await fenetre(v ? 'Résultat intermédiaire' : `Nouveau résultat intermédiaire · ${m.nom}`, h('div', { class: 'formulaire' },
      h('label', {}, 'Intitulé', lib), h('label', {}, 'Date', date), h('label', {}, 'Coefficient', coef), h('label', {}, 'Noté sur', bar),
      h('p', { class: 'aide' }, 'Les notes sont ramenées sur 20 pour les moyennes.')), boutons);
    if (r === 'maj') { toast('Enregistré'); await charger(); dessiner(); }
  }

  await charger();
  dessiner();
}
