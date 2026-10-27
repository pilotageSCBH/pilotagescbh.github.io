// Calendrier des évaluations : contrats sommatifs (et formatifs en option) et résultats intermédiaires de toutes les
// matières, semaine par semaine, avec une alerte quand plusieurs évaluations tombent la même semaine.
import { h, vider, dateFr } from '../ui.js';
import { chargerSuivi, listeEvaluations, semaineDe, semaineActuelle, lundi, jourDe, jj, semaineIso, libSemaine, SEM_AN, MOIS, TYPES_EVAL } from '../pilotage.js';

const CLE_AN = 'pilotage-scbh-evals-annee', CLE_FORM = 'pilotage-scbh-evals-formatifs';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
const SEUIL = 2;                                            // alerte à partir de 2 évaluations la même semaine

export async function pageEvaluations(zone, _arg, ctx) {
  const D = await chargerSuivi(ctx), Y = D.Y;
  const wAuj = semaineActuelle(Y);
  let annee = lire(CLE_AN, String(wAuj >= SEM_AN ? 1 : 0)) === '1' ? 1 : 0;
  let formatifs = lire(CLE_FORM, 'non') === 'oui';
  const toutes = listeEvaluations(D, ctx);

  function dessiner() {
    const evals = toutes.filter((e) => formatifs || e.type !== 'formatif');
    const parSem = new Map(), sansDate = [], horsCalendrier = [];
    for (const e of evals) {
      if (!e.date) { sansDate.push(e); continue; }
      const w = semaineDe(Y, e.date);
      if (w === null) { horsCalendrier.push(e); continue; }
      parSem.set(w, (parSem.get(w) || []).concat(e));
    }
    for (const l of parSem.values()) l.sort((a, b) => a.date.localeCompare(b.date));
    const compte = (l) => l.filter((e) => e.type !== 'formatif').length;      // la surcharge ne compte pas les formatifs
    const W = Array.from({ length: SEM_AN }, (_, i) => annee * SEM_AN + i);
    const chargees = [...parSem].filter(([w, l]) => compte(l) >= SEUIL).sort((a, b) => a[0] - b[0]);
    const chargeesAn = chargees.filter(([w]) => W.includes(w));
    const nbAn = W.reduce((a, w) => a + (parSem.get(w) || []).length, 0);
    // en-tête des mois
    const mois = [];
    for (const w of W) { const m = jourDe(Y, w, 3).getMonth(), d = mois[mois.length - 1]; if (d && d.m === m) d.n++; else mois.push({ m, n: 1 }); }
    const vac = (w) => D.semaines.get(w)?.vacances || '';
    const charge = (n) => (n >= 3 ? 'c3' : n >= SEUIL ? 'c2' : n ? 'c1' : '');
    const info = (e) => `${e.mat.nom} · ${e.titre} · ${dateFr(e.date)}`;

    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Calendrier des évaluations'),
          h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ${annee + 1}re année  ·  ${nbAn} évaluation(s) datée(s)  ·  alerte à partir de ${SEUIL} évaluations la même semaine`.replace('2re', '2e'))),
        h('div', { class: 'actions-page' },
          h('div', { class: 'bascule' }, [0, 1].map((a) => h('button', { class: 'btn' + (a === annee ? ' principal' : ''), onclick: () => { annee = a; ecrire(CLE_AN, String(a)); dessiner(); } },
            `${a + 1}${a ? 'e' : 're'} année (${Y + a}-${Y + a + 1})`))),
          h('label', { class: 'interrupteur' }, h('input', { type: 'checkbox', checked: formatifs, onchange: (e) => { formatifs = e.target.checked; ecrire(CLE_FORM, formatifs ? 'oui' : 'non'); dessiner(); } }),
            'Afficher les contrats formatifs'))),
      chargeesAn.length ? h('div', { class: 'avertissement' }, `⚠  ${chargeesAn.length} semaine(s) chargée(s) cette année : `,
        chargeesAn.map(([w, l], i) => [i ? ', ' : '', h('a', { href: '#sem-' + w, onclick: (ev) => { ev.preventDefault(); zone.querySelector('#sem-' + w)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
          `S${semaineIso(lundi(Y, w))} (${compte(l)})`)]))
        : h('div', { class: 'info-ok' }, '✅  Aucune semaine avec plusieurs évaluations cette année.'),
      // frise
      h('section', { class: 'bloc' }, h('div', { class: 'frise-evals-defile' }, h('table', { class: 'frise-evals' },
        h('thead', {},
          h('tr', {}, h('th', { class: 'lib' }, ''), mois.map((d) => h('th', { colspan: d.n, class: 'mois' }, d.n >= 2 ? MOIS[d.m] : MOIS[d.m].slice(0, 3)))),
          h('tr', {}, h('th', { class: 'lib' }, 'Semaine'), W.map((w) => h('th', { class: 'sem' + (w === wAuj ? ' auj' : '') + (vac(w) ? ' vac' : ''), title: libSemaine(Y, w) + (vac(w) ? ' · ' + vac(w) : '') },
            semaineIso(lundi(Y, w)))))),
        h('tbody', {},
          ctx.matieres.map((m) => h('tr', {}, h('th', { class: 'lib' }, h('span', { class: 'pastille', style: { background: m.couleur } }), m.nom),
            W.map((w) => {
              const l = (parSem.get(w) || []).filter((e) => e.mat.id === m.id);
              return h('td', { class: (vac(w) ? 'vac ' : '') + (w === wAuj ? 'auj' : ''), title: l.map(info).join('\n') },
                l.map((e) => h('a', { href: e.lien, class: 'puce-eval ' + e.type, style: { '--couleur': m.couleur } }, e.type === 'sommatif' ? 'S' : e.type === 'formatif' ? 'F' : 'R')));
            }))),
          h('tr', { class: 'total' }, h('th', { class: 'lib' }, 'Total'),
            W.map((w) => { const l = parSem.get(w) || [], n = compte(l);
              return h('td', { class: charge(n) + (w === wAuj ? ' auj' : ''), title: l.map(info).join('\n') }, n || (vac(w) ? vac(w)[0] : '')); }))))),
        h('div', { class: 'legende-evals' },
          h('span', {}, h('i', { class: 'puce-eval sommatif', style: { '--couleur': 'var(--teal)' } }, 'S'), 'contrat sommatif'),
          h('span', {}, h('i', { class: 'puce-eval resultat', style: { '--couleur': 'var(--teal)' } }, 'R'), 'résultat intermédiaire'),
          formatifs ? h('span', {}, h('i', { class: 'puce-eval formatif', style: { '--couleur': 'var(--teal)' } }, 'F'), 'contrat formatif (non compté dans la charge)') : null,
          h('span', {}, h('i', { class: 'carre c2' }), '2 évaluations'), h('span', {}, h('i', { class: 'carre c3' }), '3 ou plus'),
          h('span', {}, h('i', { class: 'carre vac' }), 'vacances, épreuves, stage'), h('span', {}, h('i', { class: 'carre auj' }), 'semaine actuelle'))),
      // détail semaine par semaine
      h('h2', { class: 'titre-section' }, 'Détail par semaine'),
      W.some((w) => parSem.has(w)) ? h('div', { class: 'semaines-evals' }, W.filter((w) => parSem.has(w)).map((w) => {
        const l = parSem.get(w), n = compte(l);
        return h('article', { class: 'semaine-eval ' + charge(n), id: 'sem-' + w },
          h('div', { class: 'tete' }, h('b', {}, `S${semaineIso(lundi(Y, w))}`), h('span', {}, `${jj(lundi(Y, w))} → ${jj(jourDe(Y, w, 4))}`),
            n >= SEUIL ? h('span', { class: 'badge-charge' }, `⚠ ${n} évaluations`) : null),
          h('ul', {}, l.map((e) => h('li', {}, h('span', { class: 'pastille', style: { background: e.mat.couleur } }),
            h('span', { class: 'jour' }, new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })),
            h('a', { href: e.lien }, h('b', {}, e.mat.nom), ' · ', e.titre), h('span', { class: 'type ' + e.type }, TYPES_EVAL[e.type])))));
      })) : h('p', { class: 'vide' }, 'Aucune évaluation datée cette année.'),
      sansDate.length ? h('section', { class: 'bloc' }, h('h2', {}, `📅  Évaluations sans date (${sansDate.length})`),
        h('p', { class: 'aide' }, 'Elles n’apparaissent pas dans le calendrier : renseignez leur date dans le contrat ou dans « Résultats et moyennes ».'),
        h('ul', { class: 'liste-simple' }, sansDate.map((e) => h('li', {}, h('span', { class: 'pastille', style: { background: e.mat.couleur } }), ' ', h('a', { href: e.lien }, h('b', {}, e.mat.nom), ' · ', e.titre))))) : null,
      horsCalendrier.length ? h('p', { class: 'aide' }, `${horsCalendrier.length} évaluation(s) datée(s) en dehors des deux années de formation.`) : null);
    const auj = zone.querySelector('.frise-evals th.auj');
    if (auj) { const d = zone.querySelector('.frise-evals-defile'); d.scrollLeft = Math.max(0, auj.offsetLeft - d.clientWidth / 2); }
  }
  dessiner();
}
