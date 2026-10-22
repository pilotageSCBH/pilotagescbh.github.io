// Référentiel BTS SCBH : compétences (et indicateurs), savoirs associés, activités et tâches (et résultats attendus).
import { h, vider } from '../ui.js';

export async function pageReferentiel(zone, onglet, ctx) {
  const ref = await ctx.referentiel();
  onglet = ['savoirs', 'taches'].includes(onglet) ? onglet : 'competences';
  const titres = { competences: 'Compétences et indicateurs de performance', savoirs: 'Savoirs associés', taches: 'Activités et tâches professionnelles' };
  const recherche = h('input', { class: 'champ recherche', type: 'search', placeholder: 'Rechercher un code ou un mot…' });
  const liste = h('div', { class: 'referentiel' });
  const ok = (q, ...t) => !q || t.join(' ').toLowerCase().includes(q);

  function remplir() {
    const q = recherche.value.trim().toLowerCase();
    let groupe = null;
    const out = [];
    if (onglet === 'competences') {
      for (const c of ref.competences) {
        if (!ok(q, c.code, c.libelle, c.famille_libelle, ...(c.indicateurs || []))) continue;
        if (c.famille !== groupe) { groupe = c.famille; out.push(h('h3', { class: 'groupe-ref' }, `${c.famille} – ${c.famille_libelle}`, h('span', { class: 'type' }, c.type))); }
        out.push(h('div', { class: 'item-ref' }, h('div', { class: 'code-ref' }, c.code), h('div', {},
          h('div', { class: 'lib-ref' }, c.libelle),
          (c.indicateurs || []).length ? h('ul', { class: 'indicateurs' }, c.indicateurs.map((i) => h('li', {}, i))) : null)));
      }
    } else if (onglet === 'savoirs') {
      for (const s of ref.savoirs) {
        if (!ok(q, s.code, s.libelle)) continue;
        const g = (s.code.match(/^S\d/) || [''])[0];
        if (g !== groupe) { groupe = g; out.push(h('h3', { class: 'groupe-ref' }, g)); }
        out.push(h('div', { class: 'item-ref' }, h('div', { class: 'code-ref' }, s.code), h('div', {},
          h('div', { class: 'lib-ref' }, s.libelle), s.taxonomie ? h('div', { class: 'taxo' }, 'Niveau taxonomique ' + s.taxonomie) : null)));
      }
    } else {
      for (const t of ref.taches) {
        if (!ok(q, t.code, t.libelle, ...(t.resultats || []))) continue;
        if (t.activite !== groupe) { groupe = t.activite; const a = ref.activites.find((x) => x.code === groupe); out.push(h('h3', { class: 'groupe-ref' }, `${groupe} – ${a?.libelle || ''}`)); }
        out.push(h('div', { class: 'item-ref' }, h('div', { class: 'code-ref' }, t.code), h('div', {},
          h('div', { class: 'lib-ref' }, t.libelle),
          (t.resultats || []).length ? h('div', { class: 'sous-ref' }, 'Résultats attendus') : null,
          (t.resultats || []).length ? h('ul', { class: 'indicateurs' }, t.resultats.map((i) => h('li', {}, i))) : null)));
      }
    }
    vider(liste, out.length ? out : h('p', { class: 'vide' }, 'Aucun résultat.'));
  }
  recherche.addEventListener('input', remplir);
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, titres[onglet]), h('p', { class: 'sous-titre' }, 'Référentiel du BTS Systèmes Constructifs Bois et Habitat')),
      h('div', { class: 'actions-page' }, recherche)),
    h('nav', { class: 'onglets' }, Object.entries({ competences: 'Compétences', savoirs: 'Savoirs associés', taches: 'Activités et tâches' })
      .map(([k, t]) => h('a', { href: '#/referentiel/' + k, class: k === onglet ? 'actif' : '' }, t))),
    liste);
  remplir();
}
