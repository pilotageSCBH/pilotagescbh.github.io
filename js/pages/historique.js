// Historique des modifications de la promotion : qui a modifié quoi, et quand (noté automatiquement par la base).
import { db } from '../api.js';
import { h, vider, fenetre } from '../ui.js';

const CHAMPS = {
  titre: 'titre', duree: 'durée', objectif_inter: 'objectif intermédiaire', objectifs_ops: 'objectifs opérationnels', cours: 'cours mobilisés',
  competences: 'compétences', savoirs: 'savoirs', intitule: 'intitulé', objectif: 'objectif principal', numero: 'numéro',
  seance_id: 'séance', texte: 'texte libre', note: 'note', vacances: 'vacances / autres', apprentis: 'apprentis', evenement: 'évènement',
  valeur: 'note', coefficient: 'coefficient', actif: 'critère retiré / remis', phases: 'déroulement', activites: 'activités et tâches',
  situation: 'situation professionnelle', prerequis: 'prérequis', modalites: 'modalités d’évaluation', ressources: 'ressources', bilan: 'bilan',
  salle: 'salle', materiel: 'matériel', evaluation: 'évaluation', differenciation: 'différenciation', date_eval: 'date', forme: 'forme',
  prerequis_texte: 'autres prérequis', libelle: 'intitulé', bareme: 'noté sur', coef_resultat: 'coefficient (résultats)', lieu: 'lieu', organisation: 'organisation', nom: 'nom', prenom: 'prénom', statut: 'statut', arret: 'arrêt de formation',
};
const TYPES = {
  tout: ['Tout', null], sequencage: ['Séquençages', ['sequences', 'seances']],
  progression: ['Progression et calendrier', ['progression_cases', 'progression_semaines', 'progression_jours']],
  fiches: ['Fiches et contrats', ['fiches_sequence', 'fiches_seance', 'contrats', 'criteres']], notes: ['Notes des élèves', ['notes']],
  resultats: ['Résultats intermédiaires', ['evaluations', 'resultats']], eleves: ['Élèves', ['eleves']], couverture: ['Couvertures', ['couverture']],
};
const ACTIONS = { ajout: ['ajout', 'ajout'], modification: ['modification', 'modif'], suppression: ['suppression', 'suppr'] };

export async function pageHistorique(zone, _arg, ctx) {
  let filtre = { type: 'tout', matiere: 'toutes', qui: 'tous' };
  let lignes = [];
  let limite = 300;

  async function charger() {
    lignes = await db.lire('journal', `promotion_id=eq.${ctx.promo.id}&order=quand.desc&limit=${limite}`);
  }
  // « semaine 5 » / « jour 37 » (rangs dans le calendrier de la promotion) → date lisible
  const Y = ctx.promo.annee_debut;
  const lundi = (w) => { const d = new Date(Y + Math.floor(w / 45), 8, 1); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (w % 45)); return d; };
  const lisible = (c) => c
    .replace(/semaine (\d+)$/, (_, w) => 'semaine du ' + lundi(Number(w)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))
    .replace(/jour (\d+)$/, (_, j) => { const d = lundi(Math.floor(j / 7)); d.setDate(d.getDate() + (j % 7)); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); });
  const texte = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.length ? (typeof v[0] === 'object' ? `${v.length} élément(s)` : v.join(', ')) : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    if (v === true) return 'oui'; if (v === false) return 'non';
    return String(v);
  };

  function dessiner() {
    const noms = [...new Set(lignes.map((l) => l.qui_nom).filter(Boolean))].sort();
    const visibles = lignes.filter((l) => (filtre.type === 'tout' || TYPES[filtre.type][1].includes(l.table_nom))
      && (filtre.matiere === 'toutes' || String(l.matiere_id) === filtre.matiere) && (filtre.qui === 'tous' || l.qui_nom === filtre.qui));
    const jours = [];
    for (const l of visibles) {
      const j = new Date(l.quand).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (!jours.length || jours[jours.length - 1].j !== j) jours.push({ j, l: [] });
      jours[jours.length - 1].l.push(l);
    }
    const sel = (cle, options) => h('select', { class: 'champ choix-mat', onchange: (e) => { filtre[cle] = e.target.value; dessiner(); } },
      options.map(([v, t]) => h('option', { value: v, selected: filtre[cle] === v }, t)));
    vider(zone,
      h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Historique des modifications'),
        h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  ${lignes.length} dernière(s) modification(s)`)),
        h('div', { class: 'actions-page filtres' },
          sel('type', Object.entries(TYPES).map(([k, v]) => [k, v[0]])),
          sel('matiere', [['toutes', 'Toutes les matières'], ...ctx.matieres.map((m) => [String(m.id), m.nom])]),
          sel('qui', [['tous', 'Tout le monde'], ...noms.map((n) => [n, n])]))),
      visibles.length === 0 ? h('p', { class: 'vide' }, 'Aucune modification enregistrée pour ces critères.') : null,
      jours.map((g) => h('section', { class: 'jour-histo' }, h('h2', {}, g.j),
        h('ul', { class: 'liste-histo' }, g.l.map((l) => {
          const m = ctx.matieres.find((x) => x.id === l.matiere_id);
          return h('li', { onclick: () => detail(l), title: 'Voir le détail' },
            h('span', { class: 'heure' }, new Date(l.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
            h('span', { class: 'qui' }, l.qui_nom || '—'),
            h('span', { class: 'act ' + ACTIONS[l.action][1] }, ACTIONS[l.action][0]),
            m ? h('span', { class: 'mat', style: { '--couleur': m.couleur } }, m.nom) : null,
            h('span', { class: 'ctx' }, lisible(l.contexte)),
            l.champs?.length ? h('span', { class: 'champs' }, l.champs.map((c) => CHAMPS[c] || c).join(', ')) : null);
        })))),
      lignes.length >= limite ? h('button', { class: 'btn', onclick: async () => { limite += 300; await charger(); dessiner(); } }, 'Afficher les modifications plus anciennes') : null);
  }

  // prérequis des séances : liste de numéros internes → nombre de séances
  const texteDe = (k, v) => (k === 'prerequis' && l_estSeance(v) ? `${v.length} séance(s) prérequise(s)` : texte(v));
  const l_estSeance = (v) => Array.isArray(v) && v.length && typeof v[0] === 'number';
  function detail(l) {
    const cles = l.action === 'modification' ? l.champs : Object.keys(l.apres || l.avant || {}).filter((k) => CHAMPS[k]);
    fenetre(lisible(l.contexte), h('div', {},
      h('p', { class: 'aide' }, `${ACTIONS[l.action][0]} par ${l.qui_nom || '—'} le ${new Date(l.quand).toLocaleString('fr-FR')}`),
      h('table', { class: 'table-fiche' }, h('thead', {}, h('tr', {}, h('th', {}, 'Champ'), l.action !== 'ajout' ? h('th', {}, 'Avant') : null, l.action !== 'suppression' ? h('th', {}, 'Après') : null)),
        h('tbody', {}, cles.map((k) => h('tr', {}, h('td', { class: 'fort' }, CHAMPS[k] || k),
          l.action !== 'ajout' ? h('td', { class: 'pre' }, texteDe(k, l.avant?.[k])) : null,
          l.action !== 'suppression' ? h('td', { class: 'pre' }, texteDe(k, l.apres?.[k])) : null))))),
    [{ texte: 'Fermer', valeur: true }], { large: true });
  }

  await charger();
  dessiner();
}
