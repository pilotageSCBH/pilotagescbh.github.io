// Élèves de la promotion : liste, effectifs ; ajout et modification par l'administrateur.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { anneau, barresH, carteGraph } from '../graphiques.js';
import { h, vider, toast, erreur, fenetre, confirmer, dateFr, imprimer } from '../ui.js';

const CHAMPS = [
  ['nom', 'NOM'], ['prenom', 'Prénom'], ['naissance', 'Né(e) le', 'date'], ['statut', 'Statut', ['Scolaire', 'Apprenti']],
  ['telephone', 'Téléphone'], ['mail', 'Mail', 'email'], ['commune', "Commune d'origine"], ['code_postal', 'Code postal'],
  ['departement', 'Département'], ['entreprise', 'Entreprise'], ['entreprise_commune', 'Commune de l’entreprise'],
  ['entreprise_cp', 'Code postal de l’entreprise'], ['etudes', 'Études précédentes'], ['etablissement', 'Établissement précédent'],
  ['projet', 'Projet post-BTS'], ['arret', 'Arrêt de la formation (date ou motif ; vide = en formation)'],
];

export async function pageEleves(zone, _arg, ctx) {
  const admin = ctx.estAdmin();

  async function dessiner() {
    const eleves = await db.lire('eleves', `promotion_id=eq.${ctx.promo.id}&order=nom,prenom`);
    eleves.sort((a, b) => (!!a.arret - !!b.arret) || a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
    const actifs = eleves.filter((e) => !e.arret);
    const app = actifs.filter((e) => e.statut === 'Apprenti').length;
    let n = 0;
    vider(zone,
      h('header', { class: 'entete-page' },
        h('div', {}, h('h1', {}, 'Élèves de la promotion'), h('p', { class: 'sous-titre' }, 'Promotion ' + ctx.promo.libelle)),
        h('div', { class: 'actions-page' },
          admin ? boutonAnnuler(ctx, 'eleves') : null,
          h('button', { class: 'btn', onclick: () => imprimer('A4 landscape') }, '🖶  Imprimer la liste'),
          admin ? h('button', { class: 'btn principal', onclick: () => formulaire(null) }, '＋  Ajouter un élève') : null)),
      h('section', { class: 'chiffres-cles' },
        h('div', { class: 'tuile' }, h('strong', {}, actifs.length), h('span', {}, 'en formation')),
        h('div', { class: 'tuile' }, h('strong', {}, app), h('span', {}, 'apprentis')),
        h('div', { class: 'tuile' }, h('strong', {}, actifs.length - app), h('span', {}, 'scolaires')),
        eleves.length > actifs.length ? h('div', { class: 'tuile' }, h('strong', {}, eleves.length - actifs.length), h('span', {}, 'arrêts')) : null),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'liste' },
        h('thead', {}, h('tr', {}, ['N°', 'NOM Prénom', 'Né(e) le', 'Statut', 'Contact', 'Origine', 'Entreprise', 'Parcours', 'Arrêt'].map((t) => h('th', {}, t)))),
        h('tbody', {}, eleves.map((e) => h('tr', { class: (e.arret ? 'arret ' : '') + (admin ? 'cliquable' : ''), onclick: admin ? () => formulaire(e) : null,
          title: admin ? 'Cliquer pour modifier' : null },
          h('td', { class: 'num' }, e.arret ? '' : ++n),
          h('td', {}, h('b', {}, e.nom), ' ', e.prenom),
          h('td', {}, dateFr(e.naissance)),
          h('td', {}, h('span', { class: 'badge ' + (e.statut === 'Apprenti' ? 'apprenti' : 'scolaire') }, e.statut)),
          h('td', { class: 'petit' }, e.telephone, h('br'), e.mail),
          h('td', { class: 'petit' }, e.commune, ' ', e.code_postal, h('br'), e.departement),
          h('td', { class: 'petit' }, e.entreprise, h('br'), [e.entreprise_commune, e.entreprise_cp].filter(Boolean).join(' ')),
          h('td', { class: 'petit' }, e.etudes, h('br'), e.etablissement, e.projet ? h('div', {}, '→ ' + e.projet) : null),
          h('td', { class: 'petit' }, e.arret)))))),
      eleves.length === 0 ? h('p', { class: 'vide' }, 'Aucun élève saisi.') : null,
      actifs.length ? graphiques(actifs, app) : null);
  }

  // répartitions : statut, département d'origine, études précédentes (élèves en formation)
  function graphiques(actifs, app) {
    const repartir = (cle) => {
      const m = new Map(); actifs.forEach((e) => { const v = (e[cle] || '').trim() || 'Non renseigné'; m.set(v, (m.get(v) || 0) + 1); });
      return [...m].sort((a, b) => b[1] - a[1]).map(([label, valeur]) => ({ label, valeur, couleur: label === 'Non renseigné' ? 'var(--g-ne)' : 'var(--g1)', info: `${label} : ${valeur} élève(s)` }));
    };
    return h('section', { class: 'graphiques' },
      carteGraph('Statut', `${actifs.length} élève(s) en formation`, anneau([{ nom: 'Scolaires', valeur: actifs.length - app, couleur: 'var(--g1)' },
        { nom: 'Apprentis', valeur: app, couleur: 'var(--g2)' }], { centre: String(actifs.length), sous: 'élèves' })),
      carteGraph('Département d’origine', 'nombre d’élèves', barresH(repartir('departement'), { format: (v) => String(v) })),
      carteGraph('Études précédentes', 'nombre d’élèves', barresH(repartir('etudes'), { format: (v) => String(v) })));
  }

  async function formulaire(e) {
    const val = {};
    const champs = CHAMPS.map(([k, lab, t]) => {
      let el;
      if (Array.isArray(t)) el = h('select', { class: 'champ' }, t.map((o) => h('option', { selected: (e?.[k] || 'Scolaire') === o }, o)));
      else el = h('input', { class: 'champ', type: t || 'text', value: e?.[k] ?? '' });
      val[k] = el;
      return h('label', { class: k === 'arret' ? 'large' : '' }, lab, el);
    });
    const boutons = [{ texte: 'Annuler', valeur: false }];
    if (e) boutons.unshift({ texte: 'Supprimer l’élève', classe: 'danger gauche', action: async () => {
      if (!(await confirmer('Supprimer un élève', `Supprimer définitivement ${e.nom} ${e.prenom} ? (Pour un élève qui quitte la formation, renseignez plutôt « Arrêt ».)`, 'Supprimer'))) return false;
      await db.supprimer('eleves', e.id); toast('Élève supprimé'); return 'maj';
    } });
    boutons.push({ texte: 'Enregistrer', classe: 'principal', action: async () => {
      const d = Object.fromEntries(Object.entries(val).map(([k, el]) => [k, el.value.trim()]));
      d.nom = d.nom.toUpperCase();
      if (!d.nom && !d.prenom) throw new Error('Saisissez au moins le nom ou le prénom.');
      d.naissance = d.naissance || null;
      if (e) await db.modifier('eleves', e.id, d); else await db.ajouter('eleves', { ...d, promotion_id: ctx.promo.id });
      toast('Enregistré');
      return 'maj';
    } });
    const r = await fenetre(e ? `${e.nom} ${e.prenom}` : 'Nouvel élève', h('div', { class: 'formulaire' }, champs), boutons, { large: true });
    if (r === 'maj') await dessiner();
  }

  try { await dessiner(); } catch (e) { erreur(e); throw e; }
}
