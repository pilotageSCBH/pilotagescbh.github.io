// Administration (administrateur seulement) : comptes des collègues, autorisations, codes oubliés.
import { db, emailDe, identifiantDe } from '../api.js';
import { DOMAINE } from '../../config.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';

// rôles des comptes : « lecture » = consultation seule (ex. DDFPT), aucune modification possible
const ROLES = [['enseignant', 'Enseignant'], ['lecture', 'Lecture seule (DDFPT…)'], ['admin', 'Administrateur']];
const nomRole = (r) => (ROLES.find((x) => x[0] === r) || ROLES[0])[1];

export async function pageAdmin(zone, _arg, ctx) {
  async function dessiner() {
    await ctx.chargerBase();
    const [profils, invitations] = await Promise.all([db.lire('profils', 'order=nom,email'), db.lire('invitations', 'order=cree_le')]);
    const ens = (pid) => ctx.enseignants.find((e) => e.profil_id === pid);
    const libres = ctx.enseignants.filter((e) => !e.profil_id);
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Administration'), h('p', { class: 'sous-titre' }, 'Comptes de connexion de l’équipe'))),
      h('section', { class: 'bloc' }, h('h2', {}, 'Autoriser un collègue'),
        h('p', { class: 'aide' }, `Ajoutez son identifiant (adresse académique, ou « prenom.nom » pour …@${DOMAINE}). Donnez-lui ensuite l’adresse du site : à sa première connexion, il clique sur « Première connexion » et choisit son code. `
          + 'Rôle « Lecture seule » : consulte toutes les pages sans rien pouvoir modifier (DDFPT, inspection…). Un enseignant ne modifie que les matières cochées pour lui dans « Matières et équipe ».'),
        formInvitation(libres)),
      invitations.length ? h('section', { class: 'bloc' }, h('h2', {}, 'En attente de première connexion'),
        h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Identifiant', 'Nom', 'Rôle', 'Enseignant lié', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, invitations.map((i) => h('tr', {},
            h('td', {}, identifiantDe(i.email)), h('td', {}, i.nom), h('td', {}, nomRole(i.role)),
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
                ROLES.map(([v, t]) => h('option', { value: v, selected: p.role === v }, t)))),
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
      h('p', { class: 'aide' }, 'Suspendre un compte coupe immédiatement son accès. Pour supprimer définitivement un compte : Supabase → Authentication → Users.'),
      reprise());
  }

  // recopier une promotion précédente dans une nouvelle (rien n'est écrasé : seules les parties encore vides sont remplies)
  function reprise() {
    const opt = (p) => h('option', { value: p.id, selected: false }, 'Promotion ' + p.libelle);
    const src = h('select', { class: 'champ' }, ctx.promotions.map(opt));
    const cib = h('select', { class: 'champ' }, ctx.promotions.map(opt));
    const i = ctx.promotions.findIndex((p) => p.id === ctx.promo.id);
    src.value = String(ctx.promotions[Math.max(0, i)].id);
    cib.value = String(ctx.promotions[Math.min(ctx.promotions.length - 1, i + 1)].id);
    const cases = [['sequencages', 'Séquençages (séquences et séances)', true], ['calendrier', 'Calendrier : vacances, apprentis, évènements', false],
      ['progression', 'Progression : séances placées, textes et notes', true], ['fiches', 'Fiches et contrats (sans les notes ni les dates)', true]]
      .map(([k, t, v]) => ({ k, el: h('input', { type: 'checkbox', checked: v }), t }));
    const resultat = h('p', { class: 'aide' });
    return h('section', { class: 'bloc' }, h('h2', {}, 'Reprendre une promotion'),
      h('p', { class: 'aide' }, 'Recopie le travail d’une promotion dans une autre. Seules les parties encore vides dans la promotion d’arrivée sont remplies : rien n’est écrasé. '
        + 'Le calendrier est recopié semaine par semaine : vérifiez ensuite les dates des vacances, qui changent d’une année à l’autre.'),
      h('div', { class: 'formulaire ligne' }, h('label', {}, 'Depuis', src), h('label', {}, 'Vers', cib)),
      h('div', { class: 'cases-reprise' }, cases.map((c) => h('label', { class: 'interrupteur' }, c.el, c.t))),
      h('button', { class: 'btn principal', onclick: async (e) => {
        const s = ctx.promotions.find((p) => String(p.id) === src.value), c = ctx.promotions.find((p) => String(p.id) === cib.value);
        if (s.id === c.id) return erreur(new Error('Choisissez deux promotions différentes.'));
        if (!(await confirmer('Reprendre une promotion', `Recopier dans la promotion ${c.libelle} le travail de la promotion ${s.libelle} ?`, 'Recopier'))) return;
        e.target.disabled = true;
        try {
          const r = await db.rpc('copier_promotion', { source: s.id, cible: c.id, ...Object.fromEntries(cases.map((x) => [x.k, x.el.checked])) });
          resultat.textContent = `Recopié : ${r.sequences} séquence(s), ${r.semaines} semaine(s) de calendrier, ${r.jours} évènement(s), ${r.cases} case(s) de progression, `
            + `${r.fiches} fiche(s), ${r.contrats} contrat(s). (0 = déjà rempli dans la promotion d’arrivée, ou rien à recopier.)`;
          toast('Promotion reprise');
        } catch (x) { erreur(x); } finally { e.target.disabled = false; }
      } }, 'Recopier'), resultat);
  }

  function formInvitation(libres) {
    const ident = h('input', { class: 'champ', placeholder: 'prenom.nom' });
    const nom = h('input', { class: 'champ', placeholder: 'Prénom Nom' });
    const role = h('select', { class: 'champ' }, ROLES.map(([v, t]) => h('option', { value: v }, t)));
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
