// Fiches d'une séquence : préparation de séquence, contrat sommatif, puis pour chaque séance sa fiche de déroulement
// et son contrat formatif. Sans séquence choisie : liste des séquences de chaque matière.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, champ, erreur, heures, ajusterTout, imprimer, confirmer, dateFr } from '../ui.js';
import { dessinerContrat } from './contrat.js';
import { qrSvg } from '../qrcode.js?v=20261025c';

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
  // impression d'un cadre seul (document élève) : en-tête de la séance, échéance, durée, nom de l'élève et rubriques remplies ;
  // la rubrique « Exploitation en classe », destinée à l'enseignant, n'est pas imprimée
  function imprimerCadre(x, cle, o) {
    const C = CHAMPS_MAISON[cle];
    document.getElementById('impression-cadre')?.remove();
    const z = h('div', { id: 'impression-cadre', class: 'feuille' },
      entete(cle === 'avant' ? 'TRAVAIL PRÉPARATOIRE À LA MAISON' : 'TRAVAIL À LA MAISON', `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`),
      h('div', { class: 'grille-infos' }, info('Matière', m.nom), info(C.echeance, o.echeance ? dateFr(o.echeance) : '—'),
        info('Durée estimée', o.duree || '—'), info('Nom et prénom', '')),
      C.rubriques.filter(([k]) => k !== 'exploitation' && (k === 'ressources' ? lireLiens(o).length : String(o[k] || '').trim()))
        .map(([k, lib]) => h('div', { class: 'rubrique' }, h('h3', {}, lib),
          k === 'ressources' ? ressourcesQr(lireLiens(o)) : h('p', { class: 'pre' }, o[k]))));
    document.body.append(z);
    document.body.classList.add('impression-cadre');
    const fin = () => { z.remove(); document.body.classList.remove('impression-cadre'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    imprimer('A4 portrait');
  }
  // ---------------------------------------------------------------- ressources du travail à la maison
  // liste o.liens = [{ titre, url, qr }] ; l'ancienne rubrique texte (o.ressources) est convertie à la première lecture
  const RE_URL = /https?:\/\/[^\s<>"]+/;
  function lireLiens(o) {
    if (Array.isArray(o.liens)) return o.liens;
    return String(o.ressources || '').split('\n').map((l) => l.trim())
      .filter((l) => l && !/^(à consulter|sources à consulter)/i.test(l))
      .map((l) => {
        const u = (l.match(RE_URL) || [''])[0].replace(/[.,;:)\]»]+$/, '');
        return { titre: l.replace(RE_URL, '').replace(/^[•\-\s]+/, '').replace(/[\s:–-]+$/, ''), url: u, qr: !!u };
      });
  }
  const texteLiens = (liens) => liens.map((l) => '• ' + [l.titre, l.url].filter(Boolean).join(' : ')).join('\n');
  const blocQr = (url, taille) => { const d = document.createElement('div'); d.className = 'qr-code'; d.innerHTML = qrSvg(url, taille); return d; };
  // affichage (écran et sujet imprimé) : QR code seulement pour les ressources cochées qui ont une adresse
  function ressourcesQr(liens) {
    return h('div', { class: 'qr-liste' }, liens.filter((l) => l.titre || l.url).map((l) => (l.qr && l.url
      ? h('div', { class: 'qr-item' }, blocQr(l.url, 96), h('div', { class: 'qr-texte' }, h('div', {}, l.titre || l.url), h('div', { class: 'qr-url' }, l.url)))
      : h('div', { class: 'qr-seul' }, '• ', l.titre || '', l.url ? h('span', { class: 'qr-url' }, ' ' + l.url) : null))));
  }
  // éditeur : une ligne par ressource (titre, adresse, case « QR code », retrait) + ajout
  function editeurLiens(o, sauver, apres) {
    const liens = lireLiens(o).map((l) => ({ ...l }));
    const zone = h('div', { class: 'liens-maison' });
    const enregistrer = async () => { o.liens = liens; o.ressources = texteLiens(liens); await sauver(); apres(); };
    const dessiner = () => {
      vider(zone,
        liens.length ? h('table', { class: 'table-liens' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Ressource (titre, éditeur)'), h('th', {}, 'Adresse internet (facultative)'), h('th', { class: 'centre' }, 'QR code'), modif ? h('th', { class: 'ecran' }) : null)),
          h('tbody', {}, liens.map((l, i) => h('tr', {},
            h('td', {}, champ(l.titre || '', async (v) => { l.titre = v; await enregistrer(); }, { multi: true, lecture: !modif, placeholder: 'ex. Vidéo AQC – La responsabilité décennale' })),
            h('td', {}, champ(l.url || '', async (v) => { l.url = v.trim(); if (l.url && l.qr === undefined) l.qr = true; await enregistrer(); dessiner(); },
              { lecture: !modif, placeholder: 'https://…' })),
            h('td', { class: 'centre' }, h('input', { type: 'checkbox', checked: !!l.qr, disabled: !modif || !l.url, title: l.url ? 'Imprimer un QR code pour cette ressource' : 'Indiquer d’abord une adresse',
              onchange: async (e) => { l.qr = e.target.checked; try { await enregistrer(); } catch (x) { erreur(x); } } })),
            modif ? h('td', { class: 'ecran' }, h('button', { class: 'icone petit', type: 'button', title: 'Retirer cette ressource', onclick: async () => {
              liens.splice(i, 1); try { await enregistrer(); dessiner(); } catch (x) { erreur(x); } } }, '✖')) : null)))) : h('p', { class: 'gris' }, 'Aucune ressource.'),
        modif ? h('button', { class: 'lien petit ecran', type: 'button', onclick: async () => {
          liens.push({ titre: '', url: '', qr: true }); try { await enregistrer(); dessiner(); } catch (x) { erreur(x); } } }, '＋ ajouter une ressource') : null);
      ajusterTout(zone);
    };
    dessiner();
    return zone;
  }
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
      // QR codes des ressources, visibles à l'écran sous le cadre et repris sur le sujet élève imprimé
      const zoneQr = h('div', { class: 'qr-ecran' });
      const majQr = () => vider(zoneQr, lireLiens(o).some((l) => l.qr && l.url)
        ? [h('h3', {}, '📱  Aperçu des QR codes imprimés sur le sujet élève'), ressourcesQr(lireLiens(o).filter((l) => l.qr && l.url))] : null);
      majQr();
      const sauverO = () => db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: o }], 'seance_id');
      vider(zoneC, h('section', { class: 'cadre-maison ' + cle },
        h('div', { class: 'tete-maison' }, h('h3', {}, C.titre),
          h('span', { class: 'actions-maison ecran' },
          h('button', { class: 'btn petit', type: 'button', title: 'Imprimer ce cadre seul : sujet à distribuer aux élèves, avec les QR codes des ressources', onclick: () => imprimerCadre(x, cle, o) }, '🖶  Imprimer le sujet élève'),
          modif ? h('button', { class: 'lien petit ecran', type: 'button', onclick: async () => {
            if (!(await confirmer('Retirer le cadre', 'Retirer ce travail à la maison et son contenu ? (« Annuler » permet de revenir en arrière.)', 'Retirer'))) return;
            try { await db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: null }], 'seance_id'); f[C.col] = null; dessinerC(); } catch (e) { erreur(e); }
          } }, '✖ retirer') : null)),
        h('div', { class: 'grille-infos' },
          h('div', { class: 'info' }, h('span', { class: 'lib' }, C.echeance), champ(o.echeance || '', enreg('echeance'), { type: 'date', lecture: !modif })),
          h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Durée estimée'), champ(o.duree || '', enreg('duree'), { lecture: !modif, placeholder: modif ? 'ex. 45 min' : '' }))),
        h('div', { class: 'deux' }, C.rubriques.filter(([k]) => k !== 'ressources').map(([k, lib, aide]) => zoneTexte(lib, o[k], enreg(k), aide))),
        C.rubriques.some(([k]) => k === 'ressources') ? h('div', { class: 'rubrique' }, h('h3', {}, C.rubriques.find(([k]) => k === 'ressources')[1]),
          editeurLiens(o, sauverO, majQr)) : null,
        zoneQr));
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
