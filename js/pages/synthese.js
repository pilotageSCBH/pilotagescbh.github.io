// Synthèse des séquençages : pour chaque matière, ses séquences (intitulé, objectif, séances, volume).
import { db } from '../api.js';
import { h, vider, heures, imprimer } from '../ui.js';

export async function pageSynthese(zone, _arg, ctx) {
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`);
  const seances = sequences.length ? await db.lire('seances', `sequence_id=in.(${sequences.map((s) => s.id).join(',')})&order=numero`) : [];
  const remplie = (x) => !!(x.titre || x.objectif_inter);
  let totS = 0, totH = 0;
  const blocs = ctx.matieres.map((m) => {
    const sq = sequences.filter((s) => s.matiere_id === m.id);
    const lignes = sq.map((s) => {
      const se = seances.filter((x) => x.sequence_id === s.id && remplie(x));
      const hr = se.reduce((a, x) => a + (Number(x.duree) || 0), 0);
      return { s, se, hr };
    }).filter((l) => l.s.intitule || l.se.length);
    const nS = lignes.reduce((a, l) => a + l.se.length, 0), nH = lignes.reduce((a, l) => a + l.hr, 0);
    totS += nS; totH += nH;
    return h('section', { class: 'bloc-synthese', style: { '--couleur': m.couleur } },
      h('div', { class: 'tete-synthese' }, h('h2', {}, m.nom), h('span', {}, `${ctx.enseignantsDe(m.id).join(', ') || 'Enseignant à attribuer'}  ·  ${lignes.length} séquence(s) · ${nS} séance(s) · ${heures(nH) || '0 h'}`)),
      lignes.length ? h('table', { class: 'table-fiche synthese' },
        h('thead', {}, h('tr', {}, ['N°', 'Séquence', 'Objectif principal', 'Séances', 'Volume'].map((t) => h('th', {}, t)))),
        h('tbody', {}, lignes.map(({ s, se, hr }) => h('tr', {},
          h('td', { class: 'num' }, s.numero), h('td', { class: 'fort' }, s.intitule),
          h('td', {}, s.objectif),
          h('td', { class: 'petit' }, se.map((x) => h('div', {}, h('b', {}, `${s.numero}.${x.numero}`), ' ', x.titre, x.duree ? h('span', { class: 'gris' }, ` (${heures(Number(x.duree))})`) : null))),
          h('td', { class: 'centre fort' }, heures(hr) || '—')))))
        : h('p', { class: 'vide' }, 'Séquençage à compléter.'));
  });
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Synthèse des séquençages'),
      h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ${totS} séance(s)  ·  ${heures(totH) || '0 h'} au total`)),
      h('div', { class: 'actions-page' }, h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer'))),
    blocs);
}
