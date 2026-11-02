// Référentiel BTS SCBH : compétences (et indicateurs), savoirs associés, activités et tâches (et résultats attendus).
import { h, vider } from '../ui.js';

const DOMAINES = { S1: 'Conception des systèmes constructifs bois', S2: 'Préparation et gestion technico-économique du projet de construction bois',
  S3: 'Réalisation du projet de construction bois', S4: 'La communication des informations techniques', S5: 'Veille technologique, gestion et capitalisation des informations', S6: 'Arts appliqués' };
const SOUS = { S11: 'Technologie de la construction bois', S12: 'Étude mécanique des structures bois', S13: 'Performances de l’habitat', S14: 'Méthodologie de conception',
  S15: 'Approche expérimentale du comportement du matériau et des structures bois', S21: 'Environnement administratif et juridique de la construction',
  S22: 'La gestion administrative du projet', S23: 'La planification de projet', S24: 'Étude de prix', S25: 'Gestion de la qualité', S26: 'Maîtrise de la santé et sécurité au travail',
  S31: 'Préparation à la réalisation', S32: 'Réalisation du projet de construction bois', S41: 'Communication écrite', S42: 'Communication orale', S43: 'Animation de réunion',
  S44: 'Management du travail d’équipe sur chantier', S45: 'Les techniques graphiques de représentation', S51: 'Veille technologique', S52: 'Capitalisation et mise à disposition de l’information',
  S53: 'Exploitation des informations', S61: 'Le projet architectural', S62: 'Culture design et architecturale' };
const NIVEAUX = [['Information', '« l’étudiant en a entendu parler et sait où trouver l’information »'], ['Expression', '« l’étudiant sait en parler »'],
  ['Maîtrise d’outils', '« l’étudiant sait faire »'], ['Maîtrise méthodologique', '« l’étudiant maîtrise la méthode »']];

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
      let dom = null;
      for (const s of ref.savoirs) {
        if (!ok(q, s.code, s.libelle, ...(s.contenus || []), s.limites || '')) continue;
        const d = (s.code.match(/^S\d/) || [''])[0], g = (s.code.match(/^S\d{2}/) || [''])[0];
        if (d !== dom) { dom = d; out.push(h('h2', { class: 'domaine-ref' }, h('span', {}, d), DOMAINES[d] || '')); }
        if (g !== groupe) { groupe = g; out.push(h('h3', { class: 'groupe-ref' }, `${g} – ${SOUS[g] || ''}`)); }
        const n = Number(s.taxonomie) || 0;
        out.push(h('div', { class: 'item-ref savoir-ref' }, h('div', { class: 'code-ref' }, s.code), h('div', { class: 'corps-savoir' },
          h('div', { class: 'tete-savoir' }, h('div', { class: 'lib-ref' }, s.libelle),
            n ? h('div', { class: 'taxo-jauge', title: `Niveau taxonomique ${n} : ${NIVEAUX[n - 1][1]}` },
              [1, 2, 3, 4].map((i) => h('i', { class: i <= n ? 'plein' : '' })), h('span', {}, `${n} · ${NIVEAUX[n - 1][0]}`)) : null),
          (s.contenus || []).length ? h('ul', { class: 'indicateurs' }, s.contenus.map((c) => h('li', {}, c))) : null,
          s.limites ? h('div', { class: 'limites-ref' }, h('b', {}, 'Limites de connaissances'), s.limites.split('\n').map((l) => h('p', {}, l))) : null)));
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
    onglet === 'savoirs' ? h('div', { class: 'legende-taxo' }, h('b', {}, 'Niveaux taxonomiques :'), NIVEAUX.map(([t, d], i) => h('span', { title: d },
      h('span', { class: 'taxo-jauge mini' }, [1, 2, 3, 4].map((k) => h('i', { class: k <= i + 1 ? 'plein' : '' }))), ` ${i + 1} ${t}`))) : null,
    liste);
  remplir();
}
