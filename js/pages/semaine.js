// « Ma semaine » : page personnelle de l'enseignant pour une semaine de la promotion : ses séances, le travail à la
// maison à préparer ou à récupérer, les évaluations à venir, les notes à saisir et les alertes de ses matières.
import { h, vider, heures, dateFr } from '../ui.js';
import { chargerSuivi, listeEvaluations, calculerAlertes, mesMatieres, semaineActuelle, semaineDe, lundi, jourDe, jj, semaineIso, aujourdhui, NB_SEM, SEM_AN, TYPES_EVAL } from '../pilotage.js';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const resume = (t, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export async function pageSemaine(zone, arg, ctx) {
  const [D, ref] = await Promise.all([chargerSuivi(ctx), ctx.referentiel()]);
  const Y = D.Y, wAuj = semaineActuelle(Y), auj = aujourdhui();
  let w = Number.isInteger(Number(arg)) && arg !== undefined && arg !== '' && Number(arg) >= 0 && Number(arg) < NB_SEM ? Number(arg) : wAuj;
  const mats = mesMatieres(ctx), perso = ctx.matieres.some((m) => ctx.enseigne(m.id));
  const ids = new Set(mats.map((m) => m.id));
  const evals = listeEvaluations(D, ctx);
  const alertes = calculerAlertes(D, ctx, ref, [...ids]);
  const nbImportantes = alertes.filter((a) => a.gravite === 3).reduce((s, a) => s + a.elements.length, 0);
  const nbAlertes = alertes.filter((a) => a.gravite >= 2).reduce((s, a) => s + a.elements.length, 0);
  const caseDe = (m, x) => D.cases.find((c) => c.matiere_id === m.id && c.semaine === x);
  const lienFiche = (x) => `#/fiches/${x.seq.id}:seance-${x.id}`;

  function dessiner() {
    const sem = D.semaines.get(w) || {}, debut = lundi(Y, w);
    const evts = Array.from({ length: 7 }, (_, k) => [k, D.jours.get(w * 7 + k)]).filter(([, e]) => e);
    const fin = jourDe(Y, w, 6), iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dDeb = iso(debut), dFin = iso(fin);
    // séances de la semaine, par matière
    const blocs = mats.map((m) => {
      const c = caseDe(m, w), x = c?.seance_id ? D.seances.get(c.seance_id) : null;
      if (!c || (!x && !c.texte && !c.note)) return null;
      const prec = x ? D.cases.find((k) => k.matiere_id === m.id && k.seance_id === x.id && k.semaine < w) : null;
      return { m, c, x, suite: !!prec };
    }).filter(Boolean);
    // travail à la maison
    const aPreparer = [], aRecuperer = [];
    for (const b of blocs) { const f = b.x && D.fiches.get(b.x.id); if (f?.maison_avant && !b.suite) aPreparer.push({ ...b, o: f.maison_avant }); }
    for (const x of D.seances.values()) {
      if (!ids.has(x.mat?.id)) continue;
      const o = D.fiches.get(x.id)?.maison_apres;
      if (!o) continue;
      const e = o.echeance;
      let dedans = e ? e >= dDeb && e <= dFin : false;
      if (!e) { const c = D.cases.filter((k) => k.seance_id === x.id).map((k) => k.semaine); dedans = c.length && Math.max(...c) === w - 1; }
      if (dedans) aRecuperer.push({ x, o });
    }
    // évaluations : cette semaine et les 4 suivantes
    const finVue = iso(jourDe(Y, Math.min(NB_SEM - 1, w + 4), 6));
    const prochaines = evals.filter((e) => e.date && e.date >= dDeb && e.date <= finVue).sort((a, b) => a.date.localeCompare(b.date));
    const aNoter = evals.filter((e) => ids.has(e.mat.id) && e.type !== 'formatif' && e.date && e.date < auj && !e.notee);
    const nbCours = blocs.filter((b) => b.x).length;

    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Ma semaine'),
          h('p', { class: 'sous-titre' }, `${perso ? (ctx.profil?.nom || 'Mes matières') + ' · ' + mats.map((m) => m.nom).join(', ') : 'Toutes les matières'}  ·  Promotion ${ctx.promo.libelle}`)),
        h('div', { class: 'actions-page' },
          h('button', { class: 'btn', disabled: w <= 0, title: 'Semaine précédente', onclick: () => { location.hash = '#/semaine/' + (w - 1); } }, '◀'),
          h('div', { class: 'semaine-choisie' }, h('b', {}, `Semaine ${semaineIso(debut)}`), h('span', {}, `du ${debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${jourDe(Y, w, 4).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)),
          h('button', { class: 'btn', disabled: w >= NB_SEM - 1, title: 'Semaine suivante', onclick: () => { location.hash = '#/semaine/' + (w + 1); } }, '▶'),
          w !== wAuj ? h('button', { class: 'btn principal', onclick: () => { location.hash = '#/semaine/' + wAuj; } }, 'Cette semaine') : null)),
      // bandeau de la semaine
      h('section', { class: 'bandeau-semaine' },
        h('div', { class: 'puce-info ' + (sem.vacances ? 'vac' : 'cours') }, sem.vacances ? `🏖  ${sem.vacances}` : `🏫  Semaine de cours · ${w < SEM_AN ? '1re' : '2e'} année`),
        sem.apprentis ? h('div', { class: 'puce-info ' + (sem.apprentis === 'PFMP' ? 'pfmp' : 'presents') }, sem.apprentis === 'PFMP' ? '🏭  Apprentis en entreprise (PFMP)' : '👷  Apprentis présents') : null,
        evts.map(([k, e]) => h('div', { class: 'puce-info evt' }, `📌  ${JOURS[k]} ${jj(jourDe(Y, w, k))} : ${e}`)),
        h('a', { class: 'puce-info ' + (nbImportantes ? 'alerte' : nbAlertes ? 'surveiller' : 'ok'), href: '#/alertes' },
          nbAlertes ? `⚠  ${nbAlertes} alerte(s) de pilotage${nbImportantes ? ` dont ${nbImportantes} importante(s)` : ''}` : '✅  Aucune alerte de pilotage')),
      h('div', { class: 'grille-semaine' }, h('div', { class: 'col-semaine' },
        // séances
        h('section', { class: 'bloc carte-semaine seances-semaine' },
          h('h2', {}, '📘  Mes séances', h('small', {}, nbCours ? ` ${nbCours} séance(s)` : '')),
          blocs.length ? blocs.map(({ m, c, x, suite }) => h('article', { class: 'seance-semaine', style: { '--couleur': m.couleur } },
            h('div', { class: 'tete' }, h('span', { class: 'mat' }, m.nom), x ? h('span', { class: 'num' }, `${ctx.codeMat(m)} ${x.seq.numero}.${x.numero}`) : null,
              suite ? h('span', { class: 'suite' }, 'suite') : null, x?.duree ? h('span', { class: 'duree' }, heures(Number(x.duree))) : null),
            x ? h('h3', {}, x.titre || 'Séance sans titre') : h('h3', {}, c.texte),
            x?.objectif_inter ? h('p', {}, resume(x.objectif_inter, 220)) : null,
            c.note ? h('p', { class: 'note-sem' }, '🗒  ' + c.note) : null,
            x ? h('div', { class: 'liens' }, h('a', { href: lienFiche(x) }, '▶ Fiche de déroulement'), h('a', { href: `#/fiches/${x.seq.id}:formatif-${x.id}` }, '▶ Contrat formatif'),
              h('a', { href: '#/progression/' + m.id }, '▶ Progression')) : null))
            : h('p', { class: 'vide' }, sem.vacances ? 'Pas de cours cette semaine.' : 'Aucune séance placée dans la progression cette semaine.')),
        notesASaisir()), h('div', { class: 'col-semaine' },
        // travail à la maison
        h('section', { class: 'bloc carte-semaine' },
          h('h2', {}, '🏠  Travail à la maison'),
          h('h3', { class: 'sous' }, 'Travail préparatoire demandé pour les séances de la semaine'),
          aPreparer.length ? h('ul', { class: 'liste-semaine' }, aPreparer.map(({ m, x, o }) => h('li', {}, h('span', { class: 'pastille', style: { background: m.couleur } }),
            h('a', { href: lienFiche(x) }, h('b', {}, `${ctx.codeMat(m)} ${x.seq.numero}.${x.numero}`), ' · ', resume(o.consignes || o.objectif || 'travail préparatoire', 140)),
            o.echeance ? h('small', {}, ` pour le ${dateFr(o.echeance)}`) : null))) : h('p', { class: 'vide petit' }, 'Rien à préparer.'),
          h('h3', { class: 'sous' }, 'Devoirs à récupérer ou à corriger'),
          aRecuperer.length ? h('ul', { class: 'liste-semaine' }, aRecuperer.map(({ x, o }) => h('li', {}, h('span', { class: 'pastille', style: { background: x.mat.couleur } }),
            h('a', { href: `#/fiches/${x.seq.id}:seance-${x.id}` }, h('b', {}, `${ctx.codeMat(x.mat)} ${x.seq.numero}.${x.numero}`), ' · ', resume(o.consignes || 'devoirs', 140)),
            h('small', {}, o.echeance ? ` à rendre le ${dateFr(o.echeance)}` : ' donnés la semaine dernière')))) : h('p', { class: 'vide petit' }, 'Aucun devoir à récupérer.')),
        // évaluations
        h('section', { class: 'bloc carte-semaine' },
          h('h2', {}, '📝  Prochaines évaluations', h('small', {}, ' cette semaine et les 4 suivantes')),
          prochaines.length ? h('ul', { class: 'liste-semaine evals' }, prochaines.map((e) => {
            const s = semaineDe(Y, e.date);
            return h('li', { class: (ids.has(e.mat.id) ? 'mienne' : 'autre') + (s === w ? ' cette' : '') }, h('span', { class: 'pastille', style: { background: e.mat.couleur } }),
              h('span', { class: 'jour-eval' }, new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })),
              h('a', { href: e.lien }, h('b', {}, e.mat.nom), ' · ', e.titre), h('span', { class: 'type ' + e.type }, TYPES_EVAL[e.type]));
          })) : h('p', { class: 'vide petit' }, 'Aucune évaluation datée sur cette période.'),
          h('a', { class: 'lien-carte', href: '#/evaluations' }, '▶ Calendrier des évaluations de toutes les matières')))));
    function notesASaisir() {
      return h('section', { class: 'bloc carte-semaine' + (aNoter.length ? ' a-faire' : '') },
        h('h2', {}, '✏️  Notes à saisir', aNoter.length ? h('span', { class: 'nb-alerte' }, aNoter.length) : null),
        aNoter.length ? h('ul', { class: 'liste-semaine' }, aNoter.map((e) => h('li', {}, h('span', { class: 'pastille', style: { background: e.mat.couleur } }),
          h('a', { href: e.lien }, h('b', {}, e.mat.nom), ' · ', e.titre), h('small', {}, ` évalué le ${dateFr(e.date)}`))))
          : h('p', { class: 'vide petit' }, '✅  Toutes les évaluations passées sont notées.'));
    }
  }
  dessiner();
}
