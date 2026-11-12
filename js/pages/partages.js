// Mes ressources · Partagés avec moi : tout ce que les collègues partagent (bibliothèque et cours), par collègue.
import { db } from '../api.js';
import { h, vider } from '../ui.js';
import { chargerCollegues, nomCollegue, chargerReglages, compareTitres } from '../ressources.js';
import { iconeDoc, GENRES } from './cours.js';

export async function pagePartages(zone, arg, ctx) {
  if (!ctx.peutEcrire()) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '👥  Partagés avec moi')), h('p', { class: 'vide' }, 'Cet espace est réservé aux enseignants.')); return; }
  const moi = ctx.profil.id;
  const [themes, livres, cours] = await Promise.all([
    db.lire('biblio_themes', 'order=ordre,id').catch(() => []), db.lire('biblio_livres', 'order=titre').catch(() => []),
    db.lire('cours', 'order=ordre,id').catch(() => []), chargerCollegues(), chargerReglages()]);
  const T = new Map(themes.map((t) => [t.id, t])), Cmap = new Map(cours.map((c) => [c.id, c]));
  const autres = [...new Set([...themes, ...livres, ...cours].filter((x) => x.proprietaire !== moi).map((x) => x.proprietaire))]
    .sort((a, b) => compareTitres(nomCollegue(a), nomCollegue(b)));
  const blocs = autres.map((u) => {
    const th = themes.filter((t) => t.proprietaire === u && (!t.parent_id || !T.has(t.parent_id)));
    const li = livres.filter((l) => l.proprietaire === u && (!l.theme_id || !T.has(l.theme_id)));
    const co = cours.filter((c) => c.proprietaire === u && (!c.parent_id || !Cmap.has(c.parent_id)));
    const nbL = livres.filter((l) => l.proprietaire === u).length, nbC = cours.filter((c) => c.proprietaire === u && c.type === 'cours').length;
    return h('section', { class: 'carte-detail partage-collegue' },
      h('h2', {}, '👤 ', nomCollegue(u), h('small', { class: 'gris' }, `  ·  ${nbL} ouvrage(s) · ${nbC} document(s)`)),
      th.length || li.length ? h('div', {}, h('h3', {}, '📖 Bibliothèque'), h('ul', { class: 'liste-contenu' },
        th.map((t) => h('li', {}, h('a', { class: 'lien', href: '#/biblio/t-' + t.id }, '📁 ', h('b', {}, t.nom)))),
        li.map((l) => h('li', {}, h('a', { class: 'lien', href: '#/biblio/l-' + l.id }, '📕 ', h('b', {}, l.titre), h('small', {}, [l.auteur, l.editeur, l.annee].filter(Boolean).map((x) => ' · ' + x).join(''))))))) : null,
      co.length ? h('div', {}, h('h3', {}, '🎓 Cours'), h('ul', { class: 'liste-contenu' },
        co.map((c) => h('li', {}, h('a', { class: 'lien', href: '#/cours/' + c.id }, iconeDoc(c) + ' ', h('b', {}, c.titre || 'Sans titre'),
          c.type === 'cours' ? h('small', {}, ' · ' + (GENRES[c.genre] || GENRES.cours)[1]) : null))))) : null);
  });
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '👥  Partagés avec moi'),
      h('p', { class: 'sous-titre' }, 'Mes ressources · ouvrages et cours que vos collègues partagent avec vous, en consultation (vous pouvez copier un cours dans votre espace)'))),
    blocs.length ? blocs : h('p', { class: 'vide' }, 'Rien n’est encore partagé avec vous.'));
}
