// Fiches d'une séquence : préparation de séquence, contrat sommatif, puis pour chaque séance sa fiche de déroulement
// et son contrat formatif. Sans séquence choisie : liste des séquences de chaque matière.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, champ, erreur, heures, ajusterTout, imprimer, confirmer, dateFr, toast, fenetre } from '../ui.js';
import { dessinerContrat, moyenne, niveau, arrondi } from './contrat.js';
import { telecharger, nomFichier, exportSequence, enTeteEchange, documentWord, echapper, FORMAT } from '../echange.js';

// anciens intitulés proposés par défaut : retirés (les phases se rédigent entièrement)
const PHASES_ANCIENNES = ['Lancement (contexte, objectifs)', 'Découverte / recherche', 'Structuration (synthèse)', 'Application / entraînement', 'Évaluation et bilan'];
const NB_PHASES = 5;
const COLS_PHASES = [['phase', 'Phase'], ['activite', 'Activité proposée'], ['enseignant', 'Activités de l’enseignant'],
  ['eleves', 'Activités des élèves'], ['duree', 'Durée']];
const phaseVide = () => ({ phase: '', activite: '', enseignant: '', eleves: '', duree: '' });
// intitulé saisi sans son numéro (« 2. Découverte » → « Découverte ») ; intitulés par défaut d'avant effacés
const sansNumero = (t) => { const v = String(t || '').replace(/^\s*\d+\s*[.)-]?\s*/, ''); return PHASES_ANCIENNES.includes(v.trim()) ? '' : v; };

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
  const RE_SEANCE = /^(seance|formatif|avant|apres)-/;
  const idSeance = RE_SEANCE.test(onglet) ? onglet.split('-')[1] : null;
  // sous-onglets d'une séance : travail avant (option), déroulement, travail après (option), contrat formatif
  const sousOnglets = () => {
    const tab = (k, t) => h('a', { href: lien(`${k}-${idSeance}`), class: onglet.startsWith(k + '-') ? 'actif' : '' }, t);
    return h('nav', { class: 'sous-onglets ecran' }, tab('seance', '📝  Fiche de déroulement'), tab('formatif', '✅  Contrat d’évaluation formative'));
  };

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
        h('button', { class: 'btn', onclick: () => menuTelecharger() }, '⬇  Télécharger'),
        modif ? h('button', { class: 'btn', onclick: () => importer() }, '⬆  Importer') : null,
        h('a', { class: 'btn', href: '#/sequencage/' + m.id }, 'Séquençage'))),
    h('nav', { class: 'onglets ecran' }, onglets.map(([k, t]) => h('a', { href: lien(k), class: k === onglet || k === onglet.replace(/^(formatif|avant|apres)-/, 'seance-') ? 'actif' : '' }, t))),
    // séance : travail avant (option), fiche de déroulement, travail après (option), contrat formatif
    idSeance ? sousOnglets() : null,
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
        h('table', { class: 'table-fiche auto' }, h('thead', {}, h('tr', {}, ['N°', 'Séance', 'Durée', 'Objectif intermédiaire', 'Compétences', 'Savoirs'].map((t) => h('th', {}, t)))),
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
    let phases = Array.isArray(f.phases) && f.phases.length ? f.phases.map((p) => ({ ...phaseVide(), ...p, phase: sansNumero(p.phase) }))
      : Array.from({ length: NB_PHASES }, phaseVide);
    const sauverPhases = () => db.enregistrer('fiches_seance', [{ seance_id: x.id, phases }], 'seance_id');
    const tablePhases = h('tbody', {});
    const dessinerPhases = () => {
      vider(tablePhases, phases.map((p, i) => h('tr', {},
        h('td', { class: 'num-phase' }, i + 1),
        COLS_PHASES.map(([k]) => h('td', { class: k },
          champ(p[k] || '', async (v) => { phases[i] = { ...phases[i], [k]: v }; await sauverPhases(); },
            { multi: k !== 'duree', lecture: !modif, placeholder: modif && i === 0 ? { phase: 'Intitulé de la phase' }[k] || '' : '' }))),
        modif ? h('td', { class: 'ecran' }, h('button', { class: 'icone petit', title: 'Retirer cette phase', onclick: async () => {
          phases.splice(i, 1); try { await sauverPhases(); dessinerPhases(); } catch (e) { erreur(e); } } }, '✖')) : null)));
      ajusterTout(tablePhases);
    };
    const corps = h('div', {});
    const titre = `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`;
    // séances prérequises (séquençage), toutes matières
    const ids = (x.prerequis || []).map(Number);
    const pre = ids.length ? await db.lire('seances', `id=in.(${ids.join(',')})`) : [];
    const preSeq = pre.length ? await db.lire('sequences', `id=in.(${[...new Set(pre.map((y) => y.sequence_id))].join(',')})`) : [];
    const lignesPre = pre.map((y) => { const q = preSeq.find((z) => z.id === y.sequence_id); const mm = ctx.matieres.find((z) => z.id === q?.matiere_id);
      return { t: `${ctx.codeMat(mm)} ${q?.numero}.${y.numero} · ${y.titre || 'sans titre'}`, r: [ctx.matieres.indexOf(mm), q?.numero, y.numero] }; })
      .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2]).map((l) => l.t);
    if (x.prerequis_texte) lignesPre.push(x.prerequis_texte);
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
        lignesPre.length ? h('div', { class: 'rubrique' }, h('h3', {}, 'Prérequis (séquençage)'), h('p', { class: 'pre' }, lignesPre.join('\n'))) : null,
        h('div', { class: 'deux' }, zoneTexte(lignesPre.length ? 'Autres prérequis' : 'Prérequis', f.prerequis, maj('prerequis')), zoneTexte('Matériel et ressources', f.materiel, maj('materiel'))),
        cadreMaison(x, f, 'avant'),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Déroulement'),
          h('table', { class: 'table-fiche phases' }, h('thead', {}, h('tr', {}, h('th', { class: 'num-phase' }, 'N°'), COLS_PHASES.map(([, t]) => h('th', {}, t)),
            modif ? h('th', { class: 'ecran' }) : null)), tablePhases),
          modif ? h('button', { class: 'lien petit ecran', onclick: async () => {
            phases.push(phaseVide());
            try { await sauverPhases(); dessinerPhases(); } catch (e) { erreur(e); } } }, '＋ ajouter une phase') : null),
        cadreMaison(x, f, 'apres'),
        zoneTexte('Évaluation', f.evaluation, maj('evaluation')),
        zoneTexte('Différenciation scolaires / apprentis', f.differenciation, maj('differenciation')),
        zoneTexte('Bilan de séance / remédiation', f.bilan, maj('bilan'), 'Après la séance…')),
      h('p', { class: 'aide ecran' }, 'Le contrat d’évaluation formative de cette séance est dans l’onglet « Contrat d’évaluation formative » ci-dessus.'));
    dessinerPhases();
    ajusterTout(fiche);
  }

  // ------------------------------------------------------------------------------------- séance : travail à la maison (option)
  const CHAMPS_MAISON = {
    avant: { col: 'maison_avant', titre: '🏠  Avant la séance : travail préparatoire à la maison (classe inversée)', ajout: '＋  Ajouter un travail préparatoire avant la séance (classe inversée)',
      echeance: 'À faire pour le', rubriques: [
        ['objectif', 'Objectif du travail préparatoire', 'Ce que l’élève doit avoir découvert ou compris en arrivant en classe…'],
        ['consignes', 'Travail demandé', '1. Regarder la vidéo…\n2. Lire le document…\n3. Répondre aux questions…'],
        ['ressources', 'Ressources (vidéos, documents, liens)', 'Liens, pages du manuel, documents déposés sur l’ENT…'],
        ['exploitation', 'Exploitation en classe', 'Comment le travail est repris en début de séance : questions flash, mise en commun, QCM…']] },
    apres: { col: 'maison_apres', titre: '📚  Après la séance : travail à la maison (devoirs)', ajout: '＋  Ajouter un travail à la maison après la séance (devoirs)',
      echeance: 'À rendre le', rubriques: [
        ['consignes', 'Travail demandé', 'Exercices, recherche, rédaction, révision…'],
        ['ressources', 'Ressources (documents, liens)', 'Documents, pages du manuel, liens…'],
        ['rendu', 'Modalités de rendu', 'Sur papier, dépôt sur l’ENT, par mail…'],
        ['correction', 'Correction / évaluation', 'Correction en classe, notation, critères…']] },
  };
  // cadre « travail à la maison » de la fiche de déroulement (optionnel) : avant le tableau (classe inversée) ou après (devoirs)
  function cadreMaison(x, f, cle) {
    const C = CHAMPS_MAISON[cle];
    const zoneC = h('div', { class: 'zone-maison ' + cle });
    const dessinerC = () => {
      const o = f[C.col];
      if (!o) {
        vider(zoneC, modif ? h('button', { class: 'ajout-maison ecran', type: 'button', onclick: async () => {
          try { await db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: {} }], 'seance_id'); f[C.col] = {}; dessinerC(); } catch (e) { erreur(e); }
        } }, C.ajout) : null);
        return;
      }
      const enreg = (k) => async (v) => { o[k] = v; await db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: o }], 'seance_id'); };
      vider(zoneC, h('section', { class: 'cadre-maison ' + cle },
        h('div', { class: 'tete-maison' }, h('h3', {}, C.titre),
          modif ? h('button', { class: 'lien petit ecran', type: 'button', onclick: async () => {
            if (!(await confirmer('Retirer le cadre', 'Retirer ce travail à la maison et son contenu ? (« Annuler » permet de revenir en arrière.)', 'Retirer'))) return;
            try { await db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: null }], 'seance_id'); f[C.col] = null; dessinerC(); } catch (e) { erreur(e); }
          } }, '✖ retirer') : null),
        h('div', { class: 'grille-infos' },
          h('div', { class: 'info' }, h('span', { class: 'lib' }, C.echeance), champ(o.echeance || '', enreg('echeance'), { type: 'date', lecture: !modif })),
          h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Durée estimée'), champ(o.duree || '', enreg('duree'), { lecture: !modif, placeholder: modif ? 'ex. 45 min' : '' }))),
        h('div', { class: 'deux' }, C.rubriques.map(([k, lib, aide]) => zoneTexte(lib, o[k], enreg(k), aide)))));
      ajusterTout(zoneC);
    };
    dessinerC();
    return zoneC;
  }

  // ------------------------------------------------------------------------------------- séance : contrat d'évaluation formative
  async function formatif(x) {
    const corps = h('div', {});
    const titre = `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`;
    vider(fiche,
      h('article', { class: 'feuille large' },
        entete('CONTRAT · ÉVALUATION FORMATIVE', titre),
        h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif)),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif intermédiaire évalué'), h('p', { class: 'fort' }, x.objectif_inter || '—')), corps));
    await dessinerContrat(corps, { type: 'formatif', id: x.id, modif, ctx, titreGroupe: (g) => ({ code: g, libelle: '' }) });
  }

  // ------------------------------------------------------------------------------------- téléchargements
  async function menuTelecharger() {
    const x = idSeance ? seances.find((y) => String(y.id) === idSeance) : null;
    const carte = (v, ...enfants) => h('button', { class: 'carte-choix' + (v.startsWith('json') ? ' echange' : ''), type: 'button',
      onclick: (e) => { e.target.closest('.fond-fenetre')?.remove(); lancerTelechargement(v); } }, enfants);
    await fenetre('Télécharger', h('div', { class: 'choix-telecharger' },
      h('p', { class: 'aide' }, 'Documents Word : à ouvrir dans Word (ou LibreOffice) pour les modifier, les imprimer ou les enregistrer en PDF. '
        + 'Fichier d’échange : pour faire rédiger les fiches suivantes (par exemple par Claude) puis les réimporter avec « ⬆ Importer ».'),
      x ? carte('seance', h('b', {}, `📄  Documents de la séance ${sq.numero}.${x.numero}`),
        h('span', {}, 'Fiche de déroulement (avec le travail à la maison) et contrat d’évaluation formative, en un seul fichier Word')) : null,
      carte('sequence', h('b', {}, `📚  Toute la séquence ${sq.numero}`),
        h('span', {}, 'Préparation de séquence, contrat sommatif, puis chaque séance : fiche de déroulement et contrat formatif (un seul fichier Word)')),
      carte('json', h('b', {}, `🔄  Fichier d’échange de la séquence ${sq.numero}`),
        h('span', {}, 'Toutes les fiches et contrats de la séquence (.json), à compléter puis à réimporter')),
      carte('json-matiere', h('b', {}, `🔄  Fichier d’échange de toute la matière (${m.nom})`),
        h('span', {}, `Toutes les séquences de la promotion ${promo} (.json)`))), [{ texte: 'Fermer', valeur: null }]);
  }
  async function lancerTelechargement(v) {
    try {
      toast('Préparation du fichier…');
      if (v === 'seance') await wordSeances([seances.find((y) => String(y.id) === idSeance)], false);
      else if (v === 'sequence') await wordSeances(seances, true);
      else if (v === 'json') {
        const d = { ...enTeteEchange(ctx, m, promo), sequence: await exportSequence(sq) };
        telecharger(nomFichier(`fiches_${ctx.codeMat(m)}_sequence${sq.numero}_${promo}.json`), JSON.stringify(d, null, 2), 'application/json');
      } else if (v === 'json-matiere') {
        const d = { ...enTeteEchange(ctx, m, promo), sequences: await Promise.all(toutes.map((y) => exportSequence(y))) };
        telecharger(nomFichier(`fiches_${ctx.codeMat(m)}_toutes_sequences_${promo}.json`), JSON.stringify(d, null, 2), 'application/json');
      }
      toast('Fichier téléchargé');
    } catch (x) { erreur(x); }
  }

  // documents Word construits à partir des données (fiches et contrats)
  async function wordSeances(liste, avecSequence) {
    const d = await exportSequence(sq);
    const elevesL = actifs.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
    const t = (v) => echapper(v || '—').replace(/\n/g, '<br>');
    const TABLE = '<table width="100%" border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;border:1px solid #A9B5B2">';
    const infos = (paires) => `${TABLE}${paires.reduce((r, p, i) => (i % 2 ? (r[r.length - 1].push(p), r) : (r.push([p]), r)), [])
      .map((l) => `<tr>${l.map(([a, b]) => `<td class="lib" bgcolor="#E3F1EF" width="18%"><b>${echapper(a)}</b></td><td width="32%">${t(b)}</td>`).join('')}${l.length < 2 ? '<td class="lib"></td><td></td>' : ''}</tr>`).join('')}</table>`;
    const rub = (titre, v) => `<p style="margin-top:8pt"></p>${TABLE}<tr><td bgcolor="#146B63" style="color:#ffffff"><b>${echapper(titre).toUpperCase()}</b></td></tr><tr><td>${t(v)}</td></tr></table>`;
    const tete = (titre, sous) => `<h1>${echapper(titre)}</h1><h2 class="sous">${echapper(sous)}</h2>`;
    const codes = (l, idx) => (l || []).map((c) => `${c} ${idx[c]?.libelle || ''}`).join('\n');
    const maison = (o, cle) => {
      if (!o) return '';
      const C = cle === 'avant'
        ? ['🏠 Avant la séance : travail préparatoire à la maison (classe inversée)', 'À faire pour le', [['objectif', 'Objectif du travail préparatoire'], ['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['exploitation', 'Exploitation en classe']]]
        : ['📚 Après la séance : travail à la maison (devoirs)', 'À rendre le', [['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['rendu', 'Modalités de rendu'], ['correction', 'Correction / évaluation']]];
      return `<p style="margin-top:10pt"></p><table width="100%" border="2" cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:2px solid ${cle === 'avant' ? '#E8893A' : '#3D84C6'}"><tr><td bgcolor="${cle === 'avant' ? '#FFF3E6' : '#EAF2FB'}"><b style="color:${cle === 'avant' ? '#A2561A' : '#245F96'}">${C[0]}</b>${infos([[C[1], o.echeance ? new Date(o.echeance + 'T12:00').toLocaleDateString('fr-FR') : ''], ['Durée estimée', o.duree]])}`
        + C[2].map(([k, l]) => rub(l, o[k])).join('') + '</td></tr></table>';
    };
    const contrat = async (type, c, titre, groupeLib) => {
      if (!c) return null;
      const ct = (await db.lire('contrats', `type=eq.${type}&${type === 'sommatif' ? 'sequence_id' : 'seance_id'}=eq.${c}`))[0];
      if (!ct) return null;
      const ks = (await db.lire('criteres', `contrat_id=eq.${ct.id}&order=groupe_ordre,ordre,id`)).filter((k) => k.actif);
      const nl = ks.length ? await db.lire('notes', `critere_id=in.(${ks.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
      const notes = new Map(nl.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
      const groupes = [...new Set(ks.map((k) => k.groupe))];
      const finale = (e) => {
        if (type === 'sommatif') { const ms = groupes.map((g) => moyenne(ks.filter((k) => k.groupe === g), notes, e.id)).filter((v) => v !== null); return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null; }
        return moyenne(ks, notes, e.id);
      };
      const tetes = elevesL.map((e) => `<th bgcolor="#E3F1EF" class="centre">${echapper(e.nom)}<br>${echapper(e.prenom)}</th>`).join('');
      const lignes = groupes.map((g) => `<tr class="groupe"><td bgcolor="#1E8F86" style="color:#ffffff" colspan="${2 + elevesL.length}">${echapper(groupeLib(g))}</td></tr>`
        + ks.filter((k) => k.groupe === g).map((k) => `<tr><td>${t(k.texte)}</td><td class="centre">${arrondi(Number(k.coefficient))}</td>${elevesL.map((e) => `<td class="centre">${echapper(notes.get(`${k.id}:${e.id}`) || '')}</td>`).join('')}</tr>`).join('')
        + `<tr><td><i>Niveau (note / 5)</i></td><td></td>${elevesL.map((e) => { const n = moyenne(ks.filter((k) => k.groupe === g), notes, e.id); return `<td class="centre"><b>${n === null ? '' : niveau(n).code}</b></td>`; }).join('')}</tr>`).join('');
      const fin = `<tr><td><b>NOTE FINALE / 20</b></td><td></td>${elevesL.map((e) => { const f = finale(e); return `<td class="centre"><b>${f === null ? '' : arrondi(f * 4)}</b></td>`; }).join('')}</tr>`;
      return { paysage: true, html: tete(`CONTRAT · ÉVALUATION ${type === 'sommatif' ? 'SOMMATIVE' : 'FORMATIVE'}`, titre)
        + infos([['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Date', ct.date_eval ? new Date(ct.date_eval + 'T12:00').toLocaleDateString('fr-FR') : ''],
          ['Forme', ct.forme], ['Lieu', ct.lieu], ['Organisation', ct.organisation], ['Durée', ct.duree]])
        + `<p style="margin-top:8pt"></p>${TABLE}<tr><th bgcolor="#E3F1EF" width="30%">${type === 'sommatif' ? 'Compétences et indicateurs de performance' : 'Objectifs opérationnels et critères'}</th><th bgcolor="#E3F1EF" class="centre">Coef.</th>${tetes}</tr>${lignes}${fin}</table>`
        + '<p style="margin-top:4pt;font-size:8.5pt">NA : non acquis (0 à moins de 2 / 5) · EVA : en voie d’acquisition (2 à moins de 4) · A : acquis (4 à 5) · NE : non évalué</p>' };
    };
    const sections = [];
    if (avecSequence) {
      const p = d.preparation;
      sections.push({ html: tete('FICHE DE PRÉPARATION DE SÉQUENCE', `Séquence ${sq.numero} · ${sq.intitule || ''}`)
        + infos([['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Effectif', effectif], ['Volume', volume]])
        + rub('Objectif principal', sq.objectif) + rub('Activités et tâches du référentiel visées', p.activites) + rub('Situation professionnelle / support', p.situation)
        + rub('Prérequis', p.prerequis)
        + `<p style="margin-top:8pt"></p>${TABLE}<tr><td bgcolor="#146B63" colspan="6" style="color:#ffffff"><b>SÉANCES DE LA SÉQUENCE</b></td></tr><tr>${['N°', 'Séance', 'Durée', 'Objectif intermédiaire', 'Compétences', 'Savoirs'].map((x) => `<th bgcolor="#E3F1EF">${x}</th>`).join('')}</tr>${seances.map((x) =>
          `<tr><td>${sq.numero}.${x.numero}</td><td><b>${t(x.titre)}</b></td><td>${heures(x.duree == null ? null : Number(x.duree))}</td><td>${t(x.objectif_inter)}</td><td>${(x.competences || []).join(' ')}</td><td>${(x.savoirs || []).join(' ')}</td></tr>`).join('')}</table>`
        + rub('Modalités d’évaluation', p.modalites) + rub('Ressources et supports', p.ressources) + rub('Bilan de la séquence', p.bilan) });
      const cs = await contrat('sommatif', sq.id, `Séquence ${sq.numero} · ${sq.intitule || ''}`, (g) => `${g} · ${ref.comp[g]?.libelle || ''}`);
      if (cs) sections.push(cs);
    }
    for (const x of liste) {
      const ds = d.seances.find((y) => y.numero === x.numero), f = ds?.fiche || {};
      const ids = (x.prerequis || []).map(Number);
      const pre = ids.length ? await db.lire('seances', `id=in.(${ids.join(',')})`) : [];
      const preSeq = pre.length ? await db.lire('sequences', `id=in.(${[...new Set(pre.map((y) => y.sequence_id))].join(',')})`) : [];
      const lPre = pre.map((y) => { const q = preSeq.find((z) => z.id === y.sequence_id); return `${ctx.codeMat(ctx.matieres.find((z) => z.id === q?.matiere_id))} ${q?.numero}.${y.numero} · ${y.titre || ''}`; });
      if (x.prerequis_texte) lPre.push(x.prerequis_texte);
      const titre = `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`;
      sections.push({ html: tete('FICHE DE DÉROULEMENT DE SÉANCE', titre)
        + infos([['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Effectif', effectif], ['Séquence', `${sq.numero} · ${sq.intitule || ''}`],
          ['Durée', heures(x.duree == null ? null : Number(x.duree))], ['Salle / atelier', f.salle]])
        + rub('Objectif intermédiaire', x.objectif_inter) + rub('Objectifs opérationnels', x.objectifs_ops) + rub('Cours mobilisés', x.cours)
        + rub('Compétences', codes(x.competences, ref.comp)) + rub('Savoirs associés', codes(x.savoirs, ref.sav))
        + (lPre.length ? rub('Prérequis (séquençage)', lPre.join('\n')) : '') + rub(lPre.length ? 'Autres prérequis' : 'Prérequis', f.prerequis) + rub('Matériel et ressources', f.materiel)
        + maison(f.maison_avant, 'avant')
        + `<p style="margin-top:8pt"></p>${TABLE}<tr><td bgcolor="#146B63" colspan="6" style="color:#ffffff"><b>DÉROULEMENT</b></td></tr><tr>${['N°', 'Phase', 'Activité proposée', 'Activités de l’enseignant', 'Activités des élèves', 'Durée'].map((x) => `<th bgcolor="#E3F1EF">${x}</th>`).join('')}</tr>${(f.phases || []).map((p, i) =>
          `<tr><td class="centre"><b>${i + 1}</b></td><td><b>${echapper(p.phase)}</b></td><td>${t(p.activite)}</td><td>${t(p.enseignant)}</td><td>${t(p.eleves)}</td><td>${t(p.duree)}</td></tr>`).join('')}</table>`
        + maison(f.maison_apres, 'apres')
        + rub('Évaluation', f.evaluation) + rub('Différenciation scolaires / apprentis', f.differenciation) + rub('Bilan de séance / remédiation', f.bilan) });
      const cf = await contrat('formatif', x.id, titre, (g) => g);
      if (cf) sections.push(cf);
    }
    const nom = liste.length === 1 && !avecSequence ? `seance_${sq.numero}.${liste[0].numero}` : `sequence_${sq.numero}`;
    telecharger(nomFichier(`${ctx.codeMat(m)}_${nom}_${promo}.doc`), documentWord(`${m.nom} · ${nom}`, sections), 'application/msword');
  }

  // ------------------------------------------------------------------------------------- import d'un fichier d'échange
  async function importer() {
    const entree = h('input', { type: 'file', accept: '.json,application/json' });
    entree.addEventListener('change', async () => {
      const fichier = entree.files[0];
      if (!fichier) return;
      let d;
      try { d = JSON.parse(await fichier.text()); } catch { return erreur(new Error('Ce fichier n’est pas un fichier d’échange valide (JSON illisible).')); }
      if (d.format !== FORMAT) return erreur(new Error('Ce fichier n’est pas un fichier d’échange de l’application.'));
      // une séquence (la séquence affichée) ou plusieurs (retrouvées par leur numéro dans la matière)
      const lots = d.sequences ? d.sequences.map((x) => ({ x, cible: toutes.find((y) => y.numero === x.numero) })) : [{ x: d.sequence, cible: sq }];
      const ok = lots.filter((l) => l.cible && l.x), ko = lots.filter((l) => !l.cible);
      const resume = ok.map((l) => `Séquence ${l.cible.numero} : ${(l.x.seances || []).length} séance(s)` + (l.x.contrat_sommatif ? ', contrat sommatif' : '') + (l.x.preparation ? ', préparation' : ''));
      if (d.sequence && d.sequence.numero !== sq.numero) resume.unshift(`⚠ Le fichier vient de la séquence ${d.sequence.numero} : il sera importé dans la séquence affichée (${sq.numero}).`);
      if (ko.length) resume.push(`Ignoré (séquence absente de la promotion) : ${ko.map((l) => l.x.numero).join(', ')}`);
      const go = await fenetre('Importer des fiches', h('div', {},
        h('p', {}, `Fichier « ${fichier.name} »${d.matiere ? ` · ${d.matiere}` : ''}${d.matiere && d.matiere !== m.nom ? ' (⚠ autre matière)' : ''}`),
        h('ul', {}, resume.map((r) => h('li', {}, r))),
        h('p', { class: 'aide' }, 'Les fiches et les contrats sont complétés ou remplacés par le contenu du fichier ; le séquençage et les notes des élèves ne sont pas modifiés. '
          + '« ↶ Annuler » permet de revenir en arrière (un clic par séquence importée).')),
      [{ texte: 'Annuler', valeur: false }, { texte: 'Importer', classe: 'principal', valeur: true }]);
      if (!go) return;
      try {
        let n = { fiches: 0, contrats: 0 };
        for (const l of ok) { const r = await db.rpc('importer_fiches', { s: l.cible.id, d: l.x }); n.fiches += r.fiches; n.contrats += r.contrats; }
        toast(`Import terminé : ${n.fiches} fiche(s), ${n.contrats} contrat(s)`);
        await ctx.recharger();
      } catch (x) { erreur(x); }
    });
    entree.click();
  }

  try {
    if (onglet === 'sommatif') await sommatif();
    else if (RE_SEANCE.test(onglet)) {
      const x = seances.find((s) => String(s.id) === onglet.split('-')[1]);
      if (!x) await preparation();
      else if (onglet.startsWith('formatif-')) await formatif(x);
      else await seance(x);
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
