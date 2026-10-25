// Progression : calendrier des deux années de la promotion (90 semaines).
// Par semaine : vacances / autres, apprentis ; par jour : évènement ; par matière : séance (ou texte libre) et note.
// Les séances se déplacent par glisser-déposer : les autres séances de la matière se décalent (semaines de cours seulement).
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, toast, erreur, fenetre, confirmer, imprimer } from '../ui.js';

const SEM_AN = 45;
const VACANCES = ['Vacances', 'Epreuves', 'Stage'];
const APPRENTIS = ['Présents', 'PFMP'];
const EVENEMENTS = ['Férié / pont', 'Sortie scolaire', 'Épreuve'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const CLE_AN = 'pilotage-scbh-progression-annee', CLE_MAT = 'pilotage-scbh-progression-matiere', CLE_VUE = 'pilotage-scbh-progression-vue';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };

export async function pageProgression(zone, arg, ctx) {
  const P = ctx.promo, Y = P.annee_debut;
  const ref = await ctx.referentiel();
  let annee = Number(lire(CLE_AN, '0')) === 1 ? 1 : 0;
  let vue = lire(CLE_VUE, 'tableau') === 'frise' ? 'frise' : 'tableau';
  let filtre = arg && ctx.matieres.some((m) => String(m.id) === String(arg)) ? String(arg) : lire(CLE_MAT, 'toutes');
  if (filtre !== 'toutes' && !ctx.matieres.some((m) => String(m.id) === filtre)) filtre = 'toutes';
  const calendrierModifiable = ctx.peutEcrire();                // tout compte qui peut modifier (pas « lecture seule »)

  // ------------------------------------------------------------------------------------- données
  let semaines, jours, cases, seances, sequences, commentaires;
  async function charger() {
    const [s, j, c, sq] = await Promise.all([
      db.lire('progression_semaines', `promotion_id=eq.${P.id}`), db.lire('progression_jours', `promotion_id=eq.${P.id}`),
      db.lire('progression_cases', `promotion_id=eq.${P.id}`), db.lire('sequences', `promotion_id=eq.${P.id}&order=matiere_id,numero`)]);
    const [se, co] = await Promise.all([
      sq.length ? db.lire('seances', `sequence_id=in.(${sq.map((x) => x.id).join(',')})&order=numero`) : [],
      db.lire('commentaires', `promotion_id=eq.${P.id}&order=cree_le`).catch(() => [])]);
    commentaires = new Map();
    for (const x of co) commentaires.set(x.seance_id, (commentaires.get(x.seance_id) || []).concat(x));
    semaines = new Map(s.map((x) => [x.semaine, x]));
    jours = new Map(j.map((x) => [x.jour, x.evenement]));
    cases = new Map(c.map((x) => [`${x.matiere_id}:${x.semaine}`, x]));
    sequences = new Map(sq.map((x) => [x.id, x]));
    seances = new Map(se.map((x) => [x.id, { ...x, seq: sequences.get(x.sequence_id) }]));
  }
  const seancesDe = (m) => [...seances.values()].filter((x) => x.seq.matiere_id === m.id)
    .sort((a, b) => a.seq.numero - b.seq.numero || a.numero - b.numero);
  const num = (x) => `${x.seq.numero}.${x.numero}`;
  // prérequis (antériorités) : chaque séance prérequise doit commencer une semaine AVANT la séance
  const debutDe = (id) => { let d = null; for (const c of cases.values()) if (c.seance_id === id && (d === null || c.semaine < d)) d = c.semaine; return d; };
  const etiq = (y) => `${ctx.codeMat(ctx.matieres.find((z) => z.id === y.seq.matiere_id))} ${num(y)}`;
  function etatPrerequis(x) {
    const d = debutDe(x.id);
    return (x.prerequis || []).map((i) => seances.get(Number(i))).filter(Boolean).map((y) => {
      const dy = debutDe(y.id);
      return { y, dy, ok: dy !== null && d !== null && dy < d };
    });
  }
  const problemes = (x) => etatPrerequis(x).filter((p) => !p.ok);
  const enCours = (w) => !(semaines.get(w)?.vacances);
  const caseDe = (m, w) => cases.get(`${m.id}:${w}`);
  const seanceDe = (m, w) => { const c = caseDe(m, w); return c?.seance_id ? seances.get(c.seance_id) : null; };
  const cleDe = (m, w) => { const c = caseDe(m, w); if (!c) return ''; if (c.seance_id && seances.has(c.seance_id)) return 's' + c.seance_id; return c.texte ? 't' + c.texte : ''; };

  // ------------------------------------------------------------------------------------- dates
  function lundi(w) {
    const d = new Date(Y + Math.floor(w / SEM_AN), 8, 1);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (w % SEM_AN));
    return d;
  }
  const jourDe = (w, k) => { const d = lundi(w); d.setDate(d.getDate() + k); return d; };
  const jj = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  function semaineIso(d0) {
    const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  const libSemaine = (w) => `S${semaineIso(lundi(w))} (${jj(lundi(w))} → ${jj(jourDe(w, 4))})`;

  // ------------------------------------------------------------------------------------- enregistrements
  async function enregistrerCases(m, lignes) {
    if (!lignes.length) return;
    const r = await db.enregistrer('progression_cases', lignes.map((l) => ({ promotion_id: P.id, matiere_id: m.id, ...l })), 'promotion_id,matiere_id,semaine');
    for (const x of r || []) cases.set(`${x.matiere_id}:${x.semaine}`, x);
  }
  async function majSemaine(w, champ, v) {
    const r = await db.enregistrer('progression_semaines', [{ promotion_id: P.id, semaine: w, [champ]: v }], 'promotion_id,semaine');
    semaines.set(w, r[0]);
  }
  async function majJour(j, v) {
    await db.enregistrer('progression_jours', [{ promotion_id: P.id, jour: j, evenement: v }], 'promotion_id,jour');
    jours.set(j, v);
  }

  // valeurs des semaines de cours d'une matière, puis réécriture des seules semaines qui changent
  function semainesCours() { const t = []; for (let w = 0; w < 2 * SEM_AN; w++) if (enCours(w)) t.push(w); return t; }
  const contenu = (cle) => (cle.startsWith('s') ? { seance_id: Number(cle.slice(1)), texte: '' } : { seance_id: null, texte: cle ? cle.slice(1) : '' });
  async function appliquer(m, T, avant, apres, message) {
    const lignes = [];
    T.forEach((w, i) => { if (avant[i] !== apres[i]) lignes.push({ semaine: w, ...contenu(apres[i]) }); });
    try { await enregistrerCases(m, lignes); toast(message); } catch (e) { erreur(e); }
    dessiner();
  }

  // déplacer la séance (toutes ses semaines consécutives) de la semaine « de » pour qu'elle commence à la semaine « vers »
  async function deplacer(m, de, vers) {
    const T = semainesCours(), v = T.map((w) => cleDe(m, w));
    const i = T.indexOf(de), p = T.indexOf(vers);
    if (i < 0 || p < 0 || !v[i]) return;
    let i0 = i, i1 = i;
    while (i0 > 0 && v[i0 - 1] === v[i]) i0--;
    while (i1 < v.length - 1 && v[i1 + 1] === v[i]) i1++;
    if (p >= i0 && p <= i1) return;
    const bloc = v.slice(i0, i1 + 1), reste = v.slice(0, i0).concat(v.slice(i1 + 1));
    const q = Math.min(p, reste.length);
    const apres = reste.slice(0, q).concat(bloc, reste.slice(q));
    await appliquer(m, T, v, apres, 'Séance déplacée : les suivantes se sont décalées');
  }
  // placer une séance (ou un texte) à la semaine w ; si elle est occupée, les suivantes descendent jusqu'à la 1re semaine libre
  // la semaine w prolonge-t-elle la séance (ou le texte) de la semaine de cours précédente ?
  function estSuite(m, w) {
    const T = semainesCours(), i = T.indexOf(w);
    return i > 0 && !!cleDe(m, w) && cleDe(m, T[i - 1]) === cleDe(m, w);
  }
  // retirer une séance placée (toutes ses semaines : elle retourne dans « Séances à placer ») ou une seule semaine de suite ;
  // decaler : les séances suivantes remontent pour combler la place libérée
  async function retirer(m, w, { suite = false, decaler = false } = {}) {
    const T = semainesCours(), v = T.map((x) => cleDe(m, x)), i = T.indexOf(w), cle = v[i];
    if (i < 0 || !cle) return;
    let idx;
    if (suite) idx = [i];
    else if (cle.startsWith('s')) idx = v.map((x, k) => (x === cle ? k : -1)).filter((k) => k >= 0);
    else { let a = i, b = i; while (a > 0 && v[a - 1] === cle) a--; while (b < v.length - 1 && v[b + 1] === cle) b++; idx = Array.from({ length: b - a + 1 }, (_, k) => a + k); }
    const enleve = new Set(idx);
    const apres = decaler ? v.filter((_, k) => !enleve.has(k)).concat(idx.map(() => '')) : v.map((x, k) => (enleve.has(k) ? '' : x));
    await appliquer(m, T, v, apres, suite ? 'Semaine de suite supprimée' : cle.startsWith('s') ? 'Séance retirée : elle est de nouveau « à placer »' : 'Texte retiré');
  }
  // demande de confirmation : laisser la place vide ou décaler toutes les séances suivantes pour combler la place
  async function demanderRetrait(m, w) {
    const suite = estSuite(m, w), x = seanceDe(m, w), c = caseDe(m, w) || {};
    const quoi = suite ? `la semaine de suite (${libSemaine(w)}) de la séance ${x ? num(x) : '« ' + c.texte + ' »'}`
      : x ? `la séance ${num(x)}${x.titre ? ' « ' + x.titre + ' »' : ''} de la progression (toutes ses semaines)` : `le texte « ${c.texte} »`;
    const choix = await fenetre(suite ? 'Supprimer une semaine de suite' : 'Retirer de la progression', h('div', { class: 'formulaire etroit' },
      h('p', {}, `Retirer ${quoi} ?`),
      x && !suite ? h('p', { class: 'aide' }, 'La séance reste dans le séquençage et retourne dans « Séances à placer ».') : null,
      h('ul', { class: 'aide' },
        h('li', {}, h('b', {}, 'Laisser la place vide'), ' : les séances suivantes ne bougent pas.'),
        h('li', {}, h('b', {}, 'Décaler les séances suivantes'), ' : toutes les séances suivantes de la matière avancent pour combler la place libérée.'))),
    [{ texte: 'Annuler', valeur: false },
      { texte: 'Laisser la place vide', classe: 'danger', valeur: 'vide' },
      { texte: 'Décaler les séances suivantes', classe: 'danger', valeur: 'decaler' }]);
    if (!choix) return false;
    await retirer(m, w, { suite, decaler: choix === 'decaler' });
    return true;
  }

  async function inserer(m, w, cle, message = 'Séance placée') {
    const T = semainesCours(), v = T.map((x) => cleDe(m, x)), p = T.indexOf(w);
    if (p < 0) return erreur(new Error('Semaine de vacances / stage / épreuves : choisissez une semaine de cours.'));
    const apres = v.slice();
    if (apres[p]) {
      const e = apres.findIndex((x, k) => k > p && !x);
      if (e < 0) return erreur(new Error('Plus aucune semaine libre après celle-ci dans cette matière.'));
      for (let k = e; k > p; k--) apres[k] = apres[k - 1];
    }
    apres[p] = cle;
    await appliquer(m, T, v, apres, apres[p + 1] && v[p] ? message + ' : les suivantes se sont décalées' : message);
  }

  // ------------------------------------------------------------------------------------- dessin
  let glisse = null;
  const garde = { x: 0, y: 0, t: 0 };
  function dessiner() {
    const conteneur = zone.querySelector('.tableau-progression, .frise-defile');
    if (conteneur) { garde.x = conteneur.scrollLeft; garde.t = conteneur.scrollTop; garde.y = window.scrollY; }
    const mats = filtre === 'toutes' ? ctx.matieres : ctx.matieres.filter((m) => String(m.id) === filtre);
    const detail = mats.length === 1;
    const w0 = annee * SEM_AN, w1 = w0 + SEM_AN;

    const entete = h('header', { class: 'entete-page' },
      h('div', {}, h('h1', {}, 'Progression'),
        h('p', { class: 'sous-titre' }, `Promotion ${P.libelle}  ·  ${annee === 0 ? '1re' : '2e'} année ${Y + annee}-${Y + annee + 1}`)),
      h('div', { class: 'actions-page' },
        h('div', { class: 'bascule' }, [['tableau', '☷  Tableau'], ['frise', '▬  Frise']].map(([v, t]) => h('button', { class: 'btn' + (v === vue ? ' principal' : ''),
          onclick: () => { vue = v; ecrire(CLE_VUE, v); garde.x = 0; garde.t = 0; dessiner(); } }, t))),
        h('div', { class: 'bascule' }, [0, 1].map((a) => h('button', { class: 'btn' + (a === annee ? ' principal' : ''),
          onclick: () => { annee = a; ecrire(CLE_AN, String(a)); garde.t = 0; garde.x = 0; dessiner(); } }, a === 0 ? '1re année' : '2e année'))),
        boutonAnnuler(ctx, 'progression'),
        h('button', { class: 'btn', onclick: () => imprimer('A3 landscape') }, '🖶  Imprimer'),
        h('select', { class: 'champ choix-mat', onchange: (e) => { filtre = e.target.value; ecrire(CLE_MAT, filtre); dessiner(); } },
          h('option', { value: 'toutes', selected: filtre === 'toutes' }, 'Toutes les matières'),
          ctx.matieres.map((m) => h('option', { value: m.id, selected: String(m.id) === filtre }, m.nom)))));

    const legende = h('div', { class: 'legende' },
      VACANCES.map((v) => h('span', { class: 'leg vac-' + cls(v) }, v)),
      h('span', { class: 'leg app-presents' }, 'Apprentis présents'), h('span', { class: 'leg app-pfmp' }, 'Apprentis en PFMP'),
      EVENEMENTS.map((e) => h('span', { class: 'leg ev-' + cls(e) }, e)),
      h('span', { class: 'aide' }, detail ? 'Glisser une séance pour la déplacer (les suivantes se décalent) ; glisser une séance « à placer » dans une semaine ; cliquer une case pour la modifier.'
        : 'Glisser une séance pour la déplacer ; cliquer une case pour choisir la séance. Choisir une seule matière pour voir le détail et les séances à placer.'));

    const tete = h('tr', {}, h('th', { class: 'col-sem' }, 'Semaine'), h('th', { class: 'col-jours' }, 'Évènements du jour'),
      h('th', { class: 'col-app' }, 'Apprentis'), h('th', { class: 'col-vac' }, 'Vacances / autres'),
      mats.map((m) => {
        const toutes = seancesDe(m), placees = new Set([...cases.values()].filter((c) => c.matiere_id === m.id && c.seance_id).map((c) => c.seance_id));
        return h('th', { class: 'col-mat', style: { '--couleur': m.couleur } }, h('div', { class: 'nom-mat' }, m.nom),
          h('div', { class: 'compte' }, `${toutes.filter((x) => placees.has(x.id)).length} / ${toutes.length} séances placées`));
      }));

    const corps = [];
    let moisPrec = -1;
    const prec = new Map(mats.map((m) => [m.id, '']));
    for (let w = 0; w < w1; w++) {
      // séquence / séance de la semaine de cours précédente (pour les bandeaux de séquence et les « suite »)
      if (w < w0) { if (enCours(w)) mats.forEach((m) => prec.set(m.id, cleDe(m, w))); continue; }
      const mer = jourDe(w, 2);
      if (mer.getMonth() !== moisPrec) {
        moisPrec = mer.getMonth();
        corps.push(h('tr', { class: 'ligne-mois' }, h('td', { colspan: 4 + mats.length }, MOIS[moisPrec] + ' ' + mer.getFullYear())));
      }
      const sem = semaines.get(w) || {};
      const vac = sem.vacances || '';
      const tr = h('tr', { class: 'semaine' + (vac ? ' vac-' + cls(vac) : '') },
        h('td', { class: 'col-sem' }, h('b', {}, 'S' + semaineIso(lundi(w))), h('span', {}, `${jj(lundi(w))} → ${jj(jourDe(w, 4))}`)),
        h('td', { class: 'col-jours' }, h('div', { class: 'jours' }, JOURS.map((l, k) => {
          const j = w * 7 + k, ev = jours.get(j) || '';
          return h('button', { class: 'jour' + (k >= 5 ? ' we' : '') + (ev ? ' ev-' + cls(ev) : ''), type: 'button', title: ev ? `${jj(jourDe(w, k))} : ${ev}` : jj(jourDe(w, k)),
            onclick: () => choisirEvenement(w, k) }, h('i', {}, l), h('span', {}, jourDe(w, k).getDate()));
        }))),
        h('td', { class: 'col-app' }, selection(sem.apprentis || '', APPRENTIS, (v) => majSemaine(w, 'apprentis', v), 'app')),
        h('td', { class: 'col-vac' }, selection(vac, VACANCES, async (v) => { await majSemaine(w, 'vacances', v); dessiner(); }, 'vac')),
        mats.map((m) => cellule(m, w, prec, detail, vac)));
      if (enCours(w)) mats.forEach((m) => prec.set(m.id, cleDe(m, w)));
      corps.push(tr);
    }
    const tableau = h('div', { class: 'tableau-progression' }, h('table', { class: 'progression' + (detail ? ' detail' : '') },
      h('thead', {}, tete), h('tbody', {}, corps)));
    if (vue === 'frise') {
      const f = frise(mats, w0);
      vider(zone, entete, legendeFrise(detail), detail ? aPlacer(mats[0]) : null, f);
      f.scrollLeft = garde.x; f.scrollTop = garde.t;
      window.scrollTo(0, garde.y);
      return;
    }
    vider(zone, entete, legende, detail ? aPlacer(mats[0]) : null, tableau);
    tableau.scrollLeft = garde.x; tableau.scrollTop = garde.t;
    window.scrollTo(0, garde.y);
  }

  // ------------------------------------------------------------------------------------- vue « frise »
  // le temps de gauche à droite (une colonne par semaine), une bande par matière ; séances en blocs colorés
  function legendeFrise(detail) {
    return h('div', { class: 'legende' },
      VACANCES.map((v) => h('span', { class: 'leg vac-' + cls(v) }, v)),
      h('span', { class: 'leg app-presents' }, 'Apprentis présents'), h('span', { class: 'leg app-pfmp' }, 'Apprentis en PFMP'),
      EVENEMENTS.map((e) => h('span', { class: 'leg ev-' + cls(e) }, e)),
      h('span', { class: 'leg frise-auj' }, 'Aujourd’hui'),
      h('span', { class: 'aide' }, detail ? 'Glisser un bloc pour déplacer la séance (les suivantes se décalent) ; glisser une séance « à placer » sur la frise ; cliquer pour modifier.'
        : 'Glisser un bloc pour déplacer la séance ; cliquer un bloc ou une case vide pour la modifier. Cliquer les lignes du haut pour les vacances, les apprentis et les évènements.'));
  }

  function frise(mats, w0) {
    const N = SEM_AN, semaines0 = Array.from({ length: N }, (_, i) => w0 + i);
    const col = (w) => w - w0 + 2;
    const aujourdhui = (() => { const t = new Date(); return semaines0.find((w) => t >= lundi(w) && t < jourDe(w, 7)); })();
    const ligne = (classe, libelle, ...contenu) => h('div', { class: 'frise-ligne ' + classe, style: { gridTemplateColumns: `var(--frise-lib) repeat(${N}, var(--frise-sem))` } },
      h('div', { class: 'frise-lib' }, libelle), contenu);
    // regroupe des semaines consécutives de même valeur : [{ debut, fin, v }]
    const plages = (valeur) => {
      const r = [];
      for (const w of semaines0) {
        const v = valeur(w), d = r[r.length - 1];
        if (v && d && d.v === v && d.fin === w - 1) d.fin = w; else if (v) r.push({ debut: w, fin: w, v });
      }
      return r;
    };
    const mp = (w) => (jourDe(w, 2).getMonth() % 2 ? ' mp' : '');
    const fond = (w, extra = '') => h('div', { class: 'frise-case' + mp(w) + (semaines.get(w)?.vacances ? ' vac-' + cls(semaines.get(w).vacances) : '') + (w === aujourdhui ? ' auj' : '') + extra,
      style: { gridColumn: col(w), gridRow: '1 / -1' } });

    // mois et semaines
    const moisL = plages((w) => { const d = jourDe(w, 2); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; });
    const tete = [
      ligne('frise-mois', '', moisL.map((p) => h('div', { class: 'frise-mois-lib', style: { gridColumn: `${col(p.debut)} / ${col(p.fin) + 1}` } }, p.v))),
      ligne('frise-semaines', 'Semaine', semaines0.map((w) => h('div', { class: 'frise-sem' + mp(w) + (w === aujourdhui ? ' auj' : ''), style: { gridColumn: col(w) },
        title: libSemaine(w) + (w === aujourdhui ? ' · semaine en cours' : '') }, h('b', {}, 'S' + semaineIso(lundi(w))), h('span', {}, jj(lundi(w)))))),
    ];
    // calendrier commun : vacances, apprentis, évènements
    const vacL = plages((w) => semaines.get(w)?.vacances || '');
    const appL = plages((w) => semaines.get(w)?.apprentis || '');
    const commun = [
      ligne('frise-commun', '🏖  Vacances / autres', semaines0.map((w) => h('div', { class: 'frise-case clic' + mp(w) + (w === aujourdhui ? ' auj' : ''), style: { gridColumn: col(w), gridRow: 1 },
        title: `${libSemaine(w)} : cliquer pour choisir`, onclick: () => choisirSemaine(w, 'vacances', VACANCES) })),
        vacL.map((p) => h('div', { class: 'frise-bande vac-' + cls(p.v), style: { gridColumn: `${col(p.debut)} / ${col(p.fin) + 1}`, gridRow: 1 } }, p.v))),
      ligne('frise-commun', '🏭  Apprentis', semaines0.map((w) => h('div', { class: 'frise-case clic' + mp(w) + (w === aujourdhui ? ' auj' : ''), style: { gridColumn: col(w), gridRow: 1 },
        title: `${libSemaine(w)} : apprentis ${semaines.get(w)?.apprentis || '—'} (cliquer pour choisir)`, onclick: () => choisirSemaine(w, 'apprentis', APPRENTIS) })),
        appL.map((p) => h('div', { class: 'frise-bande ' + (p.v === 'PFMP' ? 'app-pfmp' : p.v === 'Présents' ? 'app-presents' : ''), style: { gridColumn: `${col(p.debut)} / ${col(p.fin) + 1}`, gridRow: 1 } }, p.v))),
      ligne('frise-commun', '📌  Évènements', semaines0.map((w) => {
        const evs = JOURS.map((_, k) => ({ k, ev: jours.get(w * 7 + k) || '' })).filter((x) => x.ev);
        return h('div', { class: 'frise-case clic frise-ev' + mp(w) + (w === aujourdhui ? ' auj' : ''), style: { gridColumn: col(w), gridRow: 1 },
          title: evs.length ? evs.map((x) => `${jourDe(w, x.k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${x.ev}`).join('\n') : `${libSemaine(w)} : cliquer pour ajouter un évènement`,
          onclick: () => choisirJour(w) }, evs.map((x) => h('i', { class: 'ev-' + cls(EVENEMENTS.includes(x.ev) ? x.ev : 'autre') }, '▲')));
      })),
    ];
    // une bande par matière : séquences (fine bande) et séances (blocs)
    const bandes = mats.map((m) => {
      const modif = ctx.enseigne(m.id);
      const toutes = seancesDe(m), placees = new Set([...cases.values()].filter((c) => c.matiere_id === m.id && c.seance_id).map((c) => c.seance_id));
      // séquence de chaque semaine (les semaines de vacances au milieu d'une séquence la prolongent)
      const seqDe = semaines0.map((w) => { const x = seanceDe(m, w); return x ? x.seq : null; });
      semaines0.forEach((w, i) => {
        if (seqDe[i] || !semaines.get(w)?.vacances) return;
        const av = seqDe.slice(0, i).reverse().find((x, k, a) => x || !semaines.get(w - k - 1)?.vacances);
        const ap = seqDe.slice(i + 1).find((x, k) => x || !semaines.get(w + k + 1)?.vacances);
        if (av && ap && av.id === ap.id) seqDe[i] = av;
      });
      const seqL = plages((w) => seqDe[w - w0]?.id || '');
      const blocs = plages((w) => cleDe(m, w));
      const nP = toutes.filter((x) => placees.has(x.id)).length;
      const lib = h('div', { class: 'frise-lib frise-mat', style: { '--couleur': m.couleur } }, h('b', {}, m.nom),
        h('span', {}, `${nP} / ${toutes.length} séances placées`),
        h('div', { class: 'frise-jauge' }, h('i', { style: { width: (toutes.length ? Math.round((nP / toutes.length) * 100) : 0) + '%' } })));
      const ligneMat = h('div', { class: 'frise-ligne frise-matiere', style: { gridTemplateColumns: `var(--frise-lib) repeat(${N}, var(--frise-sem))`, '--couleur': m.couleur } },
        lib,
        semaines0.map((w) => {
          const c = fond(w, ' cible-mat');
          c.title = `${m.nom} · ${libSemaine(w)}${modif ? ' : cliquer pour placer une séance' : ''}`;
          c.addEventListener('click', () => ouvrirCase(m, w));
          if (modif && !semaines.get(w)?.vacances) {
            c.addEventListener('dragover', (e) => { if (glisse && glisse.m.id === m.id) { e.preventDefault(); c.classList.add('cible'); } });
            c.addEventListener('dragleave', () => c.classList.remove('cible'));
            c.addEventListener('drop', async (e) => {
              e.preventDefault(); c.classList.remove('cible');
              const g = glisse; glisse = null;
              if (!g || g.m.id !== m.id) return;
              if (g.nouvelle) await inserer(m, w, 's' + g.nouvelle);
              else if (g.w !== w) await deplacer(m, g.w, w);
            });
          }
          return c;
        }),
        seqL.map((p) => { const sq = seqDe[p.debut - w0];
          return h('div', { class: 'frise-seq' + (sq.numero % 2 ? '' : ' seq-paire'), style: { gridColumn: `${col(p.debut)} / ${col(p.fin) + 1}`, gridRow: 1 }, title: `Séquence ${sq.numero}${sq.intitule ? ' · ' + sq.intitule : ''}` },
            h('b', {}, `S${sq.numero}`), sq.intitule || `Séquence ${sq.numero}`); }),
        blocs.map((p) => {
          const c = caseDe(m, p.debut), x = seanceDe(m, p.debut);
          const suite = x && blocs.some((q) => q !== p && q.v === p.v && q.fin < p.debut);
          const pb = x && !suite ? problemes(x) : [];
          const nbc = x ? (commentaires.get(x.id) || []).length : 0;
          const n = p.fin - p.debut + 1;
          const b = h('div', { class: 'frise-bloc' + (x ? (x.seq.numero % 2 ? '' : ' seq-paire') : ' libre') + (suite ? ' suite' : '') + (n === 1 ? ' court' : ''), style: { gridColumn: `${col(p.debut)} / ${col(p.fin) + 1}`, gridRow: 2 },
            draggable: modif ? 'true' : null,
            title: x ? `${num(x)} · ${x.titre || 'Séance sans titre'}\nSéquence ${x.seq.numero}${x.seq.intitule ? ' · ' + x.seq.intitule : ''}\n${libSemaine(p.debut)}${n > 1 ? ` → ${libSemaine(p.fin)} (${n} semaines)` : ''}`
              + (x.objectif_inter ? `\nObjectif : ${x.objectif_inter}` : '') + (c?.note ? `\nNote : ${c.note}` : '')
              + (pb.length ? '\n⚠ Prérequis pas encore faits : ' + pb.map((q) => etiq(q.y)).join(', ') : '')
              : `${c?.texte || ''}${c?.note ? '\nNote : ' + c.note : ''}` },
            h('b', {}, x ? num(x) : '✎'), h('span', {}, x ? (suite ? '(suite)' : x.titre || '') : c?.texte || ''),
            pb.length ? h('i', { class: 'frise-alerte', title: 'Antériorité non respectée' }, '⚠') : null,
            nbc ? h('i', { class: 'frise-com' }, '💬' + nbc) : null,
            c?.note ? h('i', { class: 'frise-note', title: c.note }, '✎') : null);
          b.addEventListener('click', (e) => { if (b.classList.contains('glisse')) return; e.stopPropagation(); ouvrirCase(m, p.debut); });
          if (modif) {
            glisserDepuis(b, m, p.debut);
            const actions = h('span', { class: 'actions-bloc' });
            if (n > 1) actions.append(h('button', { class: 'retirer-puce', type: 'button', title: 'Raccourcir : supprimer la dernière semaine (suite)',
              onclick: (e) => { e.stopPropagation(); demanderRetrait(m, p.fin); } }, '－'));
            actions.append(boutonRetrait(m, p.debut, estSuite(m, p.debut)));
            b.append(actions);
          }
          return b;
        }));
      return ligneMat;
    });
    return h('div', { class: 'frise-defile' }, h('div', { class: 'frise' + (mats.length === 1 ? ' large' : ''), style: { '--frise-sem': mats.length === 1 ? '96px' : '52px', '--frise-lib': '170px' } }, tete, commun, bandes));
  }

  // vacances / apprentis d'une semaine (vue frise)
  async function choisirSemaine(w, champ, options) {
    if (!calendrierModifiable) return;
    const actuel = semaines.get(w)?.[champ] || '';
    const r = await fenetre(`${champ === 'vacances' ? 'Vacances / autres' : 'Apprentis'} · ${libSemaine(w)}`, h('p', { class: 'aide' }, 'Choisir pour cette semaine :'),
      [{ texte: '—  (rien)', classe: actuel ? '' : 'principal', valeur: '\u0000' }, ...options.map((o) => ({ texte: o, classe: o === actuel ? 'principal' : '', valeur: o }))]);
    if (r === null || r === undefined || r === false) return;
    try { await majSemaine(w, champ, r === '\u0000' ? '' : r); toast('Enregistré'); dessiner(); } catch (e) { erreur(e); }
  }
  // évènement : choisir le jour de la semaine, puis l'évènement
  async function choisirJour(w) {
    if (!calendrierModifiable) return;
    const k = await fenetre(`Évènement · ${libSemaine(w)}`, h('p', { class: 'aide' }, 'Quel jour ?'),
      JOURS.map((_, i) => ({ texte: `${jourDe(w, i).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}${jours.get(w * 7 + i) ? ' ▲' : ''}`, valeur: String(i) })));
    if (k === null || k === undefined || k === false) return;
    await choisirEvenement(w, Number(k));
  }

  const cls = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-');

  function selection(valeur, options, enregistrer, type) {
    const s = h('select', { class: 'mini ' + type, disabled: !calendrierModifiable },
      h('option', { value: '' }, '—'), options.map((o) => h('option', { value: o, selected: o === valeur }, o)),
      valeur && !options.includes(valeur) ? h('option', { value: valeur, selected: true }, valeur) : null);
    s.dataset.v = valeur || '';
    s.addEventListener('change', async () => { try { await enregistrer(s.value); s.dataset.v = s.value; toast('Enregistré'); } catch (e) { erreur(e); } });
    return s;
  }

  function cellule(m, w, prec, detail, vac) {
    const modif = ctx.enseigne(m.id);
    const c = caseDe(m, w), se = seanceDe(m, w), cle = cleDe(m, w);
    const td = h('td', { class: 'col-mat' + (vac ? ' hors-cours' : ''), style: { '--couleur': m.couleur } });
    if (se) {
      const suite = enCours(w) && prec.get(m.id) === cle;
      const precSe = prec.get(m.id)?.startsWith('s') ? seances.get(Number(prec.get(m.id).slice(1))) : null;
      if (!suite && (!precSe || precSe.seq.id !== se.seq.id)) td.append(h('div', { class: 'bande-seq' }, `Séquence ${se.seq.numero}`, se.seq.intitule ? ' · ' + se.seq.intitule : ''));
      const puce = h('div', { class: 'puce' + (suite ? ' suite' : ''), draggable: modif && !vac ? 'true' : null,
        title: se.objectifs_ops ? 'Objectifs opérationnels :\n' + se.objectifs_ops : (se.objectif_inter || '') },
        h('b', {}, num(se)), ' ', suite ? h('span', { class: 'gris' }, '(suite)') : h('span', {}, se.titre || 'Séance sans titre'));
      if (detail && !suite) {
        if (se.objectif_inter) puce.append(h('div', { class: 'obj' }, se.objectif_inter));
        const codes = [...(se.competences || []), ...(se.savoirs || [])];
        if (codes.length) puce.append(h('div', { class: 'codes-prog' }, codes.map((x) => h('span', { title: ref.comp[x]?.libelle || ref.sav[x]?.libelle || '' }, x))));
      }
      if (modif && !vac) glisserDepuis(puce, m, w);
      const pb = suite ? [] : problemes(se);
      if (pb.length) puce.append(h('span', { class: 'alerte-pre', title: 'Prérequis pas encore faits à cette date :\n' + pb.map((p) =>
        `${etiq(p.y)} ${p.y.titre || ''} — ${p.dy === null ? 'pas placée' : 'placée ' + libSemaine(p.dy)}`).join('\n') }, '⚠ antériorité'));
      const nbc = (commentaires.get(se.id) || []).length;
      if (nbc && !suite) puce.append(h('span', { class: 'bulle-com', title: `${nbc} commentaire(s) : cliquer pour les lire` }, '💬 ' + nbc));
      if (modif && !vac) puce.append(boutonRetrait(m, w, suite));
      td.append(puce);
    } else if (c?.texte) {
      const puce = h('div', { class: 'puce libre', draggable: modif && !vac ? 'true' : null }, c.texte);
      if (modif && !vac) { glisserDepuis(puce, m, w); puce.append(boutonRetrait(m, w, estSuite(m, w))); }
      td.append(puce);
    } else if (c?.seance_id) {
      td.append(h('div', { class: 'puce libre' }, 'Séance supprimée du séquençage'));
    }
    if (c?.note) td.append(h('div', { class: 'note-sem' }, c.note));
    if (modif && !vac && !cle && !c?.note) td.append(h('span', { class: 'ajout' }, '＋'));
    td.addEventListener('click', () => ouvrirCase(m, w));
    if (modif && !vac) {
      td.addEventListener('dragover', (e) => { if (glisse && glisse.m.id === m.id) { e.preventDefault(); td.classList.add('cible'); } });
      td.addEventListener('dragleave', () => td.classList.remove('cible'));
      td.addEventListener('drop', async (e) => {
        e.preventDefault(); td.classList.remove('cible');
        const g = glisse; glisse = null;
        if (!g || g.m.id !== m.id) return;
        if (g.nouvelle) await inserer(m, w, 's' + g.nouvelle);
        else if (g.w !== w) await deplacer(m, g.w, w);
      });
    }
    return td;
  }

  function boutonRetrait(m, w, suite) {
    return h('button', { class: 'retirer-puce', type: 'button', title: suite ? 'Supprimer cette semaine de suite' : 'Retirer de la progression (retour dans « Séances à placer »)',
      onclick: (e) => { e.stopPropagation(); demanderRetrait(m, w); } }, '✖');
  }

  function glisserDepuis(el, m, w, nouvelle = null) {
    el.addEventListener('dragstart', (e) => { glisse = { m, w, nouvelle }; el.classList.add('glisse'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'seance'); e.stopPropagation(); });
    el.addEventListener('dragend', () => { el.classList.remove('glisse'); zone.querySelectorAll('.cible').forEach((x) => x.classList.remove('cible')); });
    el.addEventListener('click', (e) => { if (el.classList.contains('glisse')) e.stopPropagation(); });
  }

  // séances de la matière pas encore placées (affichées quand une seule matière est choisie)
  function aPlacer(m) {
    const placees = new Set([...cases.values()].filter((c) => c.matiere_id === m.id && c.seance_id).map((c) => c.seance_id));
    const liste = seancesDe(m).filter((x) => !placees.has(x.id));
    const modif = ctx.enseigne(m.id);
    return h('section', { class: 'a-placer', style: { '--couleur': m.couleur } },
      h('h2', {}, `Séances à placer (${liste.length})`),
      liste.length ? h('div', { class: 'puces' }, liste.map((x) => {
        const p = h('div', { class: 'puce', draggable: modif ? 'true' : null, title: x.objectif_inter || '' }, h('b', {}, num(x)), ' ', x.titre || 'Séance sans titre');
        if (modif) glisserDepuis(p, m, null, x.id);
        return p;
      })) : h('p', { class: 'aide' }, 'Toutes les séances du séquençage sont placées.'));
  }

  // ------------------------------------------------------------------------------------- fenêtres
  async function ouvrirCase(m, w) {
    const modif = ctx.enseigne(m.id);
    const c = caseDe(m, w) || {};
    const vac = semaines.get(w)?.vacances;
    const liste = seancesDe(m);
    const ou = new Map();
    for (const x of cases.values()) if (x.matiere_id === m.id && x.seance_id) ou.set(x.seance_id, (ou.get(x.seance_id) || []).concat('S' + semaineIso(lundi(x.semaine))));
    const choix = h('select', { class: 'champ', disabled: !modif },
      h('option', { value: '' }, '— aucune séance —'),
      [...new Map(liste.map((x) => [x.seq.id, x.seq])).values()].map((sq) => h('optgroup', { label: `Séquence ${sq.numero}${sq.intitule ? ' · ' + sq.intitule : ''}` },
        liste.filter((x) => x.seq.id === sq.id).map((x) => h('option', { value: x.id, selected: x.id === c.seance_id },
          `${num(x)} – ${x.titre || 'sans titre'}${ou.has(x.id) ? '   (placée : ' + ou.get(x.id).join(', ') + ')' : ''}`)))));
    const libre = h('input', { class: 'champ', value: c.seance_id ? '' : (c.texte || ''), placeholder: 'ex. révisions, évaluation, intervenant…', readonly: !modif });
    const note = h('textarea', { class: 'champ', rows: 3, placeholder: 'Note de la semaine (visible par tous)', readonly: !modif });
    note.value = c.note || '';
    const infos = h('div', { class: 'infos-seance' });
    const montrer = () => {
      const x = seances.get(Number(choix.value));
      vider(infos, x ? [
        h('p', {}, h('b', {}, `Séquence ${x.seq.numero} : `), x.seq.intitule || ''),
        x.objectif_inter ? h('p', {}, h('b', {}, 'Objectif intermédiaire : '), x.objectif_inter) : null,
        x.objectifs_ops ? h('div', { class: 'ops' }, h('b', {}, 'Objectifs opérationnels'), h('pre', {}, x.objectifs_ops)) : null,
        (x.competences || []).length ? h('p', {}, h('b', {}, 'Compétences : '), x.competences.map((k) => `${k} ${ref.comp[k]?.libelle_court || ''}`).join(' · ')) : null,
        (x.savoirs || []).length ? h('p', {}, h('b', {}, 'Savoirs : '), x.savoirs.map((k) => `${k} ${ref.sav[k]?.libelle_court || ''}`).join(' · ')) : null,
        (x.prerequis || []).length ? h('div', {}, h('b', {}, 'Prérequis : '), etatPrerequis(x).map((p) => h('div', { class: p.ok ? 'pre-ok' : 'pre-ko' },
          `${p.ok ? '✔' : '⚠'} ${etiq(p.y)} ${p.y.titre || ''} — ${p.dy === null ? 'pas encore placée' : 'placée ' + libSemaine(p.dy)}`))) : null,
        x.prerequis_texte ? h('p', {}, h('b', {}, 'Autres prérequis : '), x.prerequis_texte) : null,
      ] : []);
    };
    choix.addEventListener('change', () => { if (choix.value) libre.value = ''; montrer(); });
    libre.addEventListener('input', () => { if (libre.value) { choix.value = ''; montrer(); } });
    montrer();
    const boutons = [];
    if (modif && !vac) {
      if (c.seance_id || c.texte) boutons.push({ texte: estSuite(m, w) ? '✖  Supprimer cette suite' : '✖  Retirer de la progression', classe: 'gauche danger-texte',
        action: async () => (await demanderRetrait(m, w)) ? true : false });
      if (c.seance_id || c.texte) boutons.push({ texte: 'Prolonger d’une semaine', classe: 'gauche', action: async () => {
        const T = semainesCours(); let i = T.indexOf(w);
        while (i < T.length - 1 && cleDe(m, T[i + 1]) === cleDe(m, w)) i++;
        if (i >= T.length - 1) throw new Error('Pas de semaine de cours après celle-ci.');
        await inserer(m, T[i + 1], cleDe(m, w), 'Séance prolongée d’une semaine');
        return true;
      } });
      boutons.push({ texte: 'Annuler', valeur: false });
      boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
        const nv = choix.value ? { seance_id: Number(choix.value), texte: '' } : { seance_id: null, texte: libre.value.trim() };
        // case vidée (plus de séance ni de texte) : même choix que « Retirer » (place vide ou décalage des suivantes)
        if ((c.seance_id || c.texte) && !nv.seance_id && !nv.texte) {
          if (note.value.trim() !== (c.note || '')) await enregistrerCases(m, [{ semaine: w, seance_id: c.seance_id || null, texte: c.texte || '', note: note.value.trim() }]);
          return (await demanderRetrait(m, w)) ? true : false;
        }
        await enregistrerCases(m, [{ semaine: w, ...nv, note: note.value.trim() }]);
        toast('Enregistré'); dessiner(); return true;
      } });
    } else boutons.push({ texte: 'Fermer', valeur: false });
    const com = c.seance_id && seances.has(c.seance_id) ? blocCommentaires(seances.get(c.seance_id)) : null;
    await fenetre(`${m.nom} · ${libSemaine(w)}`, h('div', { class: 'formulaire etroit' },
      vac ? h('p', { class: 'aide' }, `Semaine « ${vac} » : pas de séance.`) : null,
      !modif ? h('p', { class: 'aide' }, 'Consultation seule : vous n’enseignez pas cette matière.') : null,
      vac ? null : h('label', {}, 'Séance', choix), vac ? null : h('label', {}, 'ou texte libre', libre),
      h('label', {}, 'Note', note), infos, com?.el), boutons, { large: true });
    if (com?.change()) dessiner();
  }

  // commentaires d'une séance : chaque enseignant peut en ajouter, visibles par tous ou par lui seul
  function blocCommentaires(x) {
    let change = false;
    const el = h('section', { class: 'commentaires' });
    const quand = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    function dessinerCom() {
      const liste = commentaires.get(x.id) || [];
      const texte = h('textarea', { class: 'champ', rows: 2, placeholder: 'Votre commentaire sur cette séance (déroulement, difficultés, à modifier l’an prochain…)' });
      const prive = h('input', { type: 'checkbox' });
      vider(el, h('h3', {}, `Commentaires sur la séance ${num(x)}`),
        liste.length ? h('ul', { class: 'liste-com' }, liste.map((k) => {
          const moi = k.auteur === ctx.profil.id;
          return h('li', { class: k.prive ? 'prive' : '' },
            h('div', { class: 'tete-com' }, h('b', {}, k.auteur_nom || '—'), ' · ', quand(k.cree_le),
              k.prive ? h('span', { class: 'badge-prive', title: 'Visible par vous seul' }, '🔒 privé') : null,
              moi ? h('button', { class: 'lien petit', type: 'button', onclick: () => modifier(k) }, 'modifier') : null,
              moi || (ctx.estAdmin() && !k.prive) ? h('button', { class: 'icone petit', type: 'button', title: 'Supprimer le commentaire', onclick: () => supprimer(k) }, '✖') : null),
            h('div', { class: 'texte-com' }, k.texte));
        })) : h('p', { class: 'aide' }, 'Aucun commentaire pour cette séance.'),
        ctx.peutEcrire() ? h('div', { class: 'ajout-com' }, texte,
          h('div', { class: 'ligne-com' }, h('label', { class: 'interrupteur' }, prive, 'Visible par moi seul'),
            h('button', { class: 'btn petit principal', type: 'button', onclick: async () => {
              if (!texte.value.trim()) return erreur(new Error('Écrivez d’abord le commentaire.'));
              try {
                const k = await db.ajouter('commentaires', { promotion_id: P.id, seance_id: x.id, texte: texte.value.trim(), prive: prive.checked });
                commentaires.set(x.id, (commentaires.get(x.id) || []).concat(k)); change = true; toast('Commentaire ajouté'); dessinerCom();
              } catch (e) { erreur(e); }
            } }, 'Ajouter le commentaire'))) : null);
    }
    async function modifier(k) {
      const t = h('textarea', { class: 'champ', rows: 4 }); t.value = k.texte;
      const p = h('input', { type: 'checkbox', checked: k.prive });
      const r = await fenetre('Modifier le commentaire', h('div', { class: 'formulaire' }, t, h('label', { class: 'interrupteur' }, p, 'Visible par moi seul')),
        [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: async () => {
          if (!t.value.trim()) throw new Error('Le commentaire est vide (pour l’effacer : ✖).');
          return db.modifier('commentaires', k.id, { texte: t.value.trim(), prive: p.checked });
        } }]);
      if (r) { Object.assign(k, r); change = true; dessinerCom(); }
    }
    async function supprimer(k) {
      if (!(await confirmer('Supprimer le commentaire', 'Supprimer définitivement ce commentaire ?', 'Supprimer'))) return;
      try {
        await db.supprimer('commentaires', k.id);
        commentaires.set(x.id, (commentaires.get(x.id) || []).filter((y) => y.id !== k.id)); change = true; dessinerCom();
      } catch (e) { erreur(e); }
    }
    dessinerCom();
    return { el, change: () => change };
  }

  async function choisirEvenement(w, k) {
    if (!calendrierModifiable) return;
    const j = w * 7 + k, actuel = jours.get(j) || '';
    const autre = h('input', { class: 'champ', value: EVENEMENTS.includes(actuel) ? '' : actuel, placeholder: 'ex. Visite salon, journée intégration…' });
    const r = await fenetre(`Évènement du ${jourDe(w, k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      h('div', { class: 'formulaire etroit' }, h('p', { class: 'aide' }, 'Choisir un évènement en bas, ou en saisir un autre :'),
        h('label', {}, 'Autre évènement (texte libre)', autre)),
      [...EVENEMENTS.map((e) => ({ texte: e, classe: e === actuel ? 'principal' : '', valeur: e })),
        actuel ? { texte: 'Effacer', classe: 'danger', valeur: '\u0000' } : null,
        { texte: 'Enregistrer le texte', classe: 'principal', action: () => autre.value.trim() || '\u0000' }].filter(Boolean));
    if (r === null || r === false || r === undefined) return;
    try { await majJour(j, r === '\u0000' ? '' : r); toast('Enregistré'); dessiner(); } catch (e) { erreur(e); }
  }

  await charger();
  dessiner();
}
