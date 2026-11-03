// Fiches d'une séquence : préparation de séquence, contrat sommatif, puis pour chaque séance sa fiche de déroulement
// et son contrat formatif. Sans séquence choisie : liste des séquences de chaque matière.
import { db } from '../api.js';
import { boutonAnnuler } from '../annuler.js';
import { h, vider, champ, erreur, heures, ajusterTout, imprimer, confirmer, dateFr, toast, fenetre } from '../ui.js';
import { dessinerContrat, moyenne, niveau, arrondi, ORGAS, LIEUX } from './contrat.js';
import { telecharger, nomFichier, exportSequence } from '../echange.js';
import { qrSVG, liensLibelles } from '../qr.js';

// anciens intitulés proposés par défaut : retirés (les phases se rédigent entièrement)
const PHASES_ANCIENNES = ['Lancement (contexte, objectifs)', 'Découverte / recherche', 'Structuration (synthèse)', 'Application / entraînement', 'Évaluation et bilan'];
const NB_PHASES = 5;
const COLS_PHASES = [['phase', 'Phase'], ['activite', 'Activité proposée'], ['enseignant', 'Activités de l’enseignant'],
  ['eleves', 'Activités des élèves'], ['duree', 'Durée']];
const idPhase = () => 'p' + Math.random().toString(36).slice(2, 9);
const phaseVide = () => ({ id: idPhase(), phase: '', activite: '', enseignant: '', eleves: '', duree: '' });
// intitulé saisi sans son numéro (« 2. Découverte » → « Découverte ») ; intitulés par défaut d'avant effacés
const sansNumero = (t) => { const v = String(t || '').replace(/^\s*\d+\s*[.)-]?\s*/, ''); return PHASES_ANCIENNES.includes(v.trim()) ? '' : v; };

export async function pageFiches(zone, arg, ctx) {
  let [sid, onglet = 'preparation'] = String(arg || '').split(':');
  if (!sid || !/^\d+$/.test(sid)) return index(zone, ctx, MODES[sid] ? sid : 'preparation');
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
  const effectif = `${actifs.length} élèves (${app} apprentis · ${actifs.length - app} scolaires${actifs.some((e) => e.redoublant) ? ` · dont ${actifs.filter((e) => e.redoublant).length} redoublant(s)` : ""})`;
  const profs = ctx.enseignantsDe(m.id).join(', ') || '—';
  const promo = ctx.promotions.find((p) => p.id === sq.promotion_id)?.libelle || '';
  const remplies = seances.filter((x) => x.titre || x.objectif_inter);
  const volume = `${remplies.length} séance(s) · ${heures(remplies.reduce((a, x) => a + (Number(x.duree) || 0), 0)) || '0 h'}`;
  const ficheSeq = fs[0] || {};
  const lien = (o) => `#/fiches/${sq.id}:${o}`;
  const premiereSeance = seances[0] ? `seance-${seances[0].id}` : 'preparation';
  // onglets génériques (depuis le menu) : première fiche de déroulement / premier contrat formatif de la séquence
  if (onglet === 'deroulement') onglet = premiereSeance;
  if (onglet === 'formatifs') onglet = seances[0] ? `formatif-${seances[0].id}` : 'sommatif';
  const RE_SEANCE = /^(seance|formatif|avant|apres)-/;
  const idSeance = RE_SEANCE.test(onglet) ? onglet.split('-')[1] : null;
  // trois onglets : fiche de préparation · fiches de déroulement (une par séance) · fiches contrats (sommatif + formatifs)
  const groupe = onglet === 'preparation' || !onglet ? 'preparation' : onglet.startsWith('seance-') || onglet.startsWith('avant-') || onglet.startsWith('apres-') ? 'deroulement' : 'contrats';
  const sousOnglets = () => {
    const tab = (k, t, titre = '') => h('a', { href: lien(k), class: k === onglet ? 'actif' : '', title: titre }, t);
    if (groupe === 'deroulement') return h('nav', { class: 'sous-onglets ecran' }, h('span', { class: 'lib-sous' }, 'Fiches de déroulement :'), seances.map((x) => tab(`seance-${x.id}`, `Séance ${sq.numero}.${x.numero}`, x.titre || '')));
    if (groupe === 'contrats') return h('nav', { class: 'sous-onglets ecran' }, h('span', { class: 'lib-sous' }, 'Fiche contrat sommatif :'), tab('sommatif', `Séquence ${sq.numero}`),
      h('span', { class: 'lib-sous sep' }, 'Fiches contrats formatifs :'),
      seances.map((x) => tab(`formatif-${x.id}`, `Séance ${sq.numero}.${x.numero}`, `Fiche contrat formatif · séance ${sq.numero}.${x.numero}${x.titre ? ' · ' + x.titre : ''}`)));
    return null;
  };

  // ------------------------------------------------------------------------------------- en-tête et onglets
  const onglets = [['preparation', '📋  Fiche de préparation', 'preparation'], [premiereSeance, `📝  Fiches de déroulement (${seances.length})`, 'deroulement'],
    ['sommatif', `✅  Fiches contrats (${seances.length + 1})`, 'contrats']];
  vider(zone,
    h('header', { class: 'entete-page ecran' },
      h('div', {}, h('h1', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), `Séquence ${sq.numero} · ${sq.intitule || 'sans intitulé'}`),
        h('p', { class: 'sous-titre' }, `${m.nom}  ·  Promotion ${promo}  ·  ${volume}`)),
      h('div', { class: 'actions-page' },
        h('select', { class: 'champ choix-mat', onchange: (e) => { location.hash = `#/fiches/${e.target.value}:${groupe === 'deroulement' ? 'deroulement' : onglet === 'sommatif' ? 'sommatif' : onglet.startsWith('formatif') ? 'formatifs' : 'preparation'}`; } },
          toutes.map((s) => h('option', { value: s.id, selected: s.id === sq.id }, `Séquence ${s.numero} · ${s.intitule || 'sans intitulé'}`))),
        modif ? boutonAnnuler(ctx, 'fiches') : null,
        h('button', { class: 'btn', onclick: () => imprimer('A4 portrait') }, '🖶  Imprimer'),
        h('button', { class: 'btn', onclick: () => menuTelecharger() }, '⬇  Télécharger'),
        h('a', { class: 'btn', href: '#/sequencage/' + m.id }, 'Séquençage'))),
    h('nav', { class: 'onglets ecran' }, onglets.map(([k, t, g]) => h('a', { href: lien(k), class: g === groupe ? 'actif' : '' }, t))),
    sousOnglets(),
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
      entete('FICHE CONTRAT SOMMATIF', `Séquence ${sq.numero} · ${sq.intitule || ''}`),
      h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif)),
      h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif principal'), h('p', { class: 'fort' }, sq.objectif || '—')), corps));
    await dessinerContrat(corps, { type: 'sommatif', id: sq.id, modif, ctx,
      titreGroupe: (g) => ({ code: g, libelle: ref.comp[g]?.libelle || '' }) });
  }

  // ------------------------------------------------------------------------------------- séance : déroulement + contrat formatif
  async function seance(x) {
    const f = (await db.lire('fiches_seance', `seance_id=eq.${x.id}`))[0] || {};
    const maj = (col) => (v) => db.enregistrer('fiches_seance', [{ seance_id: x.id, [col]: v }], 'seance_id');
    const sansId = Array.isArray(f.phases) && f.phases.some((p) => !p.id);
    let phases = Array.isArray(f.phases) && f.phases.length ? f.phases.map((p) => ({ ...phaseVide(), ...p, phase: sansNumero(p.phase), id: p.id || idPhase() }))
      : Array.from({ length: NB_PHASES }, phaseVide);
    let attenteAct = null;
    const sauverPhases = async () => {
      await db.enregistrer('fiches_seance', [{ seance_id: x.id, phases }], 'seance_id');
      clearTimeout(attenteAct); attenteAct = setTimeout(() => dessinerActivites(), 150);   // les fiches activité suivent le déroulement
    };
    // fiches activité : critères du contrat formatif de la séance (critères de réussite)
    const ctF = (await db.lire('contrats', `type=eq.formatif&seance_id=eq.${x.id}`))[0];
    const criteresF = ctF ? await db.lire('criteres', `contrat_id=eq.${ctF.id}&order=groupe_ordre,ordre,id`) : [];
    let activitesEnreg = Array.isArray(f.activites) ? f.activites : [];
    if (sansId && modif) {   // anciennes phases sans identifiant : rattachement des activités déjà enregistrées, puis identifiants enregistrés
      activitesEnreg = activitesEnreg.map((a) => (!a.cle && Number.isInteger(a.index) && phases[a.index] ? { ...a, cle: phases[a.index].id } : a));
      db.enregistrer('fiches_seance', [{ seance_id: x.id, phases, activites: activitesEnreg }], 'seance_id').catch(() => {});
    }
    const zoneAct = h('div', { class: 'zone-activites ecran', style: { '--couleur': m.couleur } });
    const sauverAct = () => db.enregistrer('fiches_seance', [{ seance_id: x.id, activites: activitesEnreg }], 'seance_id');
    const modifActivite = async (a, k, v) => {
      let o = activitesEnreg.find((e) => e.cle === a.cle);
      if (!o) { o = { cle: a.cle }; activitesEnreg.push(o); }
      if (k in a.auto && v === a.auto[k]) delete o[k]; else o[k] = v;
      a[k] = v;
      await sauverAct();
    };
    const S = { sq, m, promo, profs };
    function dessinerActivites() {
      const L = activitesSeance(x, { ...f, phases, activites: activitesEnreg }, criteresF, ref);
      const ouvertes = new Set([...zoneAct.querySelectorAll('details[open]')].map((d) => d.dataset.cle));
      vider(zoneAct, h('section', { class: 'bloc-activites' },
        h('div', { class: 'tete-activites' }, h('h3', {}, '🧩  Fiches activité', h('small', {}, L.length ? `  ${L.filter((a) => !a.exclue).length} activité(s)` : '')),
          h('p', { class: 'aide' }, 'Une fiche par phase dont la colonne « Activité proposée » est remplie. Elle se pré-remplit automatiquement avec la fiche de déroulement, le séquençage et le contrat formatif (repère « auto ») ; détaillez ensuite chaque rubrique autant que nécessaire : vos compléments sont conservés, les rubriques non modifiées continuent de suivre la fiche de déroulement.')),
        L.length ? L.map((a) => carteActivite(a, ouvertes.has(a.cle)))
          : h('p', { class: 'vide petit' }, 'Aucune activité prévue : remplissez la colonne « Activité proposée » d’une phase du déroulement, sa fiche activité apparaîtra ici.')));
      ajusterTout(zoneAct);
    }
    function carteActivite(a, ouverte) {
      const sortie = (version, mode) => envoyerPDF(modeleActivite(a, x, S, version), mode);
      const boutons = h('span', { class: 'actions-activite' },
        h('button', { class: 'btn petit', type: 'button', title: 'Imprimer la fiche élève (A4)', onclick: (e) => { e.preventDefault(); sortie('eleve', 'imprimer'); } }, '🖶  Imprimer'),
        h('button', { class: 'btn petit', type: 'button', title: 'Télécharger la fiche élève en PDF', onclick: (e) => { e.preventDefault(); sortie('eleve', 'pdf'); } }, '⬇  PDF élève'),
        h('button', { class: 'btn petit', type: 'button', title: 'Télécharger la version enseignant (compétences, éléments de correction)', onclick: (e) => { e.preventDefault(); sortie('enseignant', 'pdf'); } }, '⬇  Version enseignant'));
      if (a.exclue) return h('div', { class: 'carte-activite exclue' }, h('span', {}, `Phase ${a.index + 1} · ${a.titre} : pas de fiche activité`),
        modif ? h('button', { class: 'lien petit', type: 'button', onclick: async () => { await modifActivite(a, 'exclue', false); dessinerActivites(); } }, 'Créer la fiche') : null);
      const zone = (k, lib, aide, source) => {
        const auto = a.auto[k] || '', change = a[k] !== auto;
        const z = h('div', { class: 'rubrique' + (['contexte', 'objectif', 'consignes', 'ressources', 'corrige'].includes(k) ? ' pleine' : '') },
          h('h3', {}, lib, auto && !change && source ? h('span', { class: 'tag-auto', title: 'Rempli automatiquement depuis : ' + source }, 'auto') : null,
            change && auto && modif ? h('button', { class: 'lien petit reprendre', type: 'button', title: 'Remettre le texte de la fiche de déroulement (' + source + ')',
              onclick: async () => { await modifActivite(a, k, auto); dessinerActivites(); } }, '↺ reprendre la fiche') : null),
          champ(a[k], (v) => modifActivite(a, k, v), { multi: true, lecture: !modif, placeholder: modif ? aide : '' }));
        if (k === 'ressources') {
          const zqr = h('div', { class: 'qr-liens' });
          const maj = (t) => vider(zqr, liensLibelles(t).map(({ url, lib: l }) => h('a', { class: 'qr-lien', href: url, target: '_blank', rel: 'noopener' }, l ? h('b', {}, l) : null, qrSVG(url, 80), h('span', {}, url))));
          maj(a[k]); z.querySelector('textarea')?.addEventListener('input', (e) => maj(e.target.value)); z.append(zqr);
        }
        return z;
      };
      const petit = (k, lib, opts = {}) => h('div', { class: 'info' }, h('span', { class: 'lib' }, lib), champ(a[k], (v) => modifActivite(a, k, v), { lecture: !modif, ...opts }));
      const corps = h('div', { class: 'corps-activite' },
        h('div', { class: 'grille-infos' }, petit('titre', 'Titre de l’activité'), petit('duree', 'Durée'),
          petit('organisation', 'Organisation', { placeholder: modif ? 'Individuel, binôme…' : '' }), petit('lieu', 'Lieu / salle'),
          petit('lignes', 'Lignes de réponse sur la fiche', { type: 'number' }),
          h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Phase du déroulement'), h('span', { class: 'val' }, `${a.index + 1}. ${a.phase.phase || '(sans intitulé)'}`))),
        h('div', { class: 'deux' }, CHAMPS_ACTIVITE.map(([k, lib, aide, source]) => zone(k, lib, aide, source))),
        h('div', { class: 'pied-activite' },
          h('label', { class: 'case-form' }, h('input', { type: 'checkbox', checked: a.aideFiche, disabled: !modif, onchange: (e) => modifActivite(a, 'aideFiche', e.target.checked) }), ' Imprimer les coups de pouce sur la fiche élève'),
          modif ? h('button', { class: 'lien petit', type: 'button', onclick: async () => {
            if (!(await confirmer('Pas de fiche activité', 'Ne pas faire de fiche activité pour cette phase ? (Vous pourrez la recréer ; vos compléments sont conservés.)', 'Confirmer'))) return;
            await modifActivite(a, 'exclue', true); dessinerActivites(); } }, '✖ pas de fiche pour cette phase') : null));
      corps.querySelectorAll('input[type=number]').forEach((i) => { i.min = 0; i.max = 40; });
      const org = corps.querySelectorAll('.grille-infos input')[2]; if (org) org.setAttribute('list', 'dl-orgas-act');
      const lieu = corps.querySelectorAll('.grille-infos input')[3]; if (lieu) lieu.setAttribute('list', 'dl-lieux-act');
      const d = h('details', { class: 'carte-activite', 'data-cle': a.cle, open: ouverte },
        h('summary', {}, h('span', { class: 'num-activite' }, a.numero),
          h('span', { class: 'titre-activite' }, h('b', {}, a.titre), h('small', {}, [a.duree, a.organisation, a.lieu].filter(Boolean).join(' · ') || `phase ${a.index + 1}`)), boutons),
        corps, h('datalist', { id: 'dl-orgas-act' }, ORGAS.map((o) => h('option', { value: o }))), h('datalist', { id: 'dl-lieux-act' }, LIEUX.map((o) => h('option', { value: o }))));
      d.addEventListener('toggle', () => { if (d.open) ajusterTout(d); });
      return d;
    }
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
        zoneAct,
        cadreMaison(x, f, 'apres'),
        zoneTexte('Évaluation', f.evaluation, maj('evaluation')),
        zoneTexte('Différenciation scolaires / apprentis', f.differenciation, maj('differenciation')),
        zoneTexte('Bilan de séance / remédiation', f.bilan, maj('bilan'), 'Après la séance…')),
      h('p', { class: 'aide ecran' }, 'La fiche contrat formatif de cette séance est dans l’onglet « Fiches contrats ».'));
    dessinerPhases();
    dessinerActivites();
    ajusterTout(fiche);
  }

  // ------------------------------------------------------------------------------------- séance : travail à la maison (option)
  const CHAMPS_MAISON = {
    avant: { col: 'maison_avant', titre: '🏠  Avant la séance : travail préparatoire à la maison (classe inversée)', ajout: '＋  Ajouter un travail préparatoire avant la séance (classe inversée)',
      echeance: 'À faire pour le', rubriques: [
        ['objectif', 'Objectif du travail préparatoire', 'Ce que l’élève doit avoir découvert ou compris en arrivant en classe…'],
        ['consignes', 'Travail demandé', '1. Regarder la vidéo…\n2. Lire le document…\n3. Répondre aux questions…'],
        ['ressources', 'Ressources (vidéos, documents, liens)', 'Liens (https://…), pages du manuel, documents déposés sur l’ENT… Un QR code est créé pour chaque lien.']] },
    apres: { col: 'maison_apres', titre: '📚  Après la séance : travail à la maison (devoirs)', ajout: '＋  Ajouter un travail à la maison après la séance (devoirs)',
      echeance: 'À rendre le', rubriques: [
        ['consignes', 'Travail demandé', 'Exercices, recherche, rédaction, révision…'],
        ['ressources', 'Ressources (documents, liens)', 'Documents, pages du manuel, liens (https://…)… Un QR code est créé pour chaque lien.'],
        ['rendu', 'Modalités de rendu', 'Sur papier, dépôt sur l’ENT, par mail…'],
        ['correction', 'Correction / évaluation', 'Correction en classe, notation, critères…']] },
  };
  // feuille élève d'un travail à la maison (A4 portrait) : téléchargée en PDF ou envoyée à l'imprimante
  async function sortieMaison(x, cle, o, mode) {
    try {
      toast(mode === 'pdf' ? 'Préparation du PDF…' : 'Préparation de l’impression…');
      const [{ chargerOutils, creerPDF }] = await Promise.all([import('../pdf.js')]);
      await chargerOutils();
      const logo = await fetch('img/logo.jpg').then((r) => r.arrayBuffer()).catch(() => null);
      const avant = cle === 'avant', dt = (v) => (v ? new Date(v + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
      const R = (titre, texte) => ({ t: 'rubrique', titre, texte });
      const rub = avant ? [['objectif', 'Objectif'], ['consignes', 'Travail demandé'], ['ressources', 'Ressources']]
        : [['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['rendu', 'Modalités de rendu'], ['correction', 'Correction / évaluation']];
      const liens = liensLibelles(o.ressources);
      const doc = {
        fichier: nomFichier(`${ctx.codeMat(m)}_S${sq.numero}.${x.numero}_${avant ? 'travail_preparatoire' : 'travail_a_la_maison'}.pdf`),
        titre: `${avant ? 'Travail préparatoire' : 'Travail à la maison'} · séance ${sq.numero}.${x.numero}`,
        pied: `${m.nom} · Séance ${sq.numero}.${x.numero} · Promotion ${promo}`,
        blocs: [
          { t: 'titre', texte: avant ? 'TRAVAIL PRÉPARATOIRE À LA MAISON' : 'TRAVAIL À LA MAISON', sous: `${m.nom} · Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`, couleur: avant ? '#E8893A' : '#3D84C6' },
          { t: 'infos', paires: [['Matière', m.nom], ['Enseignant', profs], [avant ? 'À faire pour le' : 'À rendre le', dt(o.echeance)], ['Durée estimée', o.duree], ['Promotion', promo], ['Séance', `${sq.numero}.${x.numero} · ${x.titre || ''}`]] },
          ...rub.flatMap(([k, l]) => [o[k] ? R(l, o[k]) : null, k === 'ressources' && liens.length ? { t: 'qr', liens } : null]).filter(Boolean),
          { t: 'note', texte: liens.length ? 'Scannez un QR code avec l’appareil photo de votre téléphone pour ouvrir directement la ressource.' : '' },
        ] };
      await envoyerPDF(doc, mode, { creerPDF, logo });
    } catch (e) { erreur(e); }
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
      vider(zoneC, h('section', { class: 'cadre-maison ' + cle },
        h('div', { class: 'tete-maison' }, h('h3', {}, C.titre),
          h('span', { class: 'actions-maison ecran' },
            h('button', { class: 'btn petit', type: 'button', title: 'Imprimer ce travail seul (feuille A4 à distribuer aux élèves)', onclick: () => sortieMaison(x, cle, o, 'imprimer') }, '🖶  Imprimer'),
            h('button', { class: 'btn petit', type: 'button', title: 'Télécharger ce travail seul en PDF (A4)', onclick: () => sortieMaison(x, cle, o, 'pdf') }, '⬇  PDF')),
          modif ? h('button', { class: 'lien petit ecran', type: 'button', onclick: async () => {
            if (!(await confirmer('Retirer le cadre', 'Retirer ce travail à la maison et son contenu ? (« Annuler » permet de revenir en arrière.)', 'Retirer'))) return;
            try { await db.enregistrer('fiches_seance', [{ seance_id: x.id, [C.col]: null }], 'seance_id'); f[C.col] = null; dessinerC(); } catch (e) { erreur(e); }
          } }, '✖ retirer') : null),
        h('div', { class: 'grille-infos' },
          h('div', { class: 'info' }, h('span', { class: 'lib' }, C.echeance), champ(o.echeance || '', enreg('echeance'), { type: 'date', lecture: !modif })),
          h('div', { class: 'info' }, h('span', { class: 'lib' }, 'Durée estimée'), champ(o.duree || '', enreg('duree'), { lecture: !modif, placeholder: modif ? 'ex. 45 min' : '' }))),
        h('div', { class: 'deux' }, C.rubriques.map(([k, lib, aide]) => {
          if (k !== 'ressources') return zoneTexte(lib, o[k], enreg(k), aide);
          // ressources : les liens repris avec leur adresse et un QR code (accès direct depuis un téléphone)
          const zqr = h('div', { class: 'qr-liens' });
          const majQR = (t) => vider(zqr, liensLibelles(t).map(({ url, lib }) => h('div', { class: 'qr-carte' },
            h('a', { class: 'qr-lien', href: url, target: '_blank', rel: 'noopener', title: 'Ouvrir le lien' }, lib ? h('b', {}, lib) : null, qrSVG(url, 96), h('span', {}, url)),
            modif ? h('button', { class: 'qr-retirer ecran', type: 'button', title: 'Retirer ce lien des ressources', onclick: () => retirerLien(url) }, '✖') : null)),
          modif ? h('button', { class: 'qr-ajout ecran', type: 'button', onclick: ajouterLien }, h('span', { class: 'plus' }, '＋'), 'Ajouter un lien', h('small', {}, 'avec son QR code')) : null);
          // ajout d'un lien (titre + adresse) : une ligne « Titre : adresse » dans les ressources
          async function ajouterLien() {
            const titre = h('input', { class: 'champ', placeholder: 'ex. Vidéo de présentation' });
            const adr = h('input', { class: 'champ', type: 'url', placeholder: 'https://…' });
            const apercu = h('div', { class: 'qr-apercu' });
            adr.addEventListener('input', () => { const u = liensLibelles(adr.value.trim())[0]?.url; vider(apercu, u ? qrSVG(u, 110) : h('span', { class: 'gris' }, 'Le QR code apparaît ici')); });
            vider(apercu, h('span', { class: 'gris' }, 'Le QR code apparaît ici'));
            const r = await fenetre('Ajouter un lien et son QR code', h('div', { class: 'formulaire form-qr' },
              h('div', {}, h('label', {}, 'Titre (facultatif)', titre), h('label', {}, 'Adresse du lien', adr),
                h('p', { class: 'aide' }, 'Collez l’adresse complète (vidéo, document de l’ENT, site…). Le lien est ajouté aux ressources avec son QR code, à l’écran et dans le PDF.')), apercu),
            [{ texte: 'Annuler', valeur: null }, { texte: '＋  Ajouter', classe: 'principal', action: () => {
              let u = adr.value.trim();
              if (u && !/^(https?:\/\/|www\.)/i.test(u)) u = 'https://' + u;
              if (!liensLibelles(u).length) throw new Error('Adresse invalide : elle doit commencer par https://, http:// ou www.');
              return { u, t: titre.value.trim().replace(/:$/, '') };
            } }]);
            if (!r) return;
            const v = String(o[k] || '').replace(/\s+$/, '');
            await enreg(k)((v ? v + '\n' : '') + (r.t ? `${r.t} : ` : '') + r.u);
            dessinerC();
          }
          async function retirerLien(url) {
            if (!(await confirmer('Retirer le lien', `Retirer ce lien (et son QR code) des ressources ?\n${url}`, 'Retirer'))) return;
            const court = url.replace(/^https:\/\/(?=www\.)/i, '');
            const lignes = String(o[k] || '').split('\n').filter((l) => !(l.includes(url) || l.includes(court)));
            await enreg(k)(lignes.join('\n'));
            dessinerC();
          }
          majQR(o[k]);
          const z = zoneTexte(lib, o[k], async (v) => { await enreg(k)(v); majQR(v); }, aide);
          z.append(zqr); z.classList.add('pleine');
          return z;
        }))));
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
        entete('FICHE CONTRAT FORMATIF', titre),
        h('div', { class: 'grille-infos' }, info('Matière', m.nom), info('Enseignant', profs), info('Promotion', promo), info('Effectif', effectif)),
        h('div', { class: 'rubrique' }, h('h3', {}, 'Objectif intermédiaire évalué'), h('p', { class: 'fort' }, x.objectif_inter || '—')), corps));
    await dessinerContrat(corps, { type: 'formatif', id: x.id, modif, ctx, titreGroupe: (g) => ({ code: g, libelle: '' }) });
  }

  // ------------------------------------------------------------------------------------- téléchargement (PDF A4 portrait dans un .zip)
  // choix des documents : préparation et contrat sommatif de la séquence, fiche de déroulement et contrat formatif de chaque séance
  async function menuTelecharger() {
    const docs = [['preparation', 'Fiche de préparation de séquence', null], ['sommatif', 'Fiche contrat sommatif', null],
      ...seances.flatMap((x) => [[`seance-${x.id}`, `Fiche de déroulement`, x], [`activites-${x.id}`, `Fiches activité`, x], [`formatif-${x.id}`, `Fiche contrat formatif`, x]])];
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
      h('fieldset', { class: 'groupe-docs' }, h('legend', {}, `Séquence ${sq.numero} · ${sq.intitule || ''}`), ligne('preparation', 'Fiche de préparation de séquence'), ligne('sommatif', 'Fiche contrat sommatif')),
      seances.map((x) => h('fieldset', { class: 'groupe-docs' + (String(x.id) === idSeance ? ' courante' : '') },
        h('legend', {}, h('label', {}, h('input', { type: 'checkbox', checked: coche(`seance-${x.id}`) && coche(`formatif-${x.id}`), onchange: (e) => {
          [`seance-${x.id}`, `activites-${x.id}`, `formatif-${x.id}`].forEach((k) => { cases.get(k).checked = e.target.checked; }); majCompte(); } }),
        `Séance ${sq.numero}.${x.numero} · ${x.titre || 'sans titre'}`)),
        ligne(`seance-${x.id}`, 'Fiche de déroulement (avec le travail à la maison)'), ligne(`activites-${x.id}`, 'Fiches activité (version élève, s’il y en a)'), ligne(`formatif-${x.id}`, 'Fiche contrat formatif')))),
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
    effectif: `${actifs.length} élèves (${app} apprentis · ${actifs.length - app} scolaires${actifs.some((e) => e.redoublant) ? ` · dont ${actifs.filter((e) => e.redoublant).length} redoublant(s)` : ""})`,
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
      ...(cle === 'avant' ? [['objectif', 'Objectif du travail préparatoire'], ['consignes', 'Travail demandé'], ['ressources', 'Ressources']]
        : [['consignes', 'Travail demandé'], ['ressources', 'Ressources'], ['rendu', 'Modalités de rendu'], ['correction', 'Correction / évaluation']])
        .flatMap(([k, l]) => [R(l, o[k]), k === 'ressources' && liensLibelles(o[k]).length ? { t: 'qr', liens: liensLibelles(o[k]) } : null]).filter(Boolean)] });
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
    return [{ t: 'titre', texte: `FICHE CONTRAT ${type === 'sommatif' ? 'SOMMATIF' : 'FORMATIF'}`, sous: titre, couleur: m.couleur },
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
      out.push({ fichier: `${num(1)}_Fiche_contrat_sommatif_sequence_${sq.numero}.pdf`, titre: `Fiche contrat sommatif · séquence ${sq.numero}`, pied,
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
        (() => { const L = activitesSeance(x, f).filter((a) => !a.exclue);
          return L.length ? R('Fiches activité (documents élèves séparés)', L.map((a) => `Activité ${a.numero} · ${a.titre}${a.duree ? ' · ' + a.duree : ''}  (phase ${a.index + 1})`).join('\n')) : null; })(),
        maison(f.maison_apres, 'apres'),
        R('Évaluation', f.evaluation), R('Différenciation scolaires / apprentis', f.differenciation), R('Bilan de séance / remédiation', f.bilan)].filter(Boolean) });
    } else if (k.startsWith('activites-')) {
      const f = d.seances.find((y) => y.numero === x.numero)?.fiche || {};
      const ct = (await db.lire('contrats', `type=eq.formatif&seance_id=eq.${x.id}`))[0];
      const ks = ct ? await db.lire('criteres', `contrat_id=eq.${ct.id}&order=groupe_ordre,ordre,id`) : [];
      activitesSeance(x, f, ks, ref).filter((a) => !a.exclue).forEach((a) => {
        const doc = modeleActivite(a, x, { sq, m, promo, profs });
        out.push({ ...doc, fichier: `S${sq.numero}.${x.numero}_a${a.numero}_Fiche_activite.pdf` });
      });
    } else if (k.startsWith('formatif-')) {
      out.push({ fichier: `S${sq.numero}.${x.numero}_b_Fiche_contrat_formatif.pdf`, titre: `Fiche contrat formatif · séance ${sq.numero}.${x.numero}`, pied,
        blocs: await contrat('formatif', x.id, `Séance ${sq.numero}.${x.numero} · ${x.titre || ''}`, (g) => g) });
    }
  }
  return out;
}


// ------------------------------------------------------------------------------------- liste des séquences
// documents ouverts depuis le menu « Documents professeurs » : titre de la page et onglet à ouvrir dans chaque séquence
const MODES = {
  preparation: ['Fiches de préparation de séquence', 'preparation', '📋', 'Documents de préparation'],
  deroulement: ['Fiches de déroulement de séance', 'deroulement', '📝', 'Documents de préparation'],
  formatifs: ['Fiches contrats formatifs', 'formatifs', '✅', 'Documents d’évaluation'],
  sommatif: ['Fiches contrats sommatifs', 'sommatif', '🏁', 'Documents d’évaluation'],
};
async function index(zone, ctx, mode = 'preparation') {
  const [titre, onglet, icone, groupe] = MODES[mode];
  const sequences = await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`);
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, `${icone}  ${titre}`),
      h('p', { class: 'sous-titre' }, `Documents professeurs · ${groupe}  ·  Promotion ${ctx.promo.libelle}  ·  choisir une séquence`))),
    h('nav', { class: 'onglets' }, Object.entries(MODES).map(([k, [t, , ic]]) => h('a', { href: '#/fiches/' + k, class: k === mode ? 'actif' : '' }, `${ic}  ${t}`))),
    h('section', { class: 'grille-matieres' }, ctx.matieres.map((m) => {
      const sq = sequences.filter((s) => s.matiere_id === m.id);
      return h('div', { class: 'carte-matiere', style: { '--couleur': m.couleur } },
        h('div', { class: 'bandeau' }, h('h3', {}, m.nom)),
        sq.length ? h('button', { class: 'btn petit classeur', title: 'Un seul PDF : page de garde, sommaire, séquençage, fiches et contrats', onclick: async () => {
          const { telechargerClasseur } = await import('../classeur.js'); await telechargerClasseur(m, ctx); } }, '📘  Classeur PDF de la matière') : null,
        sq.length ? h('ul', { class: 'liste-seq' }, sq.map((s) => h('li', {}, h('a', { href: `#/fiches/${s.id}:${onglet}` }, h('b', {}, `Séquence ${s.numero}`), ' · ', s.intitule || 'sans intitulé'))))
          : h('p', { class: 'profs' }, 'Aucune séquence pour cette promotion.'));
    })));
}


// ------------------------------------------------------------------------------------- fiches activité
// Une fiche activité par phase du déroulement dont la colonne « Activité proposée » est remplie. Chaque rubrique se
// remplit automatiquement à partir de la fiche de déroulement (et du séquençage, du contrat formatif) ; l'enseignant
// peut la compléter ou la modifier : seules ses modifications sont enregistrées (fiches_seance.activites).
export const CHAMPS_ACTIVITE = [
  // [clé, libellé, aide, source automatique (texte)]
  ['contexte', 'Mise en situation', 'Contexte professionnel, problème à résoudre…', 'colonne « Activité proposée » de la phase'],
  ['objectif', 'Objectif de l’activité', 'À la fin de l’activité, je suis capable de…', 'objectif intermédiaire et objectifs opérationnels de la séance'],
  ['consignes', 'Travail demandé (une étape par ligne)', 'Étape 1…\nÉtape 2…', 'colonne « Activités des élèves » de la phase'],
  ['ressources', 'Documents, matériel et ressources', 'Plans, extraits du DCE, liens (https://…)…', 'rubrique « Matériel et ressources » de la fiche'],
  ['production', 'Production attendue', 'Ce que je dois rendre : tableau complété, schéma, note de calcul…', ''],
  ['criteres', 'Critères de réussite (un par ligne)', 'Le travail est réussi si…', 'critères de la fiche contrat formatif'],
  ['aide', 'Coups de pouce', 'Indices pour les élèves en difficulté…', 'rubrique « Différenciation » de la fiche'],
  ['plus', 'Pour aller plus loin', 'Prolongement pour les élèves qui ont terminé…', ''],
  ['corrige', 'Éléments de correction (version enseignant)', 'Réponses attendues, points de vigilance…', ''],
];
const lignesDe = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*(?:[-•*]|\d+\s*[.)-])\s*/, '').trim()).filter(Boolean);
const organisationDe = (t) => (/bin[oô]me/i.test(t) ? 'Binôme' : /groupe|îlot/i.test(t) ? 'En groupe' : /classe entière|collectif/i.test(t) ? 'Classe entière' : /individuel/i.test(t) ? 'Individuel' : '');
export const cleActivite = (p, i) => p.id || `i${i}`;

// activités d'une séance : valeurs automatiques + modifications de l'enseignant (a.auto[k] = valeur automatique, a[k] = valeur retenue)
export function activitesSeance(x, f, criteres = [], ref = null) {
  const phases = Array.isArray(f?.phases) ? f.phases : [];
  const enreg = Array.isArray(f?.activites) ? f.activites : [];
  const out = [];
  phases.forEach((p, i) => {
    if (!String(p.activite || '').trim()) return;
    const cle = cleActivite(p, i);
    const o = enreg.find((a) => a.cle === cle) || enreg.find((a) => a.index === i && !a.cle) || {};
    const objectif = [x.objectif_inter, ...lignesDe(x.objectifs_ops)].filter(Boolean).join('\n');
    const auto = {
      titre: String(p.phase || '').trim() || lignesDe(p.activite)[0] || 'Activité',
      duree: p.duree || '', organisation: organisationDe(`${p.activite} ${p.eleves}`), lieu: f?.salle || '',
      contexte: p.activite || '', objectif, consignes: lignesDe(p.eleves).join('\n'), ressources: f?.materiel || '', production: '',
      criteres: [...new Set(criteres.filter((k) => k.actif !== false && k.texte).map((k) => k.texte.trim()))].join('\n'),
      aide: f?.differenciation || '', plus: '', corrige: '', lignes: '12',
    };
    const a = { cle, index: i, phase: p, numero: out.filter((y) => !y.exclue).length + 1, exclue: !!o.exclue, aideFiche: o.aideFiche !== false, auto };
    for (const k of Object.keys(auto)) a[k] = o[k] !== undefined && o[k] !== null ? o[k] : auto[k];
    a.competences = (x.competences || []).map((c) => `${c}  ${ref?.comp?.[c]?.libelle || ''}`.trim());
    out.push(a);
  });
  return out;
}

// fiche activité en PDF A4 : version élève (à distribuer) ou enseignant (avec les éléments de correction)
export function modeleActivite(a, x, { sq, m, promo, profs }, version = 'eleve') {
  const prof = version === 'enseignant';
  const R = (titre, texte, opts = {}) => ({ t: 'rubrique', titre, texte, ...opts });
  const liens = liensLibelles(a.ressources);
  const etapes = lignesDe(a.consignes), crit = lignesDe(a.criteres);
  return {
    fichier: nomFichier(`${m ? m.abreviation || m.nom : ''}_S${sq.numero}.${x.numero}_activite${a.numero}${prof ? '_enseignant' : ''}.pdf`),
    titre: `Fiche activité ${a.numero} · séance ${sq.numero}.${x.numero}`,
    pied: `${m?.nom || ''} · Séance ${sq.numero}.${x.numero} · Activité ${a.numero}${prof ? ' · version enseignant' : ''} · Promotion ${promo}`,
    blocs: [
      { t: 'titre', texte: prof ? 'FICHE ACTIVITÉ — VERSION ENSEIGNANT' : 'FICHE ACTIVITÉ', sous: `Activité ${a.numero} · ${a.titre}`, couleur: m?.couleur || '#146B63' },
      { t: 'infos', paires: prof
        ? [['Matière', m?.nom], ['Enseignant', profs], ['Séance', `${sq.numero}.${x.numero} · ${x.titre || ''}`], ['Promotion', promo], ['Durée', a.duree], ['Organisation', a.organisation], ['Lieu', a.lieu], ['Phase', `${a.index + 1}. ${a.phase.phase || ''}`]]
        : [['Nom et prénom', ' '], ['Date', ' '], ['Matière', m?.nom], ['Séance', `${sq.numero}.${x.numero} · ${x.titre || ''}`], ['Durée', a.duree], ['Organisation', a.organisation], ['Lieu', a.lieu], ['Enseignant', profs]] },
      a.contexte ? R('Mise en situation', a.contexte) : null,
      a.objectif ? R('Objectif de l’activité', a.objectif, { gras: true, gris: true }) : null,
      etapes.length ? { t: 'etapes', titre: 'Travail demandé', items: etapes } : null,
      a.ressources ? R('Documents, matériel et ressources', a.ressources) : null,
      liens.length ? { t: 'qr', liens } : null,
      a.production ? R('Production attendue', a.production, { gras: true }) : null,
      crit.length ? { t: 'cases', titre: prof ? 'Critères de réussite' : 'Critères de réussite — je vérifie mon travail', items: crit } : null,
      a.aide && (prof || a.aideFiche) ? R('Coups de pouce', a.aide, { gris: true }) : null,
      a.plus ? R('Pour aller plus loin', a.plus) : null,
      prof && a.competences.length ? R('Compétences visées', a.competences.join('\n'), { gris: true }) : null,
      prof && a.corrige ? R('Éléments de correction', a.corrige) : null,
      !prof && Number(a.lignes) > 0 ? { t: 'lignes', titre: 'Mon travail', n: Math.min(40, Number(a.lignes)) } : null,
      liens.length && !prof ? { t: 'note', texte: 'Scannez un QR code avec l’appareil photo de votre téléphone pour ouvrir directement la ressource.' } : null,
    ].filter(Boolean),
  };
}


// PDF d'une fiche : téléchargé, ou chargé dans un cadre invisible puis envoyé à l'imprimante (imprimante du réseau ou « Enregistrer en PDF »)
export async function envoyerPDF(doc, mode, outils = null) {
  try {
    let creer = outils?.creerPDF, logo = outils?.logo;
    if (!creer) {
      toast(mode === 'pdf' ? 'Préparation du PDF…' : 'Préparation de l’impression…');
      const P = await import('../pdf.js'); await P.chargerOutils(); creer = P.creerPDF;
      logo = await fetch('img/logo.jpg').then((r) => r.arrayBuffer()).catch(() => null);
    }
    const blob = new Blob([await creer(doc, logo)], { type: 'application/pdf' });
    if (mode === 'pdf') { telecharger(doc.fichier, blob); toast('PDF téléchargé'); return; }
    const url = URL.createObjectURL(blob);
    document.getElementById('cadre-impression')?.remove();
    const ifr = h('iframe', { id: 'cadre-impression', src: url, style: { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0' } });
    ifr.onload = () => {
      try { ifr.contentWindow.focus(); ifr.contentWindow.print(); }
      catch { window.open(url, '_blank'); }               // navigateur qui refuse : le PDF s'ouvre dans un onglet, Ctrl+P pour imprimer
    };
    document.body.append(ifr);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  } catch (e) { erreur(e); }
}
