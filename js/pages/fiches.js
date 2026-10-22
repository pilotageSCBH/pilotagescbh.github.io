// Fiches d'une séquence : préparation de séquence, contrat sommatif, puis pour chaque séance sa fiche de déroulement
// et son contrat formatif. Sans séquence choisie : liste des séquences de chaque matière.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, champ, erreur, heures, ajusterTout, imprimer } from '../ui.js';
import { dessinerContrat } from './contrat.js';

const PHASES = ['1. Lancement (contexte, objectifs)', '2. Découverte / recherche', '3. Structuration (synthèse)',
  '4. Application / entraînement', '5. Évaluation et bilan'];

export async function pageFiches(zone, arg, ctx) {
  const [sid, onglet = 'preparation'] = String(arg || '').split(':');
  if (!sid) return index(zone, ctx);
  const sq = (await db.lire('sequences', `id=eq.${sid}`))[0];
  if (!sq) { vider(zone, h('p', {}, 'Séquence introuvable.')); return; }
  const m = ctx.matieres.find((x) => x.id === sq.matiere_id);
  const ref = await ctx.referentiel();
  const modif = ctx.peutMatiere(m.id);
  const [seances, toutes, eleves, fs] = await Promise.all([
    db.lire('seances', `sequence_id=eq.${sq.id}&order=numero`),
    db.lire('sequences', `matiere_id=eq.${m.id}&promotion_id=eq.${sq.promotion_id}&order=numero`),
    db.lire('eleves', `promotion_id=eq.${sq.promotion_id}`),
    db.lire('fiches_sequence', `sequence_id=eq.${sq.id}`)]);
  const actifs = eleves.filter((e) => !e.arret), app = actifs.filter((e) => e.statut === 'Apprenti').length;
  const effectif = `${actifs.length} élèves (${app} apprentis · ${actifs.length - app} scolaires)`;
  const profs = ctx.enseignantsDe(m.id).join(', ') || '—';
  const promo = ctx.promotions.find((p) => p.id === sq.promotion_id)?.libelle || '';
  const remplies = seances.filter((x) => x.titre || x.objectif_inter);
  const volume = `${remplies.length} séance(s) · ${heures(remplies.reduce((a, x) => a + (Number(x.duree) || 0), 0)) || '0 h'}`;
  const ficheSeq = fs[0] || {};
  const lien = (o) => `#/fiches/${sq.id}:${o}`;

  // ------------------------------------------------------------------------------------- en-tête et onglets
  const onglets = [['preparation', 'Préparation de séquence'], ['sommatif', 'Contrat sommatif'],
    ...seances.map((x) => [`seance-${x.id}`, `Séance ${sq.numero}.${x.numero}`])];
  vider(zone,
    h('header', { class: 'entete-page ecran' },
      h('div', {}, h('h1', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), `Séquence ${sq.numero} · ${sq.intitule || 'sans intitulé'}`),
        h('p', { class: 'sous-titre' }, `${m.nom}  ·  Promotion ${promo}  ·  ${volume}`)),
      h('div', { class: 'actions-page' },
        h('select', { class: 'champ choix-mat', onchange: (e) => { location.hash = `#/fiches/${e.target.value}`; } },
          toutes.map((s) => h('option', { value: s.id, selected: s.id === sq.id }, `Séquence ${s.numero} · ${s.intitule || 'sans intitulé'}`))),
        modif ? boutonAnnuler(ctx, 'fiches') : null,
        h('button', { class: 'btn', onclick: () => imprimer('A4 portrait') }, '🖶  Imprimer'),
        h('a', { class: 'btn', href: '#/sequencage/' + m.id }, 'Séquençage'))),
    h('nav', { class: 'onglets ecran' }, onglets.map(([k, t]) => h('a', { href: lien(k), class: k === onglet ? 'actif' : '' }, t))),
    !modif ? h('p', { class: 'badge-lecture ecran' }, 'Consultation seule : vous n’enseignez pas cette matière.') : null,
    h('div', { id: 'fiche' }, h('div', { class: 'chargement' }, 'Chargement…')));
  const fiche = zone.querySelector('#fiche');

  const entete = (titre, sous) => h('div', { class: 'tete-fiche', style: { '--couleur': m.couleur } },
    h('img', { src: 'img/logo.jpg', alt: '' }), h('div', {}, h('h2', {}, titre), h('p', {}, sous)));
  const info = (lib, val) => h('div', { class: 'info' }, h('span', { class: 'lib' }, lib), h('span', { class: 'val' }, val));
  const zoneTexte = (lib, valeur, enregistrer, aide = '') => h('div', { class: 'rubrique' }, h('h3', {}, lib),
    champ(valeur || '', enregistrer, { multi: true, lecture: !modif, placeholder: modif ? aide || 'À compléter' : '' }));
  const codes = (liste, index) => (liste || []).length ? h('div', { class: 'codes-fiche' }, liste.map((c) => h('div', {}, h('b', {}, c), ' ', index[c]?.libelle || ''))) : h('span', { class: 'gris' }, '—');

  // ------------------------------------------------------------------------------------- préparation de séquence
  async function preparation() {
    const maj = (col) => (v) => db.enregistrer('fiches_sequence', [{ sequence_id: sq.id, [col]: v }], 'sequence_id');
    const taches = [...new Set(seances.flatMap((x) => (x.objectifs_ops.match(/\[(A\d+-T\d+)\]/g) || []).map((t) => t.slice(1, -1))))];
    const sugg = taches.map((t) => `${t} – ${ref.taches.find((x) => x.code === t)?.libelle || ''}`).join('\n');
    vider(fiche, h('article', { class: 'feuille' },
      entete('FICHE DE PRÉPARATION DE SÉQUENCE', `Séquence ${sq.numero} · ${sq.intitule || ''}`),
      h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif),
        info('Volume', volume)),
      h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif principal'), h('p', { class: 'fort' }, sq.objectif || '—')),
      zoneTexte('Activités et tâches du référentiel visées', ficheSeq.activites, maj('activites'), sugg ? 'Tâches citées dans les séances :\n' + sugg : ''),
      modif && sugg && !ficheSeq.activites ? h('button', { class: 'lien petit', onclick: async (e) => {
        try { await maj('activites')(sugg); ficheSeq.activites = sugg; preparation(); } catch (x) { erreur(x); } } }, '＋ reprendre les tâches citées dans les séances') : null,
      zoneTexte('Situation professionnelle / support', ficheSeq.situation, maj('situation'), 'ex. chantier fil rouge, dossier d’une affaire réelle…'),
      zoneTexte('Prérequis', ficheSeq.prerequis, maj('prerequis')),
      h('div', { class: 'rubrique' }, h('h3', {}, 'Séances de la séquence'),
        h('table', { class: 'table-fiche' }, h('thead', {}, h('tr', {}, ['N°', 'Séance', 'Durée', 'Objectif intermédiaire', 'Compétences', 'Savoirs'].map((t) => h('th', {}, t)))),
          h('tbody', {}, seances.map((x) => h('tr', {}, h('td', { class: 'num' }, `${sq.numero}.${x.numero}`), h('td', { class: 'fort' }, x.titre),
            h('td', { class: 'centre' }, heures(x.duree == null ? null : Number(x.duree))), h('td', {}, x.objectif_inter),
            h('td', { class: 'petit' }, (x.competences || []).join(' ')), h('td', { class: 'petit' }, (x.savoirs || []).join(' '))))))),
      zoneTexte('Modalités d’évaluation', ficheSeq.modalites, maj('modalites')),
      zoneTexte('Ressources et supports', ficheSeq.ressources, maj('ressources')),
      zoneTexte('Bilan de la séquence', ficheSeq.bilan, maj('bilan'), 'Après la séquence : ce qui a fonctionné, à améliorer…')));
    ajusterTout(fiche);
  }

  // ------------------------------------------------------------------------------------- contrat sommatif
  async function sommatif() {
    const corps = h('div', {});
    vider(fiche, h('article', { class: 'feuille large' },
      entete('CONTRAT · ÉVALUATION SOMMATIVE', `Séquence ${sq.numero} · ${sq.intitule || ''}`),
      h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif)),
      h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif principal'), h('p', { class: 'fort' }, sq.objectif || '—')), corps));
    await dessinerContrat(corps, { type: 'sommatif', id: sq.id, modif, ctx,
      titreGroupe: (g) => ({ code: g, libelle: ref.comp[g]?.libelle || '' }) });
  }

  // ------------------------------------------------------------------------------------- séance : déroulement + contrat formatif
  async function seance(x) {
    const f = (await db.lire('fiches_seance', `seance_id=eq.${x.id}`))[0] || {};
    const maj = (col) => (v) => db.enregistrer('fiches_seance', [{ seance_id: x.id, [col]: v }], 'seance_id');
    let phases = Array.isArray(f.phases) && f.phases.length ? f.phases : PHASES.map((p) => ({ phase: p, activite: '', enseignant: '', eleves: '', duree: '' }));
    const sauverPhases = () => db.enregistrer('fiches_seance', [{ seance_id: x.id, phases }], 'seance_id');
    const tablePhases = h('tbody', {});
    const dessinerPhases = () => {
      vider(tablePhases, phases.map((p, i) => h('tr', {},
        ['phase', 'activite', 'enseignant', 'eleves', 'duree'].map((k) => h('td', { class: k === 'phase' ? 'phase' : k === 'duree' ? 'duree' : '' },
          champ(p[k] || '', async (v) => { phases[i] = { ...phases[i], [k]: v }; await sauverPhases(); }, { multi: k !== 'duree', lecture: !modif }))),
        modif ? h('td', { class: 'ecran' }, h('button', { class: 'icone petit', title: 'Retirer cette phase', onclick: async () => {
          phases.splice(i, 1); try { await sauverPhases(); dessinerPhases(); } catch (e) { erreur(e); } } }, '✖')) : null)));
      ajusterTout(tablePhases);
    };
    const corps = h('div', {});
    const titre = `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`;
    vider(fiche,
      h('article', { class: 'feuille' },
        entete('FICHE DE DÉROULEMENT DE SÉANCE', titre),
        h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif),
          info('Séquence', `${sq.numero} · ${sq.intitule || ''}`), info('Durée', heures(x.duree == null ? null : Number(x.duree)) || '—'),
          h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Salle / atelier'), champ(f.salle || '', maj('salle'), { lecture: !modif, placeholder: modif ? 'À compléter' : '' }))),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif intermédiaire'), h('p', { class: 'fort' }, x.objectif_inter || '—')),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Objectifs opérationnels'), h('p', { class: 'pre' }, x.objectifs_ops || '—')),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Cours mobilisés'), h('p', { class: 'pre' }, x.cours || '—')),
        h('div', { class: 'deux' }, h('div', { class: 'rubrique' }, h('h3', {}, 'Compétences'), codes(x.competences, ref.comp)),
          h('div', { class: 'rubrique' }, h('h3', {}, 'Savoirs associés'), codes(x.savoirs, ref.sav))),
        h('div', { class: 'deux' }, zoneTexte('Prérequis', f.prerequis, maj('prerequis')), zoneTexte('Matériel et ressources', f.materiel, maj('materiel'))),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Déroulement'),
          h('table', { class: 'table-fiche phases' }, h('thead', {}, h('tr', {}, ['Phase', 'Activité proposée', 'Activités de l’enseignant', 'Activités des élèves', 'Durée'].map((t) => h('th', {}, t)),
            modif ? h('th', { class: 'ecran' }) : null)), tablePhases),
          modif ? h('button', { class: 'lien petit ecran', onclick: async () => {
            phases.push({ phase: `${phases.length + 1}. `, activite: '', enseignant: '', eleves: '', duree: '' });
            try { await sauverPhases(); dessinerPhases(); } catch (e) { erreur(e); } } }, '＋ ajouter une phase') : null),
        zoneTexte('Évaluation', f.evaluation, maj('evaluation')),
        zoneTexte('Différenciation scolaires / apprentis', f.differenciation, maj('differenciation')),
        zoneTexte('Bilan de séance / remédiation', f.bilan, maj('bilan'), 'Après la séance…')),
      h('article', { class: 'feuille large saut' },
        entete('CONTRAT · ÉVALUATION FORMATIVE', titre),
        h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif)),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif intermédiaire évalué'), h('p', { class: 'fort' }, x.objectif_inter || '—')), corps));
    dessinerPhases();
    ajusterTout(fiche);
    await dessinerContrat(corps, { type: 'formatif', id: x.id, modif, ctx, titreGroupe: (g) => ({ code: g, libelle: '' }) });
  }

  try {
    if (onglet === 'sommatif') await sommatif();
    else if (onglet.startsWith('seance-')) {
      const x = seances.find((s) => String(s.id) === onglet.slice(7));
      if (x) await seance(x); else await preparation();
    } else await preparation();
  } catch (e) { erreur(e); throw e; }
}

// ------------------------------------------------------------------------------------- liste des séquences
async function index(zone, ctx) {
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`);
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, 'Fiches et contrats'),
      h('p', { class: 'sous-titre' }, `Promotion ${ctx.promo.libelle}  ·  choisir une séquence`))),
    h('section', { class: 'grille-matieres' }, ctx.matieres.map((m) => {
      const sq = sequences.filter((s) => s.matiere_id === m.id);
      return h('div', { class: 'carte-matiere', style: { '--couleur': m.couleur } },
        h('div', { class: 'bandeau' }, h('h3', {}, m.nom)),
        sq.length ? h('ul', { class: 'liste-seq' }, sq.map((s) => h('li', {}, h('a', { href: `#/fiches/${s.id}` }, h('b', {}, `Séquence ${s.numero}`), ' · ', s.intitule || 'sans intitulé'))))
          : h('p', { class: 'profs' }, 'Aucune séquence pour cette promotion.'));
    })));
}
