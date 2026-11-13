// Espace élèves · comptes de la promotion : création des comptes (identifiant et code provisoire générés ici),
// fiches de connexion en PDF (une par élève, avec QR code vers le site), nouveau code, désactivation ; suivi des connexions.
// Les codes provisoires ne sont jamais gardés : ils ne figurent que sur les fiches. #/eleves/acces
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';
import { envoyerPDF } from './fiches.js';
import { nomFichier } from '../echange.js';
import { apercuEleve } from '../app.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function codeProvisoire() {
  const t = new Uint32Array(8); crypto.getRandomValues(t);
  const c = [...t].map((x) => ALPHABET[x % ALPHABET.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}
const base = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const adresseSite = () => location.origin + location.pathname.replace(/index\.html$/, '');
const dateLongue = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const quand = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export async function pageAcces(zone, ctx) {
  const admin = ctx.estAdmin(), P = ctx.promo;
  if (!ctx.peutEcrire()) { vider(zone, h('p', { class: 'vide' }, 'Page réservée aux enseignants.')); return; }
  let eleves, comptes, consult;
  try {
    [eleves, comptes, consult] = await Promise.all([db.lire('eleves', `promotion_id=eq.${P.id}&order=nom,prenom`), db.lire('comptes_eleves_info'),
      db.lire('consultations_eleves', 'order=quand.desc&limit=3000')]);
  } catch (e) {
    vider(zone, h('div', { class: 'erreur-page' }, h('h2', {}, 'Espace élèves pas encore installé'),
      h('p', {}, admin ? 'Exécutez le script « 27_espace_eleves.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord installer l’espace élèves.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const C = new Map(comptes.map((c) => [c.eleve_id, c]));
  const compteDe = (e) => C.get(e.id) || (e.origine_eleve_id ? C.get(e.origine_eleve_id) : null);
  const consultDe = (e) => consult.filter((x) => x.eleve_id === e.id);
  const actifs = eleves.filter((e) => !e.arret);
  const coches = new Set();
  const finAcces = `${P.annee_debut + 2}-07-31`;

  const etat = (c) => !c ? ['aucun', 'Pas de compte', 'gris'] : !c.actif ? ['off', 'Désactivé', 'rouge'] : c.bloque_jusqua && new Date(c.bloque_jusqua) > new Date() ? ['bloque', 'Bloqué 15 min (codes faux)', 'orange']
    : c.doit_changer ? ['provisoire', 'Code provisoire (jamais connecté)', 'orange'] : ['ok', 'Actif', 'vert'];

  function dessiner() {
    const n = { aucun: 0, provisoire: 0, ok: 0 };
    actifs.forEach((e) => { const k = etat(compteDe(e))[0]; if (k in n) n[k]++; });
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '🎓  Espace élèves · comptes'),
        h('p', { class: 'sous-titre' }, `Promotion ${P.libelle} · accès valable jusqu’au ${dateLongue(finAcces)} (un mois après la fin de formation)`)),
        h('div', { class: 'actions-page' }, h('a', { class: 'btn', href: '#/eleves' }, '← Liste des élèves'),
          h('button', { class: 'btn', title: 'Voir l’espace élève de cette promotion comme un élève fictif (rien n’est enregistré)', onclick: () => apercuEleve(P.id) }, '👁  Voir comme un élève'),
          admin ? h('button', { class: 'btn principal', onclick: creerLot }, `🔑  Créer les comptes et les fiches${coches.size ? ` (${coches.size})` : ''}`) : null)),
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, n.ok), h('span', {}, 'comptes actifs')),
        h('div', { class: 'tuile' }, h('strong', {}, n.provisoire), h('span', {}, 'en attente de 1re connexion')),
        h('div', { class: 'tuile' }, h('strong', {}, n.aucun), h('span', {}, 'sans compte'))),
      admin ? h('p', { class: 'aide' }, 'Cochez des élèves (ou aucun : tous ceux qui n’ont pas de compte) puis « Créer les comptes et les fiches » : le site crée les identifiants et des codes provisoires, puis produit le PDF des fiches de connexion à distribuer. Les codes provisoires ne sont jamais conservés : gardez le PDF jusqu’à la distribution.')
        : h('p', { class: 'aide' }, '🔒 Seul l’administrateur crée les comptes et produit les fiches de connexion des élèves. Vous voyez ici qui se connecte et quels documents sont consultés ; « 👁 Voir comme un élève » vous montre l’espace élève de la promotion.'),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'liste comptes-eleves' },
        h('thead', {}, h('tr', {}, [admin ? h('input', { type: 'checkbox', 'aria-label': 'Tout cocher', checked: coches.size > 0 && coches.size === actifs.length, onchange: (ev) => { actifs.forEach((e) => (ev.target.checked ? coches.add(e.id) : coches.delete(e.id))); dessiner(); } }) : '',
          'Élève', 'Identifiant', 'État', 'Dernière connexion', 'Documents consultés', admin ? 'Actions' : ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, eleves.map((e) => {
          const c = compteDe(e), [k, lib, coul] = etat(c), cs = consultDe(e), docs = cs.filter((x) => x.quoi === 'document');
          return h('tr', { class: e.arret ? 'arret' : '' },
            h('td', {}, admin && !e.arret ? h('input', { type: 'checkbox', checked: coches.has(e.id), 'aria-label': `${e.prenom} ${e.nom}`, onchange: (ev) => { ev.target.checked ? coches.add(e.id) : coches.delete(e.id); dessiner(); } }) : ''),
            h('td', {}, h('b', {}, e.nom), ' ', e.prenom, e.arret ? h('div', { class: 'petit gris' }, 'arrêt : ' + e.arret) : null, c && c.eleve_id !== e.id ? h('div', { class: 'petit gris' }, 'compte de la promotion précédente') : null),
            h('td', {}, c ? h('code', {}, c.identifiant) : '—'),
            h('td', {}, h('span', { class: 'etat-compte ' + coul }, lib)),
            h('td', { class: 'petit' }, quand(c?.derniere_connexion)),
            h('td', { class: 'petit' }, docs.length ? h('button', { class: 'lien', type: 'button', onclick: () => voirConsultations(e, cs) }, `${docs.length} ouverture(s)`) : '—'),
            admin ? h('td', { class: 'actions-compte' }, e.arret ? null : [
              h('button', { class: 'btn petit', type: 'button', onclick: () => nouveauCode(e, c) }, c ? '🔑 Nouveau code' : '🔑 Créer'),
              c ? h('button', { class: 'btn petit', type: 'button', onclick: () => activer(c, !c.actif) }, c.actif ? 'Désactiver' : 'Réactiver') : null,
              c ? h('button', { class: 'btn petit danger', type: 'button', title: 'Supprimer le compte', onclick: () => supprimer(e, c) }, '✖') : null]) : null);
        })))));
  }

  // identifiant : prenom.nom (sans accents), suivi d'un numéro en cas d'homonyme
  async function identifiantPour(e, pris) {
    const b = `${base(e.prenom)}.${base(e.nom)}`.replace(/^\.|\.$/g, '').slice(0, 50) || 'eleve';
    let id = b, i = 2;
    while (pris.has(id)) id = `${b}${i++}`;
    pris.add(id); return id;
  }
  async function creerComptes(liste) {
    const tous = await db.lire('comptes_eleves_info');
    const pris = new Set(tous.map((c) => c.identifiant));
    const fiches = [];
    for (const e of liste) {
      const c = compteDe(e);
      const ident = c ? c.identifiant : await identifiantPour(e, pris);
      const code = codeProvisoire();
      await db.rpc('eleve_creer_compte', { e: c ? c.eleve_id : e.id, ident, code });
      fiches.push({ e, ident, code });
    }
    return fiches;
  }
  async function creerLot() {
    const cibles = (coches.size ? actifs.filter((e) => coches.has(e.id)) : actifs.filter((e) => !compteDe(e)));
    if (!cibles.length) { toast('Tous les élèves ont déjà un compte : cochez ceux qui doivent recevoir un nouveau code.', 'erreur'); return; }
    const avecCompte = cibles.filter((e) => compteDe(e)).length;
    if (!(await confirmer('Créer les comptes et les fiches', `${cibles.length} fiche(s) de connexion vont être produites${avecCompte ? `, dont ${avecCompte} avec un NOUVEAU code (l’ancien ne fonctionnera plus)` : ''}. Les codes provisoires n’apparaissent que sur ces fiches : gardez le PDF jusqu’à la distribution.`, 'Créer'))) return;
    try {
      const f = await creerComptes(cibles);
      coches.clear();
      await telechargerFiches(f);
      toast(`${f.length} compte(s) prêts`);
      pageAcces(zone, ctx);
    } catch (e) { erreur(e); pageAcces(zone, ctx); }
  }
  async function nouveauCode(e, c) {
    if (c && !(await confirmer('Nouveau code', `Donner un nouveau code provisoire à ${e.prenom} ${e.nom} ? L’ancien code ne fonctionnera plus ; une nouvelle fiche de connexion est produite.`, 'Nouveau code'))) return;
    try { await telechargerFiches(await creerComptes([e])); toast('Nouvelle fiche prête'); pageAcces(zone, ctx); } catch (x) { erreur(x); }
  }
  async function activer(c, oui) {
    try { await db.rpc('eleve_activer_compte', { e: c.eleve_id, oui }); toast(oui ? 'Compte réactivé' : 'Compte désactivé'); pageAcces(zone, ctx); } catch (x) { erreur(x); }
  }
  async function supprimer(e, c) {
    if (!(await confirmer('Supprimer le compte', `Supprimer le compte de ${e.prenom} ${e.nom} ? L’élève ne pourra plus se connecter (ses notes ne sont pas touchées).`, 'Supprimer'))) return;
    try { await db.rpc('eleve_supprimer_compte', { e: c.eleve_id }); toast('Compte supprimé'); pageAcces(zone, ctx); } catch (x) { erreur(x); }
  }
  function voirConsultations(e, cs) {
    fenetre(`Consultations · ${e.prenom} ${e.nom}`, h('div', {},
      h('ul', { class: 'liste-consultations' }, cs.slice(0, 200).map((x) => h('li', {}, h('span', { class: 'gris' }, quand(x.quand)), ' · ',
        x.quoi === 'connexion' ? 'connexion' : x.quoi === 'document' ? h('span', {}, '📄 ', x.titre || 'document') : 'QCM ' + (x.titre || ''))))),
    [{ texte: 'Fermer', classe: 'principal', valeur: true }]);
  }

  // fiches de connexion : une page A4 par élève
  async function telechargerFiches(f) {
    const site = adresseSite(), lienEleve = site + '?eleve';
    const blocs = [];
    f.forEach(({ e, ident, code }, i) => {
      if (i) blocs.push({ t: 'saut' });
      blocs.push(
        { t: 'titre', texte: 'ESPACE ÉLÈVE · FICHE DE CONNEXION', sous: `${e.prenom} ${e.nom} · promotion ${P.libelle}`, couleur: '#1E8F86' },
        { t: 'infos', paires: [['Élève', `${e.prenom} ${e.nom}`], ['Promotion', P.libelle], ['Adresse du site', site], ['Accès valable jusqu’au', dateLongue(finAcces)]] },
        { t: 'acces', titre: 'VOS CODES PERSONNELS', lignes: [['Identifiant', ident], ['Code provisoire', code]] },
        { t: 'etapes', titre: 'Première connexion', items: [
          'Scannez le QR code ci-dessous avec votre téléphone, ou tapez l’adresse du site dans votre navigateur.',
          'Sur l’écran de connexion, choisissez « 🎓 Élève ».',
          'Saisissez votre identifiant et le code provisoire ci-dessus (attention aux majuscules et minuscules).',
          'Choisissez votre propre code (8 caractères au moins) : le code provisoire ne fonctionnera plus. Retenez-le et ne le donnez à personne.',
          'Conseil : installez le site sur votre téléphone (iPhone : Safari → Partager → « Sur l’écran d’accueil » ; Android : Chrome → « Installer l’application »).'] },
        { t: 'etapes', titre: 'Dans votre espace', items: [
          'Ma semaine : les séances prévues et les prochaines évaluations.',
          'Ma formation : les séquences et séances de chaque matière, avec les documents utilisés.',
          'Mes documents : les cours, exercices, TD/TP et ressources publiés par vos enseignants.',
          'Mes résultats : vos notes, vos résultats et le niveau atteint dans chaque compétence.',
          'Mon compte : changer votre code.'] },
        { t: 'qr', liens: [{ url: lienEleve, lib: 'Page d’accueil du site' }] },
        { t: 'note', texte: 'Règles : votre identifiant et votre code sont personnels. Les documents sont réservés à votre usage pendant la formation : ne les diffusez pas. Code oublié : demandez une nouvelle fiche à l’administrateur du site. Après 5 codes faux, l’accès est bloqué 15 minutes. Votre accès se termine un mois après la fin de votre formation.' });
    });
    await envoyerPDF({ fichier: nomFichier(f.length === 1 ? `Fiche_connexion_${f[0].e.nom}_${f[0].e.prenom}.pdf` : `Fiches_connexion_${P.libelle}.pdf`), titre: 'Espace élève',
      pied: `Espace élève · Pilotage BTS SCBH · promotion ${P.libelle} · document personnel`, blocs }, 'pdf');
  }

  dessiner();
}
