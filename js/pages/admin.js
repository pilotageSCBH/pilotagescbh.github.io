// Administration (administrateur seulement) : comptes des collègues, autorisations, codes oubliés.
import { db, emailDe, identifiantDe } from '../api.js';
import { DOMAINE } from '../../config.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';
import { rafraichirMenu } from '../app.js';

// rôles des comptes : « lecture » = consultation seule (ex. DDFPT), aucune modification possible
const ROLES = [['enseignant', 'Enseignant'], ['lecture', 'Lecture seule (DDFPT…)'], ['admin', 'Administrateur']];
const nomRole = (r) => (ROLES.find((x) => x[0] === r) || ROLES[0])[1];

export async function pageAdmin(zone, _arg, ctx) {
  async function dessiner() {
    await ctx.chargerBase();
    const [profils, invitations, demandes] = await Promise.all([db.lire('profils', 'order=nom,email'), db.lire('invitations', 'order=cree_le'),
      db.lire('demandes_code', 'order=quand').catch(() => [])]);
    ctx.demandes = demandes.length; rafraichirMenu();
    const ens = (pid) => ctx.enseignants.find((e) => e.profil_id === pid);
    const libres = ctx.enseignants.filter((e) => !e.profil_id);
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Administration'), h('p', { class: 'sous-titre' }, 'Comptes de connexion de l’équipe'))),
      demandes.length ? h('section', { class: 'bloc alerte' }, h('h2', {}, '🔑  Code oublié : demandes en attente'),
        h('p', { class: 'aide' }, 'Choisissez un code provisoire et communiquez-le à votre collègue (de vive voix, par la messagerie de l’ENT…) : il devra le remplacer par son propre code à sa connexion.'),
        h('table', { class: 'liste' }, h('tbody', {}, demandes.map((d) => {
          const p = profils.find((x) => x.email === d.email);
          return h('tr', {}, h('td', {}, h('b', {}, p?.nom || identifiantDe(d.email)), ' · ', identifiantDe(d.email)),
            h('td', {}, new Date(d.quand).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })),
            h('td', {}, p ? h('button', { class: 'btn petit principal', onclick: async () => { if (await nouveauCode(p)) await dessiner(); } }, 'Donner un code provisoire') : null,
              h('button', { class: 'icone', title: 'Supprimer la demande', onclick: async () => {
                try { await db.supprimer('demandes_code', d.email, 'email'); await dessiner(); } catch (e) { erreur(e); } } }, '✖')));
        })))) : null,
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
      connexions(profils),
      reprise());
  }

  // suivi des connexions : nombre de connexions, temps passé, dernière connexion (par compte, sur une période)
  let periode = '30';
  function connexions(profils) {
    const corps = h('div', {}, h('p', { class: 'aide' }, 'Chargement…'));
    const duree = (s) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
    const ilya = (d) => {
      if (!d) return 'jamais';
      const minuit = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
      const j = Math.round((minuit(Date.now()) - minuit(d)) / 86400000);
      const date = new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return (j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} j`) + ` · ${date}`;
    };
    async function remplir() {
      const d = new Date();
      if (periode === 'rentree') { d.setFullYear(d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1, 7, 25); d.setHours(0, 0, 0, 0); }
      else if (periode === 'tout') d.setFullYear(2000);
      else d.setDate(d.getDate() - Number(periode));
      try {
        const bilan = new Map((await db.rpc('bilan_connexions', { depuis: d.toISOString() })).map((b) => [b.profil_id, b]));
        const lignes = profils.map((p) => ({ p, b: bilan.get(p.id) || { nb: 0, secondes: 0, derniere: null } }))
          .sort((x, y) => (y.b.derniere || '').localeCompare(x.b.derniere || ''));
        vider(corps, h('table', { class: 'liste' },
          h('thead', {}, h('tr', {}, ['Compte', 'Connexions', 'Temps total', 'Temps moyen', 'Dernière connexion'].map((t) => h('th', {}, t)))),
          h('tbody', {}, lignes.map(({ p, b }) => h('tr', { class: 'cliquable' + (p.actif ? '' : ' arret'), title: 'Voir le détail des connexions', onclick: () => detail(p) },
            h('td', {}, h('b', {}, p.nom || identifiantDe(p.email)), h('br'), h('small', {}, identifiantDe(p.email) + ' · ' + nomRole(p.role))),
            h('td', { class: 'centre' }, Number(b.nb)),
            h('td', { class: 'centre' }, Number(b.nb) ? duree(Number(b.secondes)) : '—'),
            h('td', { class: 'centre' }, Number(b.nb) ? duree(Number(b.secondes) / Number(b.nb)) : '—'),
            h('td', {}, ilya(b.derniere)))))));
      } catch (e) {
        vider(corps, h('p', { class: 'aide' }, 'Suivi indisponible : exécutez le fichier 9_connexions.sql dans Supabase. (' + e.message + ')'));
      }
    }
    async function detail(p) {
      const l = await db.lire('connexions', `profil_id=eq.${p.id}&order=debut.desc&limit=60`);
      const hm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      fenetre('Connexions de ' + (p.nom || identifiantDe(p.email)), l.length ? h('table', { class: 'liste' },
        h('thead', {}, h('tr', {}, ['Date', 'De', 'À', 'Durée'].map((t) => h('th', {}, t)))),
        h('tbody', {}, l.map((c) => h('tr', {},
          h('td', {}, new Date(c.debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
          h('td', {}, hm(c.debut)), h('td', {}, hm(c.derniere_activite)),
          h('td', {}, duree((new Date(c.derniere_activite) - new Date(c.debut)) / 1000)))))) : h('p', {}, 'Aucune connexion enregistrée.'),
      [{ texte: 'Fermer', valeur: true }], { large: true });
    }
    remplir();
    return h('section', { class: 'bloc' },
      h('div', { class: 'tete-bloc' }, h('h2', {}, 'Suivi des connexions'),
        h('select', { class: 'champ choix-mat', onchange: (e) => { periode = e.target.value; remplir(); } },
          [['7', '7 derniers jours'], ['30', '30 derniers jours'], ['rentree', 'Depuis la rentrée'], ['tout', 'Depuis le début']]
            .map(([v, t]) => h('option', { value: v, selected: v === periode }, t)))),
      h('p', { class: 'aide' }, 'Une connexion = une période d’utilisation de l’application ; elle est comptée comme nouvelle après 30 minutes sans activité. '
        + 'Le temps n’est compté que lorsque l’application est affichée et utilisée (pas quand l’onglet reste ouvert sans rien faire). Visible par l’administrateur seulement.'),
      corps);
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
      h('p', {}, 'Choisissez un code provisoire et communiquez-le à votre collègue : à sa prochaine connexion, il devra choisir son propre code.'), h('label', {}, 'Code provisoire', c)),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: async () => {
      if (c.value.length < 6) throw new Error('Le code doit contenir au moins 6 caractères.');
      await db.rpc('admin_nouveau_code', { compte: p.id, code: c.value });
      return true;
    } }]);
    if (r) toast('Code provisoire enregistré');
    return !!r;
  }

  await dessiner();
}
