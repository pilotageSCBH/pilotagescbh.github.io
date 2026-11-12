// Mes ressources · Partagés avec moi : tout ce que les collègues partagent (bibliothèque et cours), par collègue.
import { db } from '../api.js';
import { h, vider } from '../ui.js';
import { chargerCollegues, nomCollegue, chargerReglages, compareTitres } from '../ressources.js';
import { GENRES } from './espace.js';

export async function pagePartages(zone, arg, ctx) {
  if (!ctx.peutEcrire()) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '👥  Partagés avec moi')), h('p', { class: 'vide' }, 'Cet espace est réservé aux enseignants.')); return; }
  const moi = ctx.profil.id;
  const [themes, livres] = await Promise.all([db.lire('biblio_themes', 'order=ordre,id').catch(() => []), db.lire('biblio_livres', 'order=titre').catch(() => []), chargerCollegues(), chargerReglages()]);
  const T = new Map(themes.map((t) => [t.id, t]));
  const autres = [...new Set([...themes, ...livres].filter((x) => x.proprietaire !== moi).map((x) => x.proprietaire))]
    .sort((a, b) => compareTitres(nomCollegue(a), nomCollegue(b)));
  const bloc = (u, espace, titre, base) => {
    const th = themes.filter((t) => t.espace === espace && t.proprietaire === u && (!t.parent_id || !T.has(t.parent_id)));
    const li = livres.filter((l) => l.espace === espace && l.proprietaire === u && (!l.theme_id || !T.has(l.theme_id)));
    if (!th.length && !li.length) return null;
    return h('div', {}, h('h3', {}, titre), h('ul', { class: 'liste-contenu' },
      th.map((t) => h('li', {}, h('a', { class: 'lien', href: base + '/t-' + t.id }, '📁 ', h('b', {}, t.nom)))),
      li.map((l) => h('li', {}, h('a', { class: 'lien', href: base + '/l-' + l.id }, (espace === 'cours' ? (GENRES[l.genre] || GENRES.cours)[0] : '📕') + ' ', h('b', {}, l.titre),
        h('small', {}, espace === 'cours' ? ' · ' + (GENRES[l.genre] || GENRES.cours)[1] : [l.auteur, l.editeur, l.annee].filter(Boolean).map((x) => ' · ' + x).join('')))))));
  };
  const blocs = autres.map((u) => {
    const nbL = livres.filter((l) => l.proprietaire === u && l.espace !== 'cours').length, nbC = livres.filter((l) => l.proprietaire === u && l.espace === 'cours').length;
    return h('section', { class: 'carte-detail partage-collegue' },
      h('h2', {}, '👤 ', nomCollegue(u), h('small', { class: 'gris' }, `  ·  ${nbL} ouvrage(s) · ${nbC} document(s)`)),
      bloc(u, 'biblio', '📖 Bibliothèque', '#/biblio'), bloc(u, 'cours', '🎓 Cours', '#/cours'));
  });
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '👥  Partagés avec moi'),
      h('p', { class: 'sous-titre' }, 'Mes ressources · ouvrages et cours que vos collègues partagent avec vous, en consultation (vous pouvez copier un cours dans votre espace)'))),
    blocs.length ? blocs : h('p', { class: 'vide' }, 'Rien n’est encore partagé avec vous.'));
}
