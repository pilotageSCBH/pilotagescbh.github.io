// Alertes de pilotage : ce qui manque ou pose problème dans le séquençage, la progression, les contrats et les notes.
import { h, vider } from '../ui.js';
import { chargerSuivi, calculerAlertes, mesMatieres } from '../pilotage.js';

const CLE = 'pilotage-scbh-alertes-portee';
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
const GRAVITES = { 3: ['Important', 'g3', '🔴'], 2: ['À surveiller', 'g2', '🟠'], 1: ['Pour information', 'g1', '🔵'] };

export async function pageAlertes(zone, _arg, ctx) {
  const [D, ref] = await Promise.all([chargerSuivi(ctx), ctx.referentiel()]);
  const miennes = mesMatieres(ctx), toutesPossibles = miennes.length < ctx.matieres.length;
  let portee = toutesPossibles ? lire(CLE, 'miennes') : 'toutes';

  function dessiner() {
    const mats = (portee === 'miennes' ? miennes : ctx.matieres).map((m) => m.id);
    const A = calculerAlertes(D, ctx, ref, mats);
    const nb = (g) => A.filter((a) => a.gravite === g).reduce((s, a) => s + a.elements.length, 0);
    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Alertes de pilotage'),
          h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ` + (portee === 'miennes' ? 'mes matières : ' + miennes.map((m) => m.nom).join(', ') : 'toutes les matières'))),
        h('div', { class: 'actions-page' }, toutesPossibles ? h('select', { class: 'champ choix-mat', onchange: (e) => { portee = e.target.value; ecrire(CLE, portee); dessiner(); } },
          h('option', { value: 'miennes', selected: portee === 'miennes' }, 'Mes matières'), h('option', { value: 'toutes', selected: portee === 'toutes' }, 'Toutes les matières')) : null)),
      h('section', { class: 'kpi-ligne alertes-kpi' }, [3, 2, 1].map((g) => h('div', { class: 'kpi-alerte ' + GRAVITES[g][1] },
        h('span', { class: 'gros' }, GRAVITES[g][2]), h('div', {}, h('strong', {}, nb(g)), h('span', {}, GRAVITES[g][0]))))),
      A.length ? h('div', { class: 'liste-alertes' }, A.map((a) => h('details', { class: 'alerte ' + GRAVITES[a.gravite][1], open: a.gravite === 3 },
        h('summary', {}, h('span', { class: 'pastille-g' }, GRAVITES[a.gravite][2]), h('b', {}, a.titre), h('span', { class: 'nb-alerte' }, a.elements.length)),
        h('p', { class: 'aide' }, a.explication),
        h('ul', {}, a.elements.slice(0, 200).map((e) => h('li', {}, h('a', { href: e.lien }, e.texte)))))))
        : h('section', { class: 'bloc tout-va-bien' }, h('span', { class: 'gros' }, '✅'), h('h2', {}, 'Aucune alerte'), h('p', {}, 'Tout est en ordre pour ces matières.')),
      h('p', { class: 'aide' }, 'Les alertes sont recalculées à chaque ouverture de la page. Cliquez une ligne pour aller la corriger.'));
  }
  dessiner();
}
