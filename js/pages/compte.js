// Mon compte : informations et changement de code.
import { changerCode, identifiantDe, emailConnecte } from '../api.js';
import { h, vider, toast, erreur } from '../ui.js';

export async function pageCompte(zone, _arg, ctx) {
  const c1 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const c2 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const mats = ctx.matieres.filter((m) => ctx.profil.matieres.includes(m.id)).map((m) => m.nom);
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Mon compte'))),
    h('section', { class: 'bloc' }, h('dl', { class: 'infos' },
      h('dt', {}, 'Identifiant'), h('dd', {}, identifiantDe(emailConnecte())),
      h('dt', {}, 'Nom'), h('dd', {}, ctx.profil.nom || '—'),
      h('dt', {}, 'Rôle'), h('dd', {}, ctx.estAdmin() ? 'Administrateur (toutes les modifications)' : 'Enseignant'),
      h('dt', {}, 'Matières modifiables'), h('dd', {}, ctx.estAdmin() ? 'toutes' : (mats.join(', ') || 'aucune (consultation seule)')))),
    h('section', { class: 'bloc' }, h('h2', {}, 'Changer mon code'),
      h('form', { class: 'formulaire etroit', onsubmit: async (e) => {
        e.preventDefault();
        if (c1.value.length < 6) return erreur(new Error('Le code doit contenir au moins 6 caractères.'));
        if (c1.value !== c2.value) return erreur(new Error('Les deux codes ne sont pas identiques.'));
        try { await changerCode(c1.value); c1.value = c2.value = ''; toast('Code modifié'); } catch (x) { erreur(x); }
      } }, h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer', c2), h('button', { class: 'btn principal', type: 'submit' }, 'Enregistrer'))));
}
