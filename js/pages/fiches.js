// Fiches d'une séquence : préparation de séquence, contrat sommatif, puis pour chaque séance sa fiche de déroulement
// et son contrat formatif. Sans séquence choisie : liste des séquences de chaque matière.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, champ, erreur, heures, ajusterTout, imprimer, confirmer, dateFr, toast, fenetre } from '../ui.js';
import { dessinerContrat, moyenne, niveau, arrondi } from './contrat.js';
import { telecharger, nomFichier, exportSequence } from '../echange.js';

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

  // ------------------------------------------------------------------------------------- téléchargement (PDF A4 portrait dans un .zip)
  // choix des documents : préparation et contrat sommatif de la séquence, fiche de déroulement et contrat formatif de chaque séance
  async function menuTelecharger() {
    const docs = [['preparation', 'Fiche de préparation de séquence', null], ['sommatif', 'Contrat d’évaluation sommative', null],
      ...seances.flatMap((x) => [[`seance-${x.id}`, `Fiche de déroulement`, x], [`formatif-${x.id}`, `Contrat d’évaluation formative`, x]])];
    const coche = (k) => (idSeance ? k.endsWith('-' + idSeance) : true);
    const cases = new Map(docs.map(([k]) => [k, h('input', { type: 'checkbox', checked: coche(k) })]));
    const compte = h('b', {});
    const majCompte = () => { const n = [...cases.values()].filter((c) => c.checked).length; compte.textContent = `${n} document(s) sélectionné(s)`; };
    cases.forEach((c) => c.addEventListener('change', majCompte));
    const tous = (v) => { cases.forEach((c) => { c.checked = v; }); majCompte(); };
    const ligne = (k, t) => h('label', { class: 'choix-doc' }, cases.get(k), t);
    majCompte();
    const ok = await fenetre(`Télécharger · séquence ${sq.numero}`, h('div', { class: 'choix-telecharger' },
      h('p', { class: 'aide' }, 'Chaque document est un PDF au format A4 portrait ; l’ensemble est regroupé dans un fichier .zip.'),
      h('div', { class: 'ligne-com' }, compte, h('span', {},
        h('button', { class: 'lien petit', type: 'button', onclick: () => tous(true) }, 'tout cocher'), '  ·  ',
        h('button', { class: 'lien petit', type: 'button', onclick: () => tous(false) }, 'tout décocher'))),
      h('fieldset', { class: 'groupe-docs' }, h('legend', {}, `Séquence ${sq.numero} · ${sq.intitule || ''}`), ligne('preparation', 'Fiche de préparation de séquence'), ligne('sommatif', 'Contrat d’évaluation sommative')),
      seances.map((x) => h('fieldset', { class: 'groupe-docs' + (String(x.id) === idSeance ? ' courante' : '') },
        h('legend', {}, h('label', {}, h('input', { type: 'checkbox', checked: coche(`seance-${x.id}`) && coche(`formatif-${x.id}`), onchange: (e) => {
          cases.get(`seance-${x.id}`).checked = e.target.checked; cases.get(`formatif-${x.id}`).checked = e.target.checked; majCompte(); } }),
        `Séance ${sq.numero}.${x.numero} · ${x.titre || 'sans titre'}`)),
        ligne(`seance-${x.id}`, 'Fiche de déroulement (avec le travail à la maison)'), ligne(`formatif-${x.id}`, 'Contrat d’évaluation formative')))),
    [{ texte: 'Annuler', valeur: false }, { texte: '⬇  Télécharger le .zip', classe: 'principal', action: () => {
      if (![...cases.values()].some((c) => c.checked)) throw new Error('Cochez au moins un document.');
      return true;
    } }], { large: true });
    if (!ok) return;
    const choisis = docs.filter(([k]) => cases.get(k).checked);
    try {
      toast('Préparation des PDF…');
      const [{ chargerOutils, zipDePDF }] = await Promise.all([import('../pdf.js')]);
      await chargerOutils();
      const logo = await fetch('img/logo.jpg').then((r) => r.arrayBuffer()).catch(() => null);
      const modeles = await modelesSequence({ sq, m, ref, seances, actifs, effectif, profs, promo, volume }, ctx, choisis);
      const zip = await zipDePDF(modeles, logo);
      telecharger(nomFichier(`${ctx.codeMat(m)}_sequence${sq.numero}_${promo}.zip`), zip);
      toast(`${modeles.length} document(s) téléchargé(s)`);
    } catch (x) { erreur(x); }
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


// données communes aux documents d'une séquence (en-têtes des PDF)
export async function contexteSequence(sq, ctx) {
  const m = ctx.matieres.find((x) => x.id === sq.matiere_id);
  const [ref, seances, eleves] = await Promise.all([ctx.referentiel(), db.lire('seances', `sequence_id=eq.${sq.id}&order=numero`), db.lire('eleves', `promotion_id=eq.${sq.promotion_id}`)]);
  const actifs = eleves.filter((e) => !e.arret), app = actifs.filter((e) => e.statut === 'Apprenti').length;
  const remplies = seances.filter((x) => x.titre || x.objectif_inter);
  return { sq, m, ref, seances, actifs,
    effectif: `${actifs.length} élèves (${app} apprentis · ${actifs.length - app} scolaires)`,
    profs: ctx.enseignantsDe(m.id).join(', ') || '—',
    promo: ctx.promotions.find((p) => p.id === sq.promotion_id)?.libelle || '',
    volume: `${remplies.length} séance(s) · ${heures(remplies.reduce((a, x) => a + (Number(x.duree) || 0), 0)) || '0 h'}` };
}

// contenu des documents (blocs mis en page par js/pdf.js)
export async function modelesSequence(S, ctx, choisis) {
  const { sq, m, ref, seances, actifs, effectif, profs, promo, volume } = S;
  const d = await exportSequence(sq);
  const elevesL = actifs.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  const dt = (v) => (v ? new Date(v + 'T12:00').toLocaleDateString('fr-FR') : '');
  const codes = (l, idx) => (l || []).map((c) => `${c}  ${idx[c]?.libelle || ''}`).join('\n');
  const R = (titre, texte, opts = {}) => ({ t: 'rubrique', titre, texte, ...opts });
  const pied = `${m.nom} · Séquence ${sq.numero} · Promotion ${promo}`;
  const num = (n) => String(n).padStart(2, '0');
  const maison = (o, cle) => (!o ? null : { t: 'cadre', couleur: cle === 'avant' ? '#E8893A' : '#3D84C6',
    titre: cle === 'avant' ? 'Avant la séance : travail préparatoire à la maison (classe inversée)' : 'Après la séance : travail à la maison (devoirs)',
    blocs: [{ t: 'infos', paires: [[cle === 'avant' ? 'À faire pour le' : 'À rendre le', dt(o.echeance)], ['Durée estimée', o.duree]] },
      ...(cle === 'avant' ? [['objectif', 'Objectif du travail préparatoire'], ['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['exploitation', 'Exploitation en classe']]
        : [['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['rendu', 'Modalités de rendu'], ['correction', 'Correction / évaluation']]).map(([k, l]) => R(l, o[k]))] });
  // contrat : critères (lignes) × élèves (colonnes), notes saisies, niveau par rubrique et note finale
  const contrat = async (type, idObjet, titre, groupeLib) => {
    const ct = (await db.lire('contrats', `type=eq.${type}&${type === 'sommatif' ? 'sequence_id' : 'seance_id'}=eq.${idObjet}`))[0];
    const ks = ct ? (await db.lire('criteres', `contrat_id=eq.${ct.id}&order=groupe_ordre,ordre,id`)).filter((k) => k.actif) : [];
    const nl = ks.length ? await db.lire('notes', `critere_id=in.(${ks.map((k) => k.id).join(',')})&order=critere_id,eleve_id`) : [];
    const notes = new Map(nl.map((n) => [`${n.critere_id}:${n.eleve_id}`, n.valeur]));
    const groupes = [...new Set(ks.map((k) => k.groupe))];
    const finale = (e) => {
      if (type === 'sommatif') { const ms = groupes.map((g) => moyenne(ks.filter((k) => k.groupe === g), notes, e.id)).filter((v) => v !== null); return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null; }
      return moyenne(ks, notes, e.id);
    };
    const lignes = [];
    for (const g of groupes) {
      lignes.push({ groupe: groupeLib(g) });
      ks.filter((k) => k.groupe === g).forEach((k) => lignes.push([k.texte, arrondi(Number(k.coefficient)), ...elevesL.map((e) => notes.get(`${k.id}:${e.id}`) || '')]));
      lignes.push({ fond: '#EFF1F0', cellules: ['Niveau (note / 5)', '', ...elevesL.map((e) => { const n = moyenne(ks.filter((k) => k.groupe === g), notes, e.id); return n === null ? '' : niveau(n).code; })] });
    }
    lignes.push({ fond: '#D9DEDC', gras: true, cellules: ['NOTE FINALE / 20', '', ...elevesL.map((e) => { const f = finale(e); return f === null ? '' : arrondi(f * 4); })] });
    return [{ t: 'titre', texte: `CONTRAT · ÉVALUATION ${type === 'sommatif' ? 'SOMMATIVE' : 'FORMATIVE'}`, sous: titre, couleur: m.couleur },
      { t: 'infos', paires: [['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Effectif', effectif], ['Date', dt(ct?.date_eval)], ['Forme', ct?.forme],
        ['Lieu', ct?.lieu], ['Organisation', ct?.organisation], ['Durée', ct?.duree]] },
      ks.length ? { t: 'table', taille: 7.5, teteVerticale: 2,
        colonnes: [{ titre: type === 'sommatif' ? 'Compétences et indicateurs de performance' : 'Objectifs opérationnels et critères', part: 34 }, { titre: 'Coef.', part: 5.5, centre: true },
          ...elevesL.map((e) => ({ titre: `${e.nom} ${e.prenom}`, part: Math.max(3, 62 / Math.max(1, elevesL.length)), centre: true }))], lignes }
        : R('Critères', 'Contrat pas encore créé.'),
      { t: 'note', texte: 'NA : non acquis (0 à moins de 2 / 5) · EVA : en voie d’acquisition (2 à moins de 4) · A : acquis (4 à 5) · NE : non évalué' }];
  };
  const out = [];
  for (const [k, , x] of choisis) {
    if (k === 'preparation') {
      const p = d.preparation;
      out.push({ fichier: `${num(0)}_Fiche_de_preparation_sequence_${sq.numero}.pdf`, titre: `Fiche de préparation · séquence ${sq.numero}`, pied, blocs: [
        { t: 'titre', texte: 'FICHE DE PRÉPARATION DE SÉQUENCE', sous: `Séquence ${sq.numero} · ${sq.intitule || ''}`, couleur: m.couleur },
        { t: 'infos', paires: [['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Effectif', effectif], ['Volume', volume]] },
        R('Objectif principal', sq.objectif, { gras: true, gris: true }), R('Activités et tâches du référentiel visées', p.activites), R('Situation professionnelle / support', p.situation), R('Prérequis', p.prerequis),
        { t: 'table', titre: 'Séances de la séquence', colonnes: [{ titre: 'N°', part: 5, gras: true }, { titre: 'Séance', part: 22, gras: true }, { titre: 'Durée', part: 7 },
          { titre: 'Objectif intermédiaire', part: 34 }, { titre: 'Compétences', part: 14 }, { titre: 'Savoirs', part: 18 }],
        lignes: seances.map((y) => [`${sq.numero}.${y.numero}`, y.titre, heures(y.duree == null ? null : Number(y.duree)), y.objectif_inter, (y.competences || []).join(' '), (y.savoirs || []).join(' ')]) },
        R('Modalités d’évaluation', p.modalites), R('Ressources et supports', p.ressources), R('Bilan de la séquence', p.bilan)] });
    } else if (k === 'sommatif') {
      out.push({ fichier: `${num(1)}_Contrat_sommatif_sequence_${sq.numero}.pdf`, titre: `Contrat sommatif · séquence ${sq.numero}`, pied,
        blocs: await contrat('sommatif', sq.id, `Séquence ${sq.numero} · ${sq.intitule || ''}`, (g) => `${g} · ${ref.comp[g]?.libelle || ''}`) });
    } else if (k.startsWith('seance-')) {
      const f = d.seances.find((y) => y.numero === x.numero)?.fiche || {};
      const ids = (x.prerequis || []).map(Number);
      const pre = ids.length ? await db.lire('seances', `id=in.(${ids.join(',')})`) : [];
      const preSeq = pre.length ? await db.lire('sequences', `id=in.(${[...new Set(pre.map((y) => y.sequence_id))].join(',')})`) : [];
      const lPre = pre.map((y) => { const q = preSeq.find((z) => z.id === y.sequence_id); return `${ctx.codeMat(ctx.matieres.find((z) => z.id === q?.matiere_id))} ${q?.numero}.${y.numero} · ${y.titre || ''}`; });
      if (x.prerequis_texte) lPre.push(x.prerequis_texte);
      out.push({ fichier: `S${sq.numero}.${x.numero}_a_Fiche_de_deroulement.pdf`, titre: `Fiche de déroulement · séance ${sq.numero}.${x.numero}`, pied, blocs: [
        { t: 'titre', texte: 'FICHE DE DÉROULEMENT DE SÉANCE', sous: `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`, couleur: m.couleur },
        { t: 'infos', paires: [['Matière', m.nom], ['Enseignant', profs], ['Promotion', promo], ['Effectif', effectif], ['Séquence', `${sq.numero} · ${sq.intitule || ''}`],
          ['Durée', heures(x.duree == null ? null : Number(x.duree))], ['Salle / atelier', f.salle]] },
        R('Objectif intermédiaire', x.objectif_inter, { gras: true, gris: true }), R('Objectifs opérationnels', x.objectifs_ops, { gris: true }), R('Cours mobilisés', x.cours, { gris: true }),
        R('Compétences', codes(x.competences, ref.comp), { gris: true }), R('Savoirs associés', codes(x.savoirs, ref.sav), { gris: true }),
        lPre.length ? R('Prérequis (séquençage)', lPre.join('\n'), { gris: true }) : null, R(lPre.length ? 'Autres prérequis' : 'Prérequis', f.prerequis), R('Matériel et ressources', f.materiel),
        maison(f.maison_avant, 'avant'),
        { t: 'table', titre: 'Déroulement', colonnes: [{ titre: 'N°', part: 4, centre: true, gras: true }, { titre: 'Phase', part: 15, gras: true }, { titre: 'Activité proposée', part: 21 },
          { titre: 'Activités de l’enseignant', part: 22 }, { titre: 'Activités des élèves', part: 22 }, { titre: 'Durée', part: 9 }],
        lignes: (f.phases || []).map((p, i) => [String(i + 1), p.phase, p.activite, p.enseignant, p.eleves, p.duree]) },
        maison(f.maison_apres, 'apres'),
        R('Évaluation', f.evaluation), R('Différenciation scolaires / apprentis', f.differenciation), R('Bilan de séance / remédiation', f.bilan)].filter(Boolean) });
    } else if (k.startsWith('formatif-')) {
      out.push({ fichier: `S${sq.numero}.${x.numero}_b_Contrat_formatif.pdf`, titre: `Contrat formatif · séance ${sq.numero}.${x.numero}`, pied,
        blocs: await contrat('formatif', x.id, `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`, (g) => g) });
    }
  }
  return out;
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
        sq.length ? h('button', { class: 'btn petit classeur', title: 'Un seul PDF : page de garde, sommaire, séquençage, fiches et contrats', onclick: async () => {
          const { telechargerClasseur } = await import('../classeur.js'); await telechargerClasseur(m, ctx); } }, '📘  Classeur PDF de la matière') : null,
        sq.length ? h('ul', { class: 'liste-seq' }, sq.map((s) => h('li', {}, h('a', { href: `#/fiches/${s.id}` }, h('b', {}, `Séquence ${s.numero}`), ' · ', s.intitule || 'sans intitulé'))))
          : h('p', { class: 'profs' }, 'Aucune séquence pour cette promotion.'));
    })));
}
