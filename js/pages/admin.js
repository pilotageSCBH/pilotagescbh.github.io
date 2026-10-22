// Administration (administrateur seulement) : comptes des collègues, autorisations, codes oubliés.
import { db, emailDe, identifiantDe } from '../api.js';
import { DOMAINE } from '../../config.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';

export async function pageAdmin(zone, _arg, ctx) {
  async function dessiner() {
    await ctx.chargerBase();
    const [profils, invitations] = await Promise.all([db.lire('profils', 'order=nom,email'), db.lire('invitations', 'order=cree_le')]);
    const ens = (pid) => ctx.enseignants.find((e) => e.profil_id === pid);
    const libres = ctx.enseignants.filter((e) => !e.profil_id);
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Administration'), h('p', { class: 'sous-titre' }, 'Comptes de connexion de l’équipe'))),
      h('section', { class: 'bloc' }, h('h2', {}, 'Autoriser un collègue'),
        h('p', { class: 'aide' }, `Ajoutez son identifiant (adresse académique, ou « prenom.nom » pour …@${DOMAINE}). Donnez-lui ensuite l’adresse du site : à sa première connexion, il clique sur « Première connexion » et choisit son code.`),
        formInvitation(libres)),
      invitations.length ? h('section', { class: 'bloc' }, h('h2', {}, 'En attente de première connexion'),
        h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Identifiant', 'Nom', 'Rôle', 'Enseignant lié', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, invitations.map((i) => h('tr', {},
            h('td', {}, identifiantDe(i.email)), h('td', {}, i.nom), h('td', {}, i.role === 'admin' ? 'Administrateur' : 'Enseignant'),
            h('td', {}, ctx.enseignants.find((e) => e.id === i.enseignant_id)?.nom || '—'),
            h('td', {}, h('button', { class: 'icone', title: 'Annuler l’autorisation', onclick: async () => {
              try { await db.supprimer('invitations', i.email, 'email'); toast('Autorisation annulée'); await dessiner(); } catch (e) { erreur(e); }
            } }, '✖'))))))) : null,
      h('section', { class: 'bloc' }, h('h2', {}, 'Comptes'),
        h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Identifiant', 'Nom', 'Rôle', 'Enseignant lié', 'Accès', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, profils.map((p) => {
            const moi = p.id === ctx.profil.id;
            const lie = ens(p.id);
            return h('tr', { class: p.actif ? '' : 'arret' },
              h('td', {}, identifiantDe(p.email), moi ? h('span', { class: 'badge scolaire' }, 'vous') : null),
              h('td', {}, h('input', { class: 'champ', value: p.nom, onchange: async (e) => { try { await db.modifier('profils', p.id, { nom: e.target.value }); toast('Enregistré'); } catch (x) { erreur(x); } } })),
              h('td', {}, h('select', { class: 'champ', disabled: moi, onchange: async (e) => { try { await db.modifier('profils', p.id, { role: e.target.value }); toast('Enregistré'); } catch (x) { erreur(x); } } },
                h('option', { value: 'enseignant', selected: p.role === 'enseignant' }, 'Enseignant'), h('option', { value: 'admin', selected: p.role === 'admin' }, 'Administrateur'))),
              h('td', {}, h('select', { class: 'champ', onchange: async (e) => {
                try {
                  if (lie) await db.modifier('enseignants', lie.id, { profil_id: null });
                  if (e.target.value) await db.modifier('enseignants', e.target.value, { profil_id: p.id });
                  toast('Enregistré'); await dessiner();
                } catch (x) { erreur(x); }
              } }, h('option', { value: '' }, '—'), [...(lie ? [lie] : []), ...libres].map((e) => h('option', { value: e.id, selected: lie && lie.id === e.id }, e.nom)))),
              h('td', {}, moi ? 'actif' : h('label', { class: 'interrupteur' }, h('input', { type: 'checkbox', checked: p.actif, onchange: async (e) => {
                try { await db.modifier('profils', p.id, { actif: e.target.checked }); toast(e.target.checked ? 'Accès rétabli' : 'Accès suspendu'); await dessiner(); } catch (x) { erreur(x); }
              } }), p.actif ? 'actif' : 'suspendu')),
              h('td', {}, moi ? null : h('button', { class: 'btn petit', onclick: () => nouveauCode(p) }, 'Nouveau code')));
          })))),
      h('p', { class: 'aide' }, 'Suspendre un compte coupe immédiatement son accès. Pour supprimer définitivement un compte : Supabase → Authentication → Users.'));
  }

  function formInvitation(libres) {
    const ident = h('input', { class: 'champ', placeholder: 'prenom.nom' });
    const nom = h('input', { class: 'champ', placeholder: 'Prénom Nom' });
    const role = h('select', { class: 'champ' }, h('option', { value: 'enseignant' }, 'Enseignant'), h('option', { value: 'admin' }, 'Administrateur'));
    const lien = h('select', { class: 'champ' }, h('option', { value: '' }, '— aucun —'), libres.map((e) => h('option', { value: e.id }, e.nom)));
    lien.onchange = () => { if (!nom.value) nom.value = lien.selectedOptions[0].textContent; };
    return h('form', { class: 'formulaire ligne', onsubmit: async (e) => {
      e.preventDefault();
      if (!ident.value.trim()) return erreur(new Error('Saisissez l’identifiant.'));
      try {
        await db.ajouter('invitations', { email: emailDe(ident.value), nom: nom.value.trim(), role: role.value, enseignant_id: lien.value ? Number(lien.value) : null });
        toast('Collègue autorisé'); await dessiner();
      } catch (x) { erreur(x); }
    } }, h('label', {}, 'Identifiant', ident), h('label', {}, 'Nom affiché', nom), h('label', {}, 'Enseignant (équipe)', lien), h('label', {}, 'Rôle', role),
    h('button', { class: 'btn principal', type: 'submit' }, 'Autoriser'));
  }

  async function nouveauCode(p) {
    const c = h('input', { class: 'champ', type: 'text', minlength: 6, placeholder: '6 caractères au moins' });
    const r = await fenetre('Nouveau code pour ' + (p.nom || identifiantDe(p.email)), h('div', { class: 'formulaire' },
      h('p', {}, 'Choisissez un code provisoire et communiquez-le à votre collègue ; il pourra le changer dans « Mon compte ».'), h('label', {}, 'Nouveau code', c)),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: async () => {
      if (c.value.length < 6) throw new Error('Le code doit contenir au moins 6 caractères.');
      await db.rpc('admin_nouveau_code', { compte: p.id, code: c.value });
      return true;
    } }]);
    if (r) toast('Nouveau code enregistré');
  }

  await dessiner();
}
