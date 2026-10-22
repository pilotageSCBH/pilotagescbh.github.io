// Mon compte : informations et changement de code.
import { changerCode, identifiantDe, emailConnecte, db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer, imprimer } from '../ui.js';

export async function pageCompte(zone, _arg, ctx) {
  const c1 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const c2 = h('input', { class: 'champ', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const mats = ctx.matieres.filter((m) => ctx.profil.matieres.includes(m.id)).map((m) => m.nom);
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Mon compte'))),
    h('section', { class: 'bloc' }, h('dl', { class: 'infos' },
      h('dt', {}, 'Identifiant'), h('dd', {}, identifiantDe(emailConnecte())),
      h('dt', {}, 'Nom'), h('dd', {}, ctx.profil.nom || '—'),
      h('dt', {}, 'Rôle'), h('dd', {}, ctx.estAdmin() ? 'Administrateur (toutes les modifications)' : ctx.peutEcrire() ? 'Enseignant' : 'Lecture seule (consultation)'),
      h('dt', {}, 'Matières modifiables'), h('dd', {}, ctx.estAdmin() ? 'toutes' : (mats.join(', ') || 'aucune (consultation seule)')))),
    h('section', { class: 'bloc' }, h('h2', {}, 'Changer mon code'),
      h('form', { class: 'formulaire etroit', onsubmit: async (e) => {
        e.preventDefault();
        if (c1.value.length < 6) return erreur(new Error('Le code doit contenir au moins 6 caractères.'));
        if (c1.value !== c2.value) return erreur(new Error('Les deux codes ne sont pas identiques.'));
        try { await changerCode(c1.value); c1.value = c2.value = ''; toast('Code modifié'); } catch (x) { erreur(x); }
      } }, h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer', c2), h('button', { class: 'btn principal', type: 'submit' }, 'Enregistrer'))),
    h('section', { class: 'bloc' }, h('h2', {}, '🔑  Code de secours'),
      h('p', { class: 'aide' }, 'En cas d’oubli de votre code : à l’écran de connexion, « Code oublié ? », saisissez votre code de secours et choisissez vous-même un nouveau code, sans attendre l’administrateur. '
        + 'Notez-le et gardez-le en lieu sûr (carnet, téléphone) : il n’est affiché qu’une seule fois.'),
      h('p', {}, ctx.profil.a_secours ? h('b', { class: 'st-ok' }, '✔ Vous avez un code de secours.') : h('b', { class: 'st-non' }, 'Vous n’avez pas encore de code de secours.')),
      h('button', { class: 'btn principal', onclick: creerSecours }, ctx.profil.a_secours ? 'Remplacer mon code de secours (perdu)' : 'Créer mon code de secours')));

  async function creerSecours() {
    if (ctx.profil.a_secours && !(await confirmer('Nouveau code de secours', 'L’ancien code de secours ne fonctionnera plus. Continuer ?', 'Remplacer'))) return;
    try {
      const code = await db.rpc('creer_code_secours');
      ctx.profil.a_secours = true;
      await fenetre('Votre code de secours', h('div', { class: 'code-secours' },
        h('p', {}, 'Notez ce code maintenant : il ne sera plus jamais affiché.'),
        h('div', { class: 'valeur-secours' }, code),
        h('p', { class: 'aide' }, `Identifiant : ${identifiantDe(emailConnecte())}. En cas d’oubli de votre code : écran de connexion → « Code oublié ? ».`)),
      [{ texte: '🖶  Imprimer', action: () => { imprimer('A5 portrait'); return false; } }, { texte: 'C’est noté', classe: 'principal', valeur: true }]);
      pageCompte(zone, _arg, ctx);
    } catch (e) { erreur(e); }
  }
}
