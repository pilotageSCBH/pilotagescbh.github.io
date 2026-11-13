// Espace élève : ce que voit un élève connecté (sa semaine, sa formation, les documents publiés, ses résultats, son compte).
// Toutes les données viennent de la fonction « eleve_donnees », qui ne renvoie que celles de l'élève et de sa promotion.
import { NOM_APPLI } from '../../config.js';
import { rpcEleve, sessionEleve, deconnexionEleve, fichierEleve, majSessionEleve, SESSION_ELEVE_FINIE } from '../api.js';
import { h, vider, toast, erreur } from '../ui.js';
import { lundi, libSemaine, semaineActuelle, jourDe, NB_SEM, SEM_AN } from '../pilotage.js';
import { GENRES } from '../pages/espace.js';
import { blocInstallation } from '../appli.js';

let D = null, charge = 0;            // données de l'élève (gardées 2 minutes)
const sansAccent = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dateFr = (d) => (d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const heures = (n) => { const v = Number(n) || 0; if (!v) return ''; const hh = Math.floor(v), mm = Math.round((v - hh) * 60); return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`; };
const virgule = (n, d = 1) => (n === null || n === undefined || !isFinite(n) ? '—' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
const NIV = { A: ['Acquis', 'niv-a'], EVA: ['En voie d’acquisition', 'niv-eva'], NA: ['Non acquis', 'niv-na'], NE: ['Non évaluée', 'niv-ne'] };
const niveau = (n) => (n === null || n === undefined ? 'NE' : n < 2 ? 'NA' : n < 4 ? 'EVA' : 'A');

async function donnees(force = false) {
  if (D && !force && Date.now() - charge < 120000) return D;
  const r = await rpcEleve('eleve_donnees');
  const mats = new Map((r.matieres || []).map((m) => [m.id, m]));
  const seqs = new Map((r.sequences || []).map((s) => [s.id, s]));
  const seances = new Map((r.seances || []).map((x) => [x.id, { ...x, seq: seqs.get(x.sequence_id), mat: mats.get(seqs.get(x.sequence_id)?.matiere_id) }]));
  D = { ...r, P: (r.promotions || [])[0], mats, seqs, seances, docs: new Map((r.documents || []).map((d) => [d.id, d])),
    dossiers: new Map((r.dossiers || []).map((t) => [t.id, t])) };
  charge = Date.now();
  return D;
}
const codeMat = (m) => ({ Projet: 'PR', Analyse: 'AD', Orga: 'OR', Labo: 'LA', 'Étude': 'EA', Atelier: 'AT' }[m?.abreviation] || (m?.abreviation || m?.nom || '?').slice(0, 2).toUpperCase());
const etiquette = (x) => `${codeMat(x.mat)} ${x.seq?.numero}.${x.numero}`;

// ------------------------------------------------------------------------------------------- cadre
export function lancerEspaceEleve(app, { retourConnexion }) {
  window.addEventListener(SESSION_ELEVE_FINIE, () => retourConnexion('Votre session est terminée : reconnectez-vous.'), { once: true });
  const s = sessionEleve();
  if (s?.doit_changer) return ecranCode(app, retourConnexion);
  const route = () => { const p = (location.hash || '#/semaine').replace(/^#\//, '').split('/'); return [PAGES[p[0]] ? p[0] : 'semaine', p[1]]; };
  const afficher = async () => {
    if (!sessionEleve()) return;
    const [page, arg] = route();
    const zone = h('main', { class: 'contenu contenu-eleve' }, h('div', { class: 'chargement' }, 'Chargement…'));
    vider(app, h('div', { class: 'cadre cadre-eleve' }, menu(page, retourConnexion), zone));
    try { await PAGES[page](zone, arg); }
    catch (e) { vider(zone, h('div', { class: 'erreur-page' }, h('h2', {}, 'Problème de chargement'), h('p', {}, e.message), h('button', { class: 'btn', onclick: () => { D = null; afficher(); } }, 'Réessayer'))); }
  };
  window.onhashchange = afficher;
  afficher();
}
function menu(page, retourConnexion) {
  const s = sessionEleve() || {};
  const lien = (href, icone, texte, cle) => h('a', { href, class: 'lien-menu' + (page === cle ? ' actif' : '') }, h('span', { class: 'ico' }, icone), h('span', { class: 'txt' }, texte));
  return h('nav', { class: 'menu menu-eleve' },
    h('div', { class: 'tete-menu' }, h('a', { href: '#/semaine', class: 'marque' }, h('img', { src: 'img/logo.jpg', alt: '', class: 'logo-large' }), h('span', {}, NOM_APPLI))),
    h('div', { class: 'bandeau-eleve' }, '🎓 Espace élève'),
    h('div', { class: 'defile-menu' },
      lien('#/semaine', '📅', 'Ma semaine', 'semaine'),
      lien('#/formation', '🧱', 'Ma formation', 'formation'),
      lien('#/documents', '📚', 'Mes documents', 'documents'),
      lien('#/qcm', '📝', 'Mes QCM', 'qcm'),
      lien('#/resultats', '🏆', 'Mes résultats', 'resultats'),
      lien('#/compte', '👤', 'Mon compte', 'compte')),
    h('div', { class: 'pied-menu' }, h('span', { class: 'avatar petit' }, ((s.prenom || '?')[0] + (s.nom || '?')[0]).toUpperCase()),
      h('div', { class: 'qui' }, h('b', {}, `${s.prenom || ''} ${s.nom || ''}`), h('small', {}, s.identifiant || '')),
      h('button', { class: 'deconnexion', type: 'button', title: 'Se déconnecter', onclick: async () => { await deconnexionEleve(); D = null; window.onhashchange = null; retourConnexion(''); } }, '⏻')));
}

// premier code : l'élève choisit son propre code avant d'entrer
function ecranCode(app, retourConnexion) {
  const c1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const c2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const info = h('p', { class: 'msg-connexion erreur' });
  const form = h('form', { class: 'carte-connexion', onsubmit: async (e) => {
    e.preventDefault(); info.textContent = '';
    if (c1.value.length < 8) { info.textContent = 'Le code doit contenir au moins 8 caractères.'; return; }
    if (c1.value !== c2.value) { info.textContent = 'Les deux codes ne sont pas identiques.'; return; }
    try { await rpcEleve('eleve_changer_code', { nouveau: c1.value }); majSessionEleve({ doit_changer: false }); toast('Code enregistré'); location.hash = '#/semaine'; lancerEspaceEleve(app, { retourConnexion }); }
    catch (x) { info.textContent = x.message; }
  } },
  h('img', { src: 'img/logo.jpg', alt: 'BTS Systèmes constructifs bois et habitat', class: 'logo-connexion' }),
  h('h1', {}, NOM_APPLI), h('h2', {}, 'Choisissez votre code'),
  h('p', { class: 'aide' }, 'Vous êtes entré avec le code provisoire de votre fiche. Choisissez maintenant votre propre code (8 caractères au moins) : le code provisoire ne fonctionnera plus. Ne le donnez à personne.'),
  h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer', c2), h('button', { class: 'btn principal large', type: 'submit' }, 'Enregistrer et entrer'), info,
  h('button', { class: 'lien', type: 'button', onclick: async () => { await deconnexionEleve(); retourConnexion(''); } }, 'Se déconnecter'));
  vider(app, h('div', { class: 'ecran-connexion' }, form));
  c1.focus();
}

// ------------------------------------------------------------------------------------------- pages
const PAGES = { semaine: pageSemaine, formation: pageFormation, documents: pageDocuments, qcm: pageQcmEleve, resultats: pageResultats, compte: pageCompte };
const entete = (titre, sous, ...actions) => h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, titre), sous ? h('p', { class: 'sous-titre' }, sous) : null),
  actions.length ? h('div', { class: 'actions-page' }, actions) : null);

// documents mobilisés dans une séance (publiés)
const puceDocs = (x) => (x.cours_lies || []).filter((c) => D.docs.has(c.id)).map((c) => { const d = D.docs.get(c.id); return h('a', { class: 'cours-lie', href: '#/documents/' + d.id }, (GENRES[d.genre] || GENRES.cours)[0] + ' ' + d.titre); });

// ---- ma semaine : séances prévues et prochaines évaluations
async function pageSemaine(zone, arg) {
  await donnees();
  const P = D.P, Y = P.annee_debut;
  const wAuj = semaineActuelle(Y);
  const w = /^\d+$/.test(arg || '') && Number(arg) < NB_SEM ? Number(arg) : wAuj;
  const sem = (D.progression_semaines || []).find((s) => s.semaine === w) || {};
  const jours = new Map((D.progression_jours || []).map((j) => [j.jour, j.evenement]));
  const cases = (D.progression_cases || []).filter((c) => c.semaine === w);
  const ids = cases.flatMap((c) => [c.seance_id, c.seance2_id]).filter(Boolean);
  const seances = ids.map((id) => D.seances.get(id)).filter(Boolean);
  const parMat = [...new Set(seances.map((x) => x.mat?.id))].map((id) => D.mats.get(id)).filter(Boolean).sort((a, b) => a.ordre - b.ordre);
  const evts = Array.from({ length: 7 }, (_, k) => [k, jours.get(w * 7 + k)]).filter(([, e]) => e);
  const apprenti = D.eleve.statut === 'Apprenti';
  vider(zone,
    entete('📅  Ma semaine', `Promotion ${P.libelle} · ${libSemaine(Y, w)} · ${w < SEM_AN ? '1re' : '2e'} année`,
      h('a', { class: 'btn' + (w <= 0 ? ' desactive' : ''), href: '#/semaine/' + Math.max(0, w - 1), title: 'Semaine précédente' }, '◀'),
      w !== wAuj ? h('a', { class: 'btn', href: '#/semaine/' + wAuj }, 'Cette semaine') : null,
      h('a', { class: 'btn' + (w >= NB_SEM - 1 ? ' desactive' : ''), href: '#/semaine/' + Math.min(NB_SEM - 1, w + 1), title: 'Semaine suivante' }, '▶')),
    h('div', { class: 'puces-semaine' },
      sem.vacances ? h('div', { class: 'puce-info vac' }, '🏖  ' + sem.vacances) : null,
      apprenti && sem.apprentis ? h('div', { class: 'puce-info ' + (sem.apprentis === 'PFMP' ? 'pfmp' : 'presents') }, sem.apprentis === 'PFMP' ? '🏭  Semaine en entreprise' : '🏫  Semaine au lycée') : null,
      evts.map(([k, e]) => h('div', { class: 'puce-info evt' }, `📌 ${jourDe(Y, w, k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${e}`))),
    h('section', {}, h('h2', { class: 'titre-section' }, 'Séances prévues'),
      parMat.length ? h('div', { class: 'grille-semaine-eleve' }, parMat.map((m) => h('div', { class: 'carte-mat-eleve', style: { '--couleur': m.couleur } },
        h('h3', {}, h('span', { class: 'pastille', style: { background: m.couleur } }), m.nom),
        seances.filter((x) => x.mat?.id === m.id).map((x) => h('div', { class: 'seance-eleve' },
          h('div', { class: 'tete' }, h('b', {}, etiquette(x)), ' ', x.titre || 'Séance', x.duree ? h('small', { class: 'gris' }, ' · ' + heures(x.duree)) : null),
          x.objectif_inter ? h('p', { class: 'objectif' }, x.objectif_inter) : null,
          puceDocs(x).length ? h('div', { class: 'docs-seance' }, puceDocs(x)) : null)))))
        : h('p', { class: 'vide' }, sem.vacances ? 'Vacances : pas de séance.' : 'Aucune séance placée cette semaine dans la progression.')),
    h('section', {}, h('h2', { class: 'titre-section' }, 'Prochaines évaluations'), listeEvaluations()));
}
function evaluations() {
  const l = [];
  for (const c of D.contrats || []) {
    if (!c.date_eval) continue;
    const x = c.seance_id ? D.seances.get(c.seance_id) : null, s = c.sequence_id ? D.seqs.get(c.sequence_id) : x?.seq;
    const m = D.mats.get(s?.matiere_id ?? c.matiere_id);
    if (!m) continue;
    l.push({ date: c.date_eval, mat: m, type: c.type === 'sommatif' ? 'Évaluation sommative' : 'Évaluation formative',
      titre: c.titre || (c.type === 'sommatif' && s ? `Séquence ${s.numero}${s.intitule ? ' · ' + s.intitule : ''}` : x ? `${etiquette(x)} ${x.titre || ''}` : ''), forme: c.forme });
  }
  for (const v of D.evaluations || []) if (v.date_eval && D.mats.get(v.matiere_id)) l.push({ date: v.date_eval, mat: D.mats.get(v.matiere_id), type: 'Évaluation', titre: v.libelle || '' });
  return l.sort((a, b) => a.date.localeCompare(b.date));
}
function listeEvaluations() {
  const auj = new Date().toISOString().slice(0, 10);
  const l = evaluations().filter((e) => e.date >= auj).slice(0, 8);
  if (!l.length) return h('p', { class: 'vide' }, 'Aucune évaluation datée à venir.');
  return h('ul', { class: 'liste-evals-eleve' }, l.map((e) => h('li', { style: { '--couleur': e.mat.couleur } },
    h('span', { class: 'date' }, dateFr(e.date)), h('span', { class: 'mat' }, e.mat.nom), h('b', {}, e.type), e.titre ? h('span', {}, ' · ' + e.titre) : null,
    e.forme ? h('small', { class: 'gris' }, ' · ' + e.forme) : null)));
}

// ---- ma formation : séquençage simplifié par matière
async function pageFormation(zone, arg) {
  await donnees();
  const mats = [...D.mats.values()].filter((m) => (D.sequences || []).some((s) => s.matiere_id === m.id)).sort((a, b) => a.ordre - b.ordre);
  const m = mats.find((x) => String(x.id) === String(arg)) || mats[0];
  const Y = D.P.annee_debut;
  const semainesDe = new Map();
  for (const c of D.progression_cases || []) for (const id of [c.seance_id, c.seance2_id]) if (id) semainesDe.set(id, (semainesDe.get(id) || []).concat(c.semaine));
  vider(zone, entete('🧱  Ma formation', `Promotion ${D.P.libelle} · séquences et séances de chaque matière`),
    mats.length ? h('nav', { class: 'onglets' }, mats.map((x) => h('a', { href: '#/formation/' + x.id, class: x === m ? 'actif' : '', style: { '--couleur': x.couleur } }, x.nom))) : null,
    !m ? h('p', { class: 'vide' }, 'Le séquençage n’est pas encore saisi.')
      : (D.sequences || []).filter((s) => s.matiere_id === m.id).sort((a, b) => a.numero - b.numero).map((s) => {
        const ls = [...D.seances.values()].filter((x) => x.sequence_id === s.id && (x.titre || x.objectif_inter)).sort((a, b) => a.numero - b.numero);
        return h('section', { class: 'sequence-eleve', style: { '--couleur': m.couleur } },
          h('div', { class: 'tete-sequence' }, h('div', { class: 'num-sequence' }, 'SÉQUENCE ' + s.numero), h('h2', {}, s.intitule || 'Séquence')),
          s.objectif ? h('p', { class: 'objectif-seq' }, h('b', {}, 'Objectif : '), s.objectif) : null,
          ls.length ? h('ol', { class: 'seances-eleve' }, ls.map((x) => h('li', {},
            h('div', { class: 'tete' }, h('b', {}, `${s.numero}.${x.numero}`), ' ', x.titre || 'Séance', x.duree ? h('small', { class: 'gris' }, ' · ' + heures(x.duree)) : null,
              (semainesDe.get(x.id) || []).length ? h('small', { class: 'quand' }, ' · ' + (semainesDe.get(x.id) || []).sort((a, b) => a - b).map((w) => 'semaine du ' + lundi(Y, w).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })).join(', ')) : null),
            x.objectif_inter ? h('p', { class: 'objectif' }, x.objectif_inter) : null,
            puceDocs(x).length ? h('div', { class: 'docs-seance' }, puceDocs(x)) : null))) : h('p', { class: 'vide' }, 'Séances à venir.'));
      }));
}

// ---- mes documents : documents publiés par les enseignants
async function pageDocuments(zone, arg) {
  await donnees();
  const doc = /^\d+$/.test(arg || '') ? D.docs.get(Number(arg)) : null;
  if (doc) return ficheDocument(zone, doc);
  const chemin = (id) => { const l = []; let t = D.dossiers.get(id), n = 0; while (t && n++ < 30) { l.unshift(t.nom); t = D.dossiers.get(t.parent_id); } return l; };
  const champ = h('input', { class: 'recherche-biblio recherche-eleve', type: 'search', placeholder: 'Rechercher un document (titre, sommaire)…', 'aria-label': 'Rechercher un document' });
  const liste = h('div', {});
  const dessiner = () => {
    const t = sansAccent(champ.value).split(/\s+/).filter(Boolean);
    const docs = [...D.docs.values()].filter((d) => !t.length || t.every((m) => sansAccent([d.titre, (GENRES[d.genre] || GENRES.cours)[1], chemin(d.theme_id).join(' '), (d.sommaire || []).map((e) => e.t).join(' ')].join(' ')).includes(m)));
    const groupes = new Map();
    for (const d of docs) { const g = chemin(d.theme_id).join(' › ') || 'Documents'; if (!groupes.has(g)) groupes.set(g, []); groupes.get(g).push(d); }
    vider(liste, docs.length ? [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true })).map(([g, l]) => h('section', {},
      h('h2', { class: 'titre-section' }, '📁 ', g),
      h('div', { class: 'livres-biblio' }, l.map((d) => carteDocument(d)))))
      : h('p', { class: 'vide' }, D.docs.size ? 'Aucun document ne correspond.' : 'Aucun document publié pour l’instant : vos enseignants les ajouteront au fil de la formation.'));
  };
  champ.addEventListener('input', dessiner);
  vider(zone, entete('📚  Mes documents', `${D.docs.size} document(s) publié(s) par vos enseignants`), h('div', { class: 'zone-recherche-eleve' }, champ), liste);
  dessiner();
}
const tranche = (d, classe = 'couv-mini') => (d.vignette ? h('img', { class: classe, src: d.vignette, alt: '', loading: 'lazy' })
  : h('div', { class: 'tranche tranche-doc ' + classe, style: { '--couleur': ({ cours: '#1E8F86', exercice: '#C79A12', tdtp: '#C8790B', evaluation: '#B03A2E', corrige: '#4E9A2F', ressource: '#3D84C6', autre: '#6F6A8A' })[d.genre] || '#1E8F86' } }, (GENRES[d.genre] || GENRES.cours)[0]));
function carteDocument(d) {
  return h('article', { class: 'livre-biblio' }, h('div', { class: 'livre-tete' },
    h('a', { class: 'lien-couv', href: '#/documents/' + d.id, tabindex: -1 }, tranche(d)),
    h('div', { class: 'livre-infos' }, h('div', { class: 'livre-titre' }, h('a', { href: '#/documents/' + d.id }, d.titre || 'Document')),
      h('div', { class: 'livre-details' }, (GENRES[d.genre] || GENRES.cours).join(' '), d.auteur ? ' · ' + d.auteur : '')),
    h('div', { class: 'actions-livre' }, d.fichier ? boutonsFichier(d, 'btn petit') : null)));
}
const AFFICHABLES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', txt: 'text/plain;charset=utf-8' };
function boutonsFichier(d, classe) {
  const type = AFFICHABLES[d.extension || ''];
  const ouvrir = async (ev, telecharger, page = null) => {
    const b = ev.currentTarget; b.disabled = true; const avant = b.textContent; b.textContent = '…';
    const w = !telecharger && type ? window.open('', '_blank') : null;
    try {
      const blob = await fichierEleve(d.id);
      const url = URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
      setTimeout(() => URL.revokeObjectURL(url), 30 * 60 * 1000);
      if (telecharger || !type) { const a = h('a', { href: url, download: (d.titre || 'document').replace(/[\\/:*?"<>|]+/g, ' ') + (d.extension ? '.' + d.extension : '') }); document.body.append(a); a.click(); a.remove(); }
      else if (w) w.location.href = url + (page && type === 'application/pdf' ? '#page=' + page : ''); else location.href = url;
    } catch (e) { w?.close(); erreur(e); }
    b.disabled = false; b.textContent = avant;
  };
  return [type ? h('button', { class: classe + ' principal', type: 'button', onclick: (e) => ouvrir(e, false) }, 'Ouvrir') : null,
    h('button', { class: classe, type: 'button', onclick: (e) => ouvrir(e, true), title: 'Enregistrer le fichier sur cet appareil' }, '⬇ Télécharger')];
}
function ficheDocument(zone, d) {
  const lignes = d.sommaire || [];
  const seances = [...D.seances.values()].filter((x) => (x.cours_lies || []).some((c) => c.id === d.id));
  vider(zone, h('nav', { class: 'ariane-biblio' }, h('a', { href: '#/documents' }, 'Mes documents'), ' › ', h('b', {}, d.titre)),
    h('div', { class: 'grille-fiche-livre' },
      h('div', { class: 'col-couv' }, tranche(d, 'couv-grande'), h('div', { class: 'boutons-fiche' }, d.fichier ? boutonsFichier(d, 'btn') : h('p', { class: 'aide' }, 'Pas de fichier associé.'))),
      h('div', { class: 'col-infos' }, h('h2', { class: 'titre-livre' }, d.titre),
        h('p', { class: 'gris' }, (GENRES[d.genre] || GENRES.cours).join(' '), d.auteur ? ' · publié par ' + d.auteur : ''),
        seances.length ? h('p', {}, h('b', {}, 'Utilisé dans : '), seances.map((x) => etiquette(x) + (x.titre ? ' ' + x.titre : '')).join(' · ')) : null,
        (d.savoirs || []).length ? h('p', {}, h('b', {}, 'Savoirs : '), d.savoirs.map((c) => { const s = (D.savoirs || []).find((y) => y.code === c); return c + (s ? ' ' + (s.libelle_court || s.libelle) : ''); }).join(' · ')) : null,
        h('h3', {}, 'Sommaire'),
        lignes.length ? h('ol', { class: 'sommaire-biblio complet' }, lignes.map((e) => h('li', { class: 'niv-som' + (e.n || 0) }, h('span', { class: 'sans-lien' }, h('span', {}, e.t), e.p ? h('span', { class: 'pg' }, 'p. ' + e.p) : null))))
          : h('p', { class: 'vide-sommaire' }, 'Sommaire non renseigné.'))));
}

// ---- mes résultats : évaluations, contrats sommatifs, compétences
async function pageResultats(zone) {
  await donnees();
  const notes = new Map((D.notes || []).map((n) => [n.critere_id, n.valeur]));
  const res = new Map((D.resultats || []).map((r) => [r.evaluation_id, r.valeur]));
  const comps = new Map((D.competences || []).map((c) => [c.code, c]));
  // moyenne (0 à 5) d'un groupe de critères
  const moy = (crit) => { let s = 0, c = 0; for (const k of crit) { const v = notes.get(k.id); if (v === undefined || v === 'NE' || v === '') continue; const co = Number(k.coefficient) || 0; s += Number(v) * co; c += co; } return c > 0 ? s / c : null; };
  const sommatifs = (D.contrats || []).filter((c) => c.type === 'sommatif').map((c) => {
    const crit = (D.criteres || []).filter((k) => k.contrat_id === c.id);
    const groupes = [...new Set(crit.map((k) => k.groupe))].map((g) => ({ g, m: moy(crit.filter((k) => k.groupe === g)) }));
    const ms = groupes.filter((x) => x.m !== null);
    const s = c.sequence_id ? D.seqs.get(c.sequence_id) : null, m = D.mats.get(s?.matiere_id ?? c.matiere_id);
    return { c, s, m, groupes, note: ms.length ? (ms.reduce((a, x) => a + x.m, 0) / ms.length) * 4 : null };
  }).filter((x) => x.m && x.groupes.some((g) => g.m !== null));
  const evals = (D.evaluations || []).filter((v) => res.has(v.id) && res.get(v.id) !== '' && D.mats.get(v.matiere_id));
  // livret : meilleur niveau obtenu pour chaque compétence (contrats sommatifs)
  const ordre = ['NE', 'NA', 'EVA', 'A'], livret = new Map();
  for (const x of sommatifs) for (const g of x.groupes) { const n = niveau(g.m); if (!livret.has(g.g) || ordre.indexOf(n) > ordre.indexOf(livret.get(g.g))) livret.set(g.g, n); }
  const apprec = (D.appreciations || []).filter((a) => (a.texte || '').trim() && D.mats.get(a.matiere_id));
  vider(zone, entete('🏆  Mes résultats', `${D.eleve.prenom} ${D.eleve.nom} · promotion ${D.P.libelle}`),
    h('section', {}, h('h2', { class: 'titre-section' }, 'Compétences (meilleur niveau obtenu)'),
      livret.size ? h('div', { class: 'livret-eleve' }, [...livret.entries()].sort((a, b) => (comps.get(a[0])?.ordre ?? 99) - (comps.get(b[0])?.ordre ?? 99)).map(([g, n]) => h('div', { class: 'ligne-livret' },
        h('b', {}, g), h('span', { class: 'lib' }, comps.get(g)?.libelle_court || comps.get(g)?.libelle || ''), h('span', { class: 'niveau ' + NIV[n][1] }, NIV[n][0]))))
        : h('p', { class: 'vide' }, 'Pas encore de compétence évaluée.')),
    h('section', {}, h('h2', { class: 'titre-section' }, 'Évaluations sommatives'),
      sommatifs.length ? h('div', { class: 'tableau-defile' }, h('table', { class: 'liste resultats-eleve' },
        h('thead', {}, h('tr', {}, ['Date', 'Matière', 'Évaluation', 'Note /20', 'Compétences'].map((t) => h('th', {}, t)))),
        h('tbody', {}, sommatifs.sort((a, b) => String(a.c.date_eval || '').localeCompare(String(b.c.date_eval || ''))).map((x) => h('tr', {},
          h('td', {}, dateFr(x.c.date_eval)), h('td', {}, h('span', { class: 'pastille', style: { background: x.m.couleur } }), ' ', x.m.nom),
          h('td', {}, x.c.titre || (x.s ? `Séquence ${x.s.numero}${x.s.intitule ? ' · ' + x.s.intitule : ''}` : 'Contrat')),
          h('td', { class: 'num' }, h('b', {}, virgule(x.note))),
          h('td', {}, x.groupes.map((g) => h('span', { class: 'niveau mini ' + NIV[niveau(g.m)][1], title: NIV[niveau(g.m)][0] }, g.g)))))))) : h('p', { class: 'vide' }, 'Pas encore de note.')),
    h('section', {}, h('h2', { class: 'titre-section' }, 'Résultats intermédiaires'),
      evals.length ? h('div', { class: 'tableau-defile' }, h('table', { class: 'liste resultats-eleve' },
        h('thead', {}, h('tr', {}, ['Date', 'Matière', 'Évaluation', 'Note', 'Coef.'].map((t) => h('th', {}, t)))),
        h('tbody', {}, evals.sort((a, b) => String(a.date_eval || '').localeCompare(String(b.date_eval || ''))).map((v) => h('tr', {},
          h('td', {}, dateFr(v.date_eval)), h('td', {}, h('span', { class: 'pastille', style: { background: D.mats.get(v.matiere_id).couleur } }), ' ', D.mats.get(v.matiere_id).nom),
          h('td', {}, v.libelle || ''), h('td', { class: 'num' }, h('b', {}, /^[0-9.]+$/.test(String(res.get(v.id))) ? virgule(Number(res.get(v.id)), 2) : res.get(v.id)), v.bareme ? ' / ' + virgule(Number(v.bareme), 0) : ''), h('td', { class: 'num' }, virgule(Number(v.coefficient) || 1)))))))
        : h('p', { class: 'vide' }, 'Pas encore de résultat.')),
    apprec.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Appréciations'),
      apprec.map((a) => h('div', { class: 'appreciation-eleve' }, h('b', {}, D.mats.get(a.matiere_id).nom), h('p', {}, a.texte)))) : null);
}

// ---- mon compte
async function pageCompte(zone) {
  await donnees();
  const c1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 }), c2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const fin = D.compte?.fin_acces ? new Date(D.compte.fin_acces + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  vider(zone, entete('👤  Mon compte', `${D.eleve.prenom} ${D.eleve.nom}`),
    h('div', { class: 'grille-compte' },
      h('section', { class: 'bloc carte-compte-bloc' }, h('div', { class: 'tete-carte' }, h('span', { class: 'kpi-icone' }, '🎓'), h('h2', {}, 'Mon accès')),
        h('p', {}, 'Identifiant : ', h('b', {}, D.compte?.identifiant || '')), h('p', {}, 'Promotion : ', h('b', {}, D.P.libelle)),
        fin ? h('p', {}, 'Accès valable jusqu’au ', h('b', {}, fin), '.') : null,
        h('p', { class: 'aide' }, 'Code oublié : demandez une nouvelle fiche de connexion à l’administrateur du site.')),
      h('section', { class: 'bloc carte-compte-bloc' }, h('div', { class: 'tete-carte' }, h('span', { class: 'kpi-icone' }, '🔒'), h('h2', {}, 'Changer mon code')),
        h('form', { class: 'formulaire-code', onsubmit: async (e) => {
          e.preventDefault();
          if (c1.value.length < 8) return erreur(new Error('Le code doit contenir au moins 8 caractères.'));
          if (c1.value !== c2.value) return erreur(new Error('Les deux codes ne sont pas identiques.'));
          try { await rpcEleve('eleve_changer_code', { nouveau: c1.value }); c1.value = c2.value = ''; toast('Code modifié'); } catch (x) { erreur(x); }
        } }, h('label', {}, 'Nouveau code', c1), h('label', {}, 'Confirmer', c2), h('button', { class: 'btn principal', type: 'submit' }, 'Enregistrer le nouveau code')))),
    blocInstallation());
}

// ---- mes QCM : liste, passation, correction
async function pageQcmEleve(zone, arg) {
  await donnees();
  const a = String(arg || '');
  if (/^c-\d+$/.test(a)) return correction(zone, await rpcEleve('eleve_qcm_correction', { session: Number(a.slice(2)) }));
  if (/^\d+$/.test(a)) return passation(zone, Number(a));
  const l = await rpcEleve('eleve_qcm_liste');
  const now = Date.now();
  const etat = (x) => (now < new Date(x.ouverture) ? 'avenir' : now > new Date(x.fermeture) ? 'ferme' : 'ouvert');
  const carte = (x) => {
    const e = etat(x), reste = x.tentatives - x.faites, m = D.mats.get(x.matiere_id);
    return h('div', { class: 'carte-qcm-eleve', style: { '--couleur': m?.couleur || 'var(--teal)' } },
      h('div', {}, h('b', {}, x.titre), h('div', { class: 'gris petit' }, [m?.nom, `${x.nb_questions} questions`,
        e === 'avenir' ? 'ouvre le ' + dateHeureE(x.ouverture) : e === 'ouvert' ? 'jusqu’au ' + dateHeureE(x.fermeture) : 'fermé le ' + dateHeureE(x.fermeture)].filter(Boolean).join(' · '))),
      h('div', { class: 'actions-qcm-eleve' },
        x.faites ? h('span', { class: 'note-qcm' }, virgule(Number(x.meilleur)), ' / 20') : null,
        e === 'ouvert' && reste > 0 ? h('a', { class: 'btn principal', href: '#/qcm/' + x.session }, x.faites ? 'Recommencer' : 'Commencer') : null,
        x.faites ? h('a', { class: 'btn', href: '#/qcm/c-' + x.session }, 'Voir la correction') : null,
        e === 'ouvert' && !x.faites && reste <= 0 ? h('span', { class: 'gris' }, 'déjà fait') : null));
  };
  const ouverts = l.filter((x) => etat(x) === 'ouvert'), avenir = l.filter((x) => etat(x) === 'avenir'), fermes = l.filter((x) => etat(x) === 'ferme');
  vider(zone, entete('📝  Mes QCM', 'QCM proposés par vos enseignants'),
    h('section', {}, h('h2', { class: 'titre-section' }, 'À faire maintenant'), ouverts.length ? ouverts.map(carte) : h('p', { class: 'vide' }, 'Aucun QCM ouvert pour l’instant.')),
    avenir.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Bientôt'), avenir.map(carte)) : null,
    fermes.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Terminés'), fermes.map(carte)) : null);
}
const dateHeureE = (d) => new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function melange(l, graine) { let s = 2166136261; for (const c of String(graine)) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619); } const a = [...l]; for (let i = a.length - 1; i > 0; i--) { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
async function passation(zone, session) {
  let Q;
  try { Q = await rpcEleve('eleve_qcm_ouvrir', { session }); }
  catch (e) { vider(zone, entete('📝  QCM'), h('p', { class: 'vide' }, e.message), h('a', { class: 'btn', href: '#/qcm' }, '← Mes QCM')); return; }
  const graine = `${D.eleve.id}-${session}`;
  const questions = Q.melanger ? melange(Q.questions, graine).map((x) => ({ ...x, choix: x.type === 'vraifaux' ? x.choix : melange(x.choix, graine + x.id) })) : Q.questions;
  const rep = {};
  const compte = h('span', { class: 'gris' });
  const maj = () => { compte.textContent = `${Object.values(rep).filter((v) => v.length).length} / ${questions.length} répondues`; };
  vider(zone, entete('📝  ' + Q.titre, `${questions.length} questions · à rendre avant le ${dateHeureE(Q.fermeture)}`),
    Q.consigne ? h('p', { class: 'consigne-qcm' }, Q.consigne) : h('p', { class: 'consigne-qcm' }, 'Cochez la ou les bonnes réponses. Une question rapporte 1 point si toutes les bonnes réponses, et elles seules, sont cochées.'),
    h('form', { class: 'passation-qcm', onsubmit: async (e) => {
      e.preventDefault();
      const vides = questions.filter((x) => !(rep[x.id] || []).length).length;
      if (vides && !window.confirm(`${vides} question(s) sans réponse. Rendre quand même ?`)) return;
      const b = e.target.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Envoi…';
      try { const c = await rpcEleve('eleve_qcm_rendre', { session, reponses: rep }); charge = 0; history.replaceState(null, '', '#/qcm/c-' + session); correction(zone, c); window.scrollTo(0, 0); }
      catch (x) { erreur(x); b.disabled = false; b.textContent = 'Rendre mes réponses'; }
    } },
    questions.map((x, i) => h('fieldset', { class: 'question-eleve' },
      h('legend', {}, h('span', { class: 'num-question' }, i + 1), x.texte),
      x.type === 'multiple' ? h('p', { class: 'aide' }, 'Plusieurs réponses possibles') : null,
      x.choix.map((c) => h('label', { class: 'choix-eleve' }, h('input', { type: x.type === 'multiple' ? 'checkbox' : 'radio', name: 'q-' + x.id, value: c.id, onchange: (e) => {
        if (x.type === 'multiple') { const s2 = new Set(rep[x.id] || []); e.target.checked ? s2.add(c.id) : s2.delete(c.id); rep[x.id] = [...s2]; } else rep[x.id] = [c.id];
        maj(); } }), h('span', {}, c.texte))))),
    h('div', { class: 'pied-passation' }, compte, h('button', { class: 'btn principal', type: 'submit' }, 'Rendre mes réponses'))));
  maj();
}
function correction(zone, C) {
  const note = C.total ? (Number(C.points) / C.total) * 20 : null;
  vider(zone, entete('📝  ' + C.titre, `Correction · ${virgule(Number(C.points), 0)} bonne(s) réponse(s) sur ${C.total}`, h('a', { class: 'btn', href: '#/qcm' }, '← Mes QCM')),
    h('div', { class: 'score-qcm' }, h('strong', {}, virgule(note)), h('span', {}, '/ 20')),
    C.questions.map((x, i) => {
      const mes = new Set((C.reponses || {})[x.id] || []);
      const ok = x.choix.filter((c) => c.bon).every((c) => mes.has(c.id)) && [...mes].every((id) => x.choix.find((c) => c.id === id)?.bon);
      return h('section', { class: 'question-eleve corrigee ' + (ok ? 'juste' : 'fausse') },
        h('div', { class: 'legende' }, h('span', { class: 'num-question' }, i + 1), x.texte, h('span', { class: 'verdict' }, ok ? '✔ juste' : '✖ à revoir')),
        x.choix.map((c) => h('div', { class: 'choix-corrige' + (c.bon ? ' bon' : '') + (mes.has(c.id) ? ' coche' : '') },
          h('span', { class: 'marque' }, c.bon ? '✔' : mes.has(c.id) ? '✖' : ''), h('span', {}, c.texte), mes.has(c.id) ? h('small', { class: 'gris' }, ' (votre réponse)') : null)),
        x.explication ? h('p', { class: 'explication' }, '💡 ', x.explication) : null);
    }));
}
