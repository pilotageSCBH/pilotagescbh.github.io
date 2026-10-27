// Administration (administrateur seulement) : comptes des collègues, autorisations, codes oubliés.
import { db, emailDe, identifiantDe } from '../api.js';
import { DOMAINE } from '../../config.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';
import { telecharger } from '../echange.js';
import { rafraichirMenu, verifierSite } from '../app.js';
import { colonnes, barresH, carteGraph } from '../graphiques.js';

// rôles des comptes : « lecture » = consultation seule (ex. DDFPT), aucune modification possible
const ROLES = [['enseignant', 'Enseignant'], ['lecture', 'Lecture seule (DDFPT…)'], ['admin', 'Administrateur']];
const nomRole = (r) => (ROLES.find((x) => x[0] === r) || ROLES[0])[1];

const initiales = (t) => String(t || '?').replace(/@.*/, '').split(/[\s.\-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
const ONGLETS = [['comptes', '👥  Comptes'], ['admins', '🛡  Administrateurs'], ['maintenance', '🛠  Maintenance'], ['connexions', '📊  Connexions'], ['reprise', '📋  Reprendre une promotion'], ['sauvegarde', '💾  Sauvegarde']];

export async function pageAdmin(zone, arg, ctx) {
  let onglet = ONGLETS.some(([k]) => k === arg) ? arg : 'comptes';

  async function dessiner() {
    await ctx.chargerBase();
    const [profils, invitations, demandes, etat] = await Promise.all([db.lire('profils', 'order=nom,email'), db.lire('invitations', 'order=cree_le'),
      db.lire('demandes_code', 'order=quand').catch(() => []), db.rpc('etat_site').catch(() => null)]);
    ctx.demandes = demandes.length; rafraichirMenu();
    const actifs = profils.filter((p) => p.actif), admins = actifs.filter((p) => p.role === 'admin');
    const kpi = (icone, valeur, libelle, cle, teinte = '') => h('button', { class: 'kpi-admin ' + teinte + (onglet === cle ? ' actif' : ''), type: 'button',
      onclick: () => { location.hash = '#/admin/' + cle; } }, h('span', { class: 'kpi-icone' }, icone), h('div', {}, h('strong', {}, valeur), h('span', {}, libelle)));
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Administration'),
        h('p', { class: 'sous-titre' }, 'Comptes, administrateurs, maintenance du site, suivi des connexions, reprise d’une promotion'))),
      h('section', { class: 'kpis-admin' },
        kpi('👥', actifs.length, `compte(s) actif(s)${profils.length > actifs.length ? ` · ${profils.length - actifs.length} suspendu(s)` : ''}`, 'comptes'),
        kpi('⏳', invitations.length, 'en attente de 1re connexion', 'comptes'),
        kpi('🔑', demandes.length, 'demande(s) « code oublié »', 'comptes', demandes.length ? 'alerte' : ''),
        kpi('🛡', admins.length, 'administrateur(s)', 'admins'),
        kpi(etat?.maintenance ? '🔒' : '🟢', etat?.maintenance ? 'Fermé' : 'Ouvert', etat?.maintenance ? 'site en maintenance' : 'site ouvert à tous', 'maintenance', etat?.maintenance ? 'alerte' : 'ok')),
      h('nav', { class: 'onglets' }, ONGLETS.map(([k, t]) => h('a', { href: '#/admin/' + k, class: k === onglet ? 'actif' : '' }, t))),
      onglet === 'comptes' ? ongletComptes(profils, invitations, demandes)
        : onglet === 'admins' ? ongletAdmins(profils)
          : onglet === 'maintenance' ? ongletMaintenance(etat, actifs)
            : onglet === 'connexions' ? connexions(profils) : onglet === 'sauvegarde' ? sauvegarde() : reprise());
  }

  // ------------------------------------------------------------------------------------- comptes
  function ongletComptes(profils, invitations, demandes) {
    const ens = (pid) => ctx.enseignants.find((e) => e.profil_id === pid);
    const libres = ctx.enseignants.filter((e) => !e.profil_id);
    return h('div', {},
      demandes.length ? h('section', { class: 'bloc alerte' }, h('h2', {}, '🔑  Code oublié : demandes en attente'),
        h('p', { class: 'aide' }, 'Choisissez un code provisoire et communiquez-le à votre collègue (de vive voix, par la messagerie de l’ENT…) : il devra le remplacer par son propre code à sa connexion.'),
        h('div', { class: 'liste-demandes' }, demandes.map((d) => {
          const p = profils.find((x) => x.email === d.email);
          return h('div', { class: 'demande' }, h('span', { class: 'avatar petit' }, initiales(p?.nom || d.email)),
            h('div', { class: 'qui' }, h('b', {}, p?.nom || identifiantDe(d.email)), h('span', {}, identifiantDe(d.email) + ' · '
              + new Date(d.quand).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))),
            p ? h('button', { class: 'btn petit principal', onclick: async () => { if (await nouveauCode(p)) await dessiner(); } }, 'Donner un code provisoire') : null,
            h('button', { class: 'icone', title: 'Supprimer la demande', onclick: async () => {
              try { await db.supprimer('demandes_code', d.email, 'email'); await dessiner(); } catch (e) { erreur(e); } } }, '✖'));
        }))) : null,
      h('section', { class: 'bloc carte-ajout' }, h('h2', {}, '＋  Autoriser un collègue'),
        h('p', { class: 'aide' }, `Identifiant : adresse académique, ou « prenom.nom » pour …@${DOMAINE}. Donnez-lui ensuite l’adresse du site : à sa première connexion, il clique sur « Première connexion » et choisit son code. `
          + 'Reliez-le à sa fiche « enseignant » : c’est elle qui lui donne le droit de modifier ses matières.'),
        formInvitation(libres)),
      invitations.length ? h('section', { class: 'bloc' }, h('h2', {}, `⏳  En attente de première connexion (${invitations.length})`),
        h('div', { class: 'grille-comptes' }, invitations.map((i) => h('article', { class: 'carte-compte attente' },
          h('div', { class: 'compte-tete' }, h('span', { class: 'avatar petit gris' }, initiales(i.nom || i.email)),
            h('div', { class: 'qui' }, h('b', {}, i.nom || identifiantDe(i.email)), h('span', {}, identifiantDe(i.email))),
            h('button', { class: 'icone', title: 'Annuler l’autorisation', onclick: async () => {
              try { await db.supprimer('invitations', i.email, 'email'); toast('Autorisation annulée'); await dessiner(); } catch (e) { erreur(e); } } }, '✖')),
          h('div', { class: 'compte-infos' }, h('span', { class: 'role-pill ' + i.role }, nomRole(i.role)),
            h('span', { class: 'gris' }, 'Enseignant : ' + (ctx.enseignants.find((e) => e.id === i.enseignant_id)?.nom || '—'))))))) : null,
      h('section', { class: 'bloc' }, h('h2', {}, `👥  Comptes (${profils.length})`),
        h('div', { class: 'grille-comptes' }, profils.map((p) => {
          const moi = p.id === ctx.profil.id, lie = ens(p.id);
          const autresAdmins = profils.filter((x) => x.role === 'admin' && x.actif && x.id !== p.id).length;
          return h('article', { class: 'carte-compte' + (p.actif ? '' : ' suspendu') + (moi ? ' moi' : '') },
            h('div', { class: 'compte-tete' },
              h('span', { class: 'avatar petit ' + p.role }, initiales(p.nom || p.email)),
              h('div', { class: 'qui' },
                h('input', { class: 'champ nom-compte', value: p.nom, placeholder: 'Nom affiché', onchange: async (e) => {
                  try { await db.modifier('profils', p.id, { nom: e.target.value }); toast('Enregistré'); } catch (x) { erreur(x); } } }),
                h('span', {}, identifiantDe(p.email), moi ? h('b', { class: 'vous' }, ' · vous') : null)),
              moi ? null : h('label', { class: 'interrupteur bascule-acces', title: p.actif ? 'Suspendre l’accès' : 'Rétablir l’accès' },
                h('input', { type: 'checkbox', checked: p.actif, onchange: async (e) => {
                  try { await db.modifier('profils', p.id, { actif: e.target.checked }); toast(e.target.checked ? 'Accès rétabli' : 'Accès suspendu'); await dessiner(); }
                  catch (x) { erreur(x); await dessiner(); } } }), p.actif ? 'actif' : 'suspendu')),
            h('div', { class: 'compte-champs' },
              h('label', {}, 'Rôle', h('select', { class: 'champ', disabled: moi && !autresAdmins, title: moi && !autresAdmins ? 'Nommez d’abord un autre administrateur' : '',
                onchange: async (e) => changerRole(p, e.target.value, e.target) }, ROLES.map(([v, t]) => h('option', { value: v, selected: p.role === v }, t)))),
              h('label', {}, 'Enseignant lié', h('select', { class: 'champ', onchange: async (e) => {
                try {
                  if (lie) await db.modifier('enseignants', lie.id, { profil_id: null });
                  if (e.target.value) await db.modifier('enseignants', e.target.value, { profil_id: p.id });
                  toast('Enregistré'); await dessiner();
                } catch (x) { erreur(x); }
              } }, h('option', { value: '' }, '— aucun —'), [...(lie ? [lie] : []), ...libres].map((x) => h('option', { value: x.id, selected: lie && lie.id === x.id }, x.nom))))),
            h('div', { class: 'compte-pied' },
              lie ? h('span', { class: 'mats-compte' }, ctx.matieres.filter((m) => (lie.matieres || []).map(Number).includes(m.id))
                .map((m) => h('i', { style: { background: m.couleur }, title: m.nom }, ctx.codeMat(m)))) : h('span', { class: 'gris' }, 'aucune matière'),
              moi ? null : h('button', { class: 'btn petit', onclick: () => nouveauCode(p) }, '🔑  Nouveau code')));
        })),
        h('p', { class: 'aide' }, 'Suspendre un compte coupe immédiatement son accès. Pour supprimer définitivement un compte : Supabase → Authentication → Users.')));
  }

  async function changerRole(p, role, sel) {
    const moi = p.id === ctx.profil.id;
    if (moi && role !== 'admin' && !(await confirmer('Quitter le rôle d’administrateur',
      'Vous ne pourrez plus accéder à l’administration ; un autre administrateur pourra vous redonner ce rôle. Continuer ?', 'Confirmer'))) { sel.value = p.role; return; }
    try {
      await db.modifier('profils', p.id, { role });
      toast('Rôle enregistré');
      if (moi) { ctx.profil.role = role; location.hash = '#/accueil'; return ctx.recharger(); }
      await dessiner();
    } catch (x) { erreur(x); sel.value = p.role; }
  }

  // ------------------------------------------------------------------------------------- administrateurs
  function ongletAdmins(profils) {
    const admins = profils.filter((p) => p.role === 'admin'), autres = profils.filter((p) => p.role !== 'admin' && p.actif);
    const choix = h('select', { class: 'champ' }, h('option', { value: '' }, '— choisir un compte —'),
      autres.map((p) => h('option', { value: p.id }, `${p.nom || identifiantDe(p.email)} (${identifiantDe(p.email)})`)));
    return h('div', {},
      h('section', { class: 'bloc' }, h('h2', {}, '🛡  Administrateurs'),
        h('p', { class: 'aide' }, 'Un administrateur gère les comptes, l’équipe, les élèves et la maintenance, et modifie les fiches, contrats et résultats de toutes les matières. '
          + 'Le séquençage et la progression d’une matière restent réservés à ses enseignants, administrateur compris. Il reste toujours au moins un administrateur actif.'),
        h('div', { class: 'grille-comptes' }, admins.map((p) => {
          const moi = p.id === ctx.profil.id;
          return h('article', { class: 'carte-compte admin' + (moi ? ' moi' : '') },
            h('div', { class: 'compte-tete' }, h('span', { class: 'avatar petit admin' }, initiales(p.nom || p.email)),
              h('div', { class: 'qui' }, h('b', {}, p.nom || identifiantDe(p.email), moi ? h('span', { class: 'vous' }, ' · vous') : null), h('span', {}, identifiantDe(p.email))),
              h('button', { class: 'btn petit', disabled: admins.filter((x) => x.actif).length <= 1, title: admins.length <= 1 ? 'Nommez d’abord un autre administrateur' : '',
                onclick: async () => changerRole(p, 'enseignant', {}) }, moi ? 'Quitter ce rôle' : 'Retirer')));
        }))),
      h('section', { class: 'bloc carte-ajout' }, h('h2', {}, '＋  Nommer un administrateur'),
        h('p', { class: 'aide' }, 'Pour changer d’administrateur : nommez d’abord le nouveau, puis retirez l’ancien (ou « Quitter ce rôle » sur votre propre carte).'),
        h('div', { class: 'formulaire ligne' }, h('label', {}, 'Compte', choix),
          h('button', { class: 'btn principal', onclick: async () => {
            const p = autres.find((x) => x.id === choix.value);
            if (!p) return erreur(new Error('Choisissez un compte.'));
            if (!(await confirmer('Nommer un administrateur', `Donner le rôle d’administrateur à ${p.nom || identifiantDe(p.email)} ?`, 'Nommer'))) return;
            try { await db.modifier('profils', p.id, { role: 'admin' }); toast('Administrateur nommé'); await dessiner(); } catch (x) { erreur(x); }
          } }, 'Nommer administrateur'))));
  }

  // ------------------------------------------------------------------------------------- maintenance
  function ongletMaintenance(etat, actifs) {
    const ferme = !!etat?.maintenance;
    const msg = h('textarea', { class: 'champ', rows: 3, placeholder: 'ex. Mise à jour de l’application : le site rouvre ce soir à 18 h.' });
    msg.value = etat?.message || '';
    return h('section', { class: 'bloc maintenance ' + (ferme ? 'ferme' : 'ouvert') },
      h('div', { class: 'etat-site' }, h('span', { class: 'gros' }, ferme ? '🔒' : '🟢'),
        h('div', {}, h('h2', {}, ferme ? 'Site fermé pour maintenance' : 'Site ouvert'),
          h('p', {}, ferme ? `Depuis le ${new Date(etat.depuis).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
            + ' : seuls les administrateurs peuvent se connecter ; les autres voient le message ci-dessous.'
            : `Tous les comptes actifs (${actifs.length}) peuvent se connecter.`))),
      h('label', { class: 'msg-maintenance' }, 'Message affiché aux collègues', msg),
      h('div', { class: 'ligne-actions' },
        ferme ? h('button', { class: 'btn principal', onclick: () => basculer(false) }, '🟢  Rouvrir le site')
          : h('button', { class: 'btn danger', onclick: () => basculer(true) }, '🔒  Fermer le site pour maintenance'),
        ferme ? h('button', { class: 'btn', onclick: () => basculer(true) }, 'Mettre à jour le message') : null),
      h('p', { class: 'aide' }, 'Pendant la maintenance, les collègues déjà connectés sont arrêtés à leur action suivante (au plus tard dans la minute) ; leurs données ne sont pas touchées. '
        + 'Pensez à rouvrir le site ensuite.'));
    async function basculer(fermer) {
      if (fermer && !ferme && !(await confirmer('Fermer le site', 'Fermer le site à tous les comptes sauf les administrateurs ?', 'Fermer'))) return;
      try { await db.rpc('mode_maintenance', { actif: fermer, texte: msg.value.trim() }); toast(fermer ? 'Site fermé pour maintenance' : 'Site rouvert'); await verifierSite(); await ctx.recharger(); }
      catch (x) { erreur(x); }
    }
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
        vider(corps, h('table', { class: 'liste auto' },
          h('thead', {}, h('tr', {}, ['Compte', 'Connexions', 'Temps total', 'Temps moyen', 'Dernière connexion'].map((t) => h('th', {}, t)))),
          h('tbody', {}, lignes.map(({ p, b }) => h('tr', { class: 'cliquable' + (p.actif ? '' : ' arret'), title: 'Voir le détail des connexions', onclick: () => detail(p) },
            h('td', {}, h('b', {}, p.nom || identifiantDe(p.email)), h('br'), h('small', {}, identifiantDe(p.email) + ' · ' + nomRole(p.role))),
            h('td', { class: 'centre' }, Number(b.nb)),
            h('td', { class: 'centre' }, Number(b.nb) ? duree(Number(b.secondes)) : '—'),
            h('td', { class: 'centre' }, Number(b.nb) ? duree(Number(b.secondes) / Number(b.nb)) : '—'),
            h('td', {}, ilya(b.derniere)))))),
          await graphiques(d, lignes));
      } catch (e) {
        vider(corps, h('p', { class: 'aide' }, 'Suivi indisponible : exécutez le fichier 9_connexions.sql dans Supabase. (' + e.message + ')'));
      }
    }
    // connexions par jour (ou par semaine sur une longue période) et temps total par compte
    async function graphiques(depuis, lignes) {
      const toutes = await db.lire('connexions', `debut=gte.${depuis.toISOString()}&order=debut`);
      const jours = Math.ceil((Date.now() - depuis) / 86400000);
      const parSemaine = jours > 45;
      const cle = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); if (parSemaine) x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
      const debut = new Date(Math.max(depuis.getTime(), toutes.length ? cle(toutes[0].debut) : depuis.getTime()));
      const cases = [];
      for (let t = cle(debut); t <= Date.now(); t += (parSemaine ? 7 : 1) * 86400000) cases.push(t);
      const n = new Map(cases.map((t) => [t, 0]));
      toutes.forEach((c) => { const k = cle(c.debut); if (n.has(k)) n.set(k, n.get(k) + 1); });
      const lib = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
      return h('section', { class: 'graphiques' },
        carteGraph(parSemaine ? 'Connexions par semaine' : 'Connexions par jour', 'tous les comptes', colonnes(cases.slice(-40).map((t) => ({
          label: lib(t), valeur: n.get(t), info: `${parSemaine ? 'Semaine du ' : ''}${new Date(t).toLocaleDateString('fr-FR', { weekday: parSemaine ? undefined : 'long', day: 'numeric', month: 'long' })} : ${n.get(t)} connexion(s)` })),
        { largeur: 640 })),
        carteGraph('Temps passé par compte', 'sur la période', barresH(lignes.filter(({ b }) => Number(b.nb)).sort((x, y) => Number(y.b.secondes) - Number(x.b.secondes))
          .map(({ p, b }) => ({ label: p.nom || identifiantDe(p.email), valeur: Number(b.secondes) / 3600, info: `${p.nom || identifiantDe(p.email)} : ${duree(Number(b.secondes))} en ${b.nb} connexion(s)` })),
        { format: (v) => duree(v * 3600) })));
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

  // ------------------------------------------------------------------------------------- sauvegarde et restauration
  async function telechargerSauvegarde() {
    const d = await db.rpc('sauvegarde');
    const n = Object.values(d.tables).reduce((a, t) => a + t.length, 0);
    const t = new Date(), z = (n) => String(n).padStart(2, '0'), date = `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}_${z(t.getHours())}h${z(t.getMinutes())}`;
    telecharger(`sauvegarde_pilotage_scbh_${date}.json`, JSON.stringify(d), 'application/json');
    return n;
  }
  function sauvegarde() {
    const fichier = h('input', { type: 'file', accept: '.json,application/json', class: 'champ' });
    const etat = h('p', { class: 'aide' });
    return h('div', { class: 'grille-sauvegarde' },
      h('section', { class: 'bloc sauvegarde' }, h('div', { class: 'tete-carte' }, h('span', { class: 'gros' }, '💾'), h('h2', {}, 'Télécharger une sauvegarde')),
        h('p', {}, 'Un fichier contenant toutes les données du site : promotions, élèves, matières et équipe, séquençages, progression, fiches, contrats, notes, résultats, appréciations, commentaires et référentiel.'),
        h('p', { class: 'aide' }, 'Les comptes de connexion et leurs codes ne sont pas dans le fichier. Conseil : une sauvegarde par mois, et avant chaque grosse modification. Gardez le fichier en lieu sûr : il contient des données personnelles des élèves.'),
        h('button', { class: 'btn principal', onclick: async (e) => {
          e.target.disabled = true;
          try { const n = await telechargerSauvegarde(); toast(`Sauvegarde téléchargée (${n} lignes)`); } catch (x) { erreur(x); } finally { e.target.disabled = false; }
        } }, '⬇  Télécharger la sauvegarde complète')),
      h('section', { class: 'bloc sauvegarde restauration' }, h('div', { class: 'tete-carte' }, h('span', { class: 'gros' }, '♻'), h('h2', {}, 'Restaurer une sauvegarde')),
        h('p', {}, 'Remet le site exactement dans l’état du fichier choisi. ', h('b', {}, 'Toutes les données actuelles sont remplacées'), ' (les comptes de connexion sont conservés ; l’historique des modifications est vidé).'),
        h('p', { class: 'aide' }, 'Par sécurité, une sauvegarde de l’état actuel est d’abord téléchargée automatiquement. Fermez le site pour maintenance pendant l’opération si des collègues sont connectés.'),
        h('div', { class: 'ligne-actions' }, fichier, h('button', { class: 'btn danger', onclick: async (e) => {
          const f = fichier.files[0];
          if (!f) return erreur(new Error('Choisissez d’abord un fichier de sauvegarde (.json).'));
          let d;
          try { d = JSON.parse(await f.text()); } catch { return erreur(new Error('Ce fichier n’est pas lisible.')); }
          if (d?.format !== 'pilotage-scbh-sauvegarde' || !d.tables) return erreur(new Error('Ce fichier n’est pas une sauvegarde du site.'));
          const quand = new Date(d.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const resume = `${d.tables.promotions?.length || 0} promotion(s), ${d.tables.eleves?.length || 0} élève(s), ${d.tables.sequences?.length || 0} séquence(s), ${d.tables.seances?.length || 0} séance(s), ${d.tables.notes?.length || 0} note(s)`;
          if (!(await confirmer('Restaurer une sauvegarde', `Remplacer TOUTES les données actuelles par la sauvegarde du ${quand} (${resume}) ? Une sauvegarde de l’état actuel va d’abord être téléchargée.`, 'Restaurer'))) return;
          e.target.disabled = true; etat.textContent = 'Sauvegarde de l’état actuel…';
          try {
            await telechargerSauvegarde();
            etat.textContent = 'Restauration en cours…';
            const r = await db.rpc('restaurer', { d });
            const n = Object.values(r).reduce((a, x) => a + x, 0);
            etat.textContent = `Restauration terminée : ${n} lignes remises en place.`;
            toast('Sauvegarde restaurée : la page va se recharger'); setTimeout(() => location.reload(), 1800);
          } catch (x) { etat.textContent = ''; erreur(x); } finally { e.target.disabled = false; }
        } }, '♻  Restaurer ce fichier')), etat));
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
