// Partage des contenus d'une matière (séquençage, fiches, contrats) avec les autres enseignants.
// Réglage par matière, modifiable par ses enseignants (et l'administrateur) ; sans réglage : partagé avec tous.
import { db } from './api.js';
import { h, fenetre, toast, erreur } from './ui.js';

const LIBELLES = { tous: 'Partagé avec tous les enseignants', aucun: 'Non partagé', choisis: 'Partagé avec certains enseignants' };

export function reglagePartage(ctx, matiereId) {
  return ctx.partages.get(Number(matiereId)) || { matiere_id: Number(matiereId), mode: 'tous', lecteurs: [] };
}

// libellé court du réglage (ex. « 🔒 Non partagé »)
export function etiquettePartage(ctx, matiereId) {
  const p = reglagePartage(ctx, matiereId);
  const n = (p.lecteurs || []).length;
  return { tous: '🌐  ' + LIBELLES.tous, aucun: '🔒  ' + LIBELLES.aucun, choisis: `👥  Partagé avec ${n} enseignant${n > 1 ? 's' : ''}` }[p.mode];
}

// bouton du réglage de partage (enseignants de la matière et administrateur) ; apres() : rappelé après enregistrement
export function boutonPartage(ctx, m, apres) {
  if (!(ctx.estAdmin() || ctx.enseigne(m.id))) return null;
  return h('button', { class: 'btn', type: 'button', title: 'Choisir avec qui partager les contenus de cette matière',
    onclick: () => ouvrirPartage(ctx, m, apres) }, etiquettePartage(ctx, m.id));
}

export async function ouvrirPartage(ctx, m, apres) {
  const p = reglagePartage(ctx, m.id);
  const autres = ctx.enseignants.filter((e) => !(e.matieres || []).map(Number).includes(Number(m.id)));
  const choisis = new Set((p.lecteurs || []).map(Number));
  let mode = p.mode;
  const liste = h('div', { class: 'liste-partage' });
  const dessinerListe = () => {
    liste.classList.toggle('inactive', mode !== 'choisis');
    liste.replaceChildren(...(autres.length ? autres.map((e) => h('label', { class: 'case-partage' },
      h('input', { type: 'checkbox', checked: choisis.has(Number(e.id)), disabled: mode !== 'choisis',
        onchange: (ev) => { if (ev.target.checked) choisis.add(Number(e.id)); else choisis.delete(Number(e.id)); } }),
      e.nom + ((e.matieres || []).length ? '  ·  ' + e.matieres.map((id) => ctx.matieres.find((x) => x.id === Number(id))?.nom).filter(Boolean).join(', ') : '')))
      : [h('p', { class: 'aide' }, 'Aucun autre enseignant dans l’équipe.')]));
  };
  const radio = (valeur, titre, aide) => h('label', { class: 'choix-partage' },
    h('input', { type: 'radio', name: 'mode-partage', value: valeur, checked: mode === valeur, onchange: () => { mode = valeur; dessinerListe(); } }),
    h('span', {}, h('b', {}, titre), h('br'), h('span', { class: 'aide' }, aide)));
  dessinerListe();
  const ok = await fenetre(`Partage des contenus · ${m.nom}`, h('div', { class: 'formulaire etroit' },
    h('p', { class: 'aide' }, 'Contenus concernés : séquençage, fiches de préparation et de déroulement, contrats d’évaluation. '
      + 'La progression, la couverture et la validation des compétences restent communes à toute l’équipe. '
      + 'Les enseignants de la matière et l’administrateur voient toujours tout.'),
    radio('tous', LIBELLES.tous, 'Tous les enseignants peuvent consulter les contenus.'),
    radio('aucun', LIBELLES.aucun, 'Seuls les enseignants de la matière (et l’administrateur) les voient.'),
    radio('choisis', LIBELLES.choisis, 'Cocher les enseignants autorisés à consulter :'),
    liste),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: async () => {
    const ligne = { matiere_id: Number(m.id), mode, lecteurs: mode === 'choisis' ? [...choisis] : [] };
    const r = await db.enregistrer('partages', [ligne], 'matiere_id');
    ctx.partages.set(Number(m.id), (r && r[0]) || ligne);
    toast('Partage enregistré');
    return true;
  } }]);
  if (ok && apres) apres();
}

// message affiché à la place des contenus non partagés
export function contenuNonPartage(m, ctx) {
  return h('div', { class: 'non-partage' },
    h('p', { class: 'fort' }, '🔒  Contenus non partagés'),
    h('p', {}, `Les enseignants de la matière « ${m.nom} »${ctx.enseignantsDe(m.id).length ? ' (' + ctx.enseignantsDe(m.id).join(', ') + ')' : ''} `
      + 'n’ont pas partagé son séquençage, ses fiches et ses contrats avec vous.'),
    h('p', { class: 'aide' }, 'La progression, la couverture et la validation des compétences restent consultables.'));
}

export { erreur };
