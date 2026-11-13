// Mes QCM : QCM formatifs de l'enseignant (préparés avec une IA à partir d'un cours ou d'une séance, ou à la main),
// version papier (sujets mélangés et corrigés), passation en ligne dans l'espace élèves, résultats et report.
// Rangement en dossiers (partage d'un dossier entier) ; import de fichiers H5P (QCM, vrai/faux, séries de questions) ;
// couplage à une fiche contrat : une série de questions par critère, notes de la fiche remplies par les résultats.
// #/qcm : liste · #/qcm/ID : un QCM · #/qcm/l-ID : nouveau QCM à partir d'un document de Mes cours
// #/qcm/c-ID : nouveau QCM couplé à une fiche contrat · #/qcm/s-ID : résultats d'une passation
import { db } from '../api.js';
import { h, vider, toast, erreur, fenetre, confirmer } from '../ui.js';
import { envoyerPDF } from './fiches.js';
import { nomFichier } from '../echange.js';
import { boutonIA, listeSavoirs, resume } from '../ia.js';
import { chargerCollegues, nomCollegue, dialoguePartage, pluriel } from '../ressources.js';
import { apercuEleve } from '../app.js';

const TYPES = { unique: 'Une seule bonne réponse', multiple: 'Plusieurs bonnes réponses', vraifaux: 'Vrai ou faux' };
const id6 = () => Math.random().toString(36).slice(2, 8);
const nouvelleQuestion = (type = 'unique') => ({ id: 'q' + id6(), type, texte: '', explication: '', savoir: '',
  choix: type === 'vraifaux' ? [{ id: 'v', texte: 'Vrai', bon: true }, { id: 'f', texte: 'Faux', bon: false }] : [{ id: id6(), texte: '', bon: true }, { id: id6(), texte: '', bon: false }, { id: id6(), texte: '', bon: false }, { id: id6(), texte: '', bon: false }] });
const dateHeure = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const virgule = (n, d = 1) => (n === null || n === undefined || !isFinite(n) ? '—' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
const pourLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
// tirage reproductible (versions mélangées identiques à chaque téléchargement)
function melangeur(graine) { let s = 2166136261; for (const c of String(graine)) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619); } return (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }; }

export async function pageQcm(zone, arg, ctx) {
  if (!ctx.peutEcrire()) { vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📝  Mes QCM')), h('p', { class: 'vide' }, 'Cet espace est réservé aux enseignants.')); return; }
  const moi = ctx.profil.id, ref = await ctx.referentiel();
  let liste, partages, sessions, dossiersP;
  try { [liste, partages, sessions, dossiersP] = await Promise.all([db.lire('qcm', 'order=maj_le.desc'), db.lire('qcm_partages'), db.lire('qcm_sessions', 'order=fermeture.desc'),
    db.lire('qcm_dossiers_partages').catch(() => null), chargerCollegues()]); }
  catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📝  Mes QCM')), h('div', { class: 'erreur-page' }, h('h2', {}, 'QCM pas encore installés'),
      h('p', {}, ctx.estAdmin() ? 'Exécutez le script « 28_qcm.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord installer les QCM.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const a = String(arg || '');
  if (/^s-\d+$/.test(a)) return pageSession(zone, ctx, Number(a.slice(2)), liste, sessions, ref);
  if (/^\d+$/.test(a)) { const q = liste.find((x) => x.id === Number(a)); if (q) return editeur(zone, ctx, q, sessions.filter((s) => s.qcm_id === q.id), partages, ref, liste); }
  if (/^l-\d+$/.test(a)) return creer(ctx, { livre_id: Number(a.slice(2)) }, liste);
  if (/^c-\d+$/.test(a)) return creer(ctx, { contrat_id: Number(a.slice(2)) }, liste);
  const avecDossiers = Array.isArray(dossiersP);

  const mats = new Map(ctx.matieres.map((m) => [m.id, m]));
  const miens = liste.filter((q) => q.proprietaire === moi), autres = liste.filter((q) => q.proprietaire !== moi);
  const carte = (q) => {
    const ss = sessions.filter((s) => s.qcm_id === q.id), ouverte = ss.find((s) => new Date(s.ouverture) <= new Date() && new Date(s.fermeture) > new Date());
    const partage = q.partage_tous || partages.some((p) => p.qcm_id === q.id) || ss.some(enLibreAcces) || (avecDossiers && q.dossier && dossiersP.some((d) => d.proprietaire === q.proprietaire && d.dossier === q.dossier));
    return h('a', { class: 'carte-qcm', href: '#/qcm/' + q.id, style: { '--couleur': mats.get(q.matiere_id)?.couleur || 'var(--teal)' } },
      h('b', {}, q.titre || 'QCM sans titre'),
      h('span', { class: 'gris' }, [pluriel((q.questions || []).length, 'question', 'questions'), mats.get(q.matiere_id)?.nom, q.proprietaire !== moi ? 'par ' + nomCollegue(q.proprietaire) : null].filter(Boolean).join(' · ')),
      h('span', { class: 'badges-qcm' }, ouverte ? h('span', { class: 'etat-compte vert' }, 'en ligne jusqu’au ' + dateHeure(ouverte.fermeture)) : null,
        ss.length && !ouverte ? h('span', { class: 'etat-compte' }, pluriel(ss.length, 'passation', 'passations')) : null, partage && q.proprietaire === moi ? h('span', { class: 'etat-compte' }, '👥 partagé') : null,
        q.contrat_id ? h('span', { class: 'etat-compte' }, '✅ fiche contrat') : null));
  };
  // dossiers de mes QCM
  const nomsDossiers = [...new Set(miens.map((q) => q.dossier || ''))].sort((x, y) => (x === '') - (y === '') || x.localeCompare(y, 'fr'));
  const blocDossier = (d) => {
    const qs = miens.filter((q) => (q.dossier || '') === d);
    const dp = avecDossiers && d ? dossiersP.filter((x) => x.proprietaire === moi && x.dossier === d) : [];
    const classeD = qs.length && ctx.promotions.some((p) => qs.every((q) => sessions.some((s) => s.qcm_id === q.id && s.promotion_id === p.id && enLibreAcces(s))));
    return h('section', { class: 'dossier-qcm' },
      nomsDossiers.length > 1 || d ? h('div', { class: 'tete-dossier-qcm' }, h('h2', { class: 'titre-section' }, d ? '📁 ' + d : '📄 Sans dossier', h('small', { class: 'gris' }, ' · ' + pluriel(qs.length, 'QCM', 'QCM'))),
        d ? h('button', { class: 'btn petit' + (dp.length || classeD ? ' partage-actif' : ''), onclick: () => partagerDossier(d, dossiersP, moi, zone, ctx, qs, sessions) }, dp.length || classeD ? '👥 Dossier partagé' : '👥 Partager le dossier') : null,
        h('button', { class: 'btn petit', onclick: () => ouvrirEnLigne(ctx, qs.map((q) => ({ q, questions: q.questions || [] }))) }, '🌐 Ouvrir aux élèves (tout le dossier)')) : null,
      h('div', { class: 'grille-qcm' }, qs.map(carte)));
  };
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📝  Mes QCM'), h('p', { class: 'sous-titre' }, 'QCM formatifs : préparés avec une IA à partir d’un cours ou d’une séance, sur papier ou en ligne dans l’espace élèves')),
      h('div', { class: 'actions-page' }, h('button', { class: 'btn principal', onclick: () => creer(ctx, {}, liste) }, '＋  Nouveau QCM'),
        h('button', { class: 'btn', onclick: () => creer(ctx, { h5p: true }, liste) }, '📥  Importer un fichier H5P'))),
    miens.length ? nomsDossiers.map(blocDossier) : h('div', { class: 'carte-detail accueil-cours' }, h('h2', {}, '📝 Aucun QCM pour l’instant'),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, '« ＋ Nouveau QCM » : partez d’un document de Mes cours ou d’une séance, puis « 🤖 Remplir avec une IA » propose les questions (seul le contenu du cours est envoyé à l’IA).'),
        h('li', {}, 'Ou, depuis la fiche d’un document de Mes cours : « 📝 Créer un QCM » ; depuis une fiche contrat : « 📝 QCM couplé ».'),
        h('li', {}, '« 📥 Importer un fichier H5P » : QCM ou vrai/faux préparés avec une IA ou un logiciel comme Nolej (fichier .h5p).'),
        h('li', {}, 'Couplé à une fiche contrat, le QCM pose une série de questions par critère d’évaluation et peut remplir les notes de la fiche.'),
        h('li', {}, 'Ensuite : version papier (sujets mélangés et corrigés) ou passation en ligne dans l’espace élèves.'))),
    autres.length ? [h('h2', { class: 'titre-section' }, '👥 Partagés avec moi'), h('div', { class: 'grille-qcm' }, autres.map(carte))] : null);
}

// ------------------------------------------------------------------------------------------- fiches contrats d'une promotion
// [{ id, type, lib, matiere_id }] : contrats sommatifs (séquences), formatifs (séances) et hors séquence
export async function contratsPromo(ctx, pid) {
  if (!pid) return [];
  const seqs = await db.lire('sequences', `promotion_id=eq.${pid}&order=matiere_id,numero`);
  const seances = seqs.length ? await db.lire('seances', `sequence_id=in.(${seqs.map((x) => x.id).join(',')})&order=sequence_id,numero`) : [];
  const lots = await Promise.all([db.lire('contrats', `promotion_id=eq.${pid}`),
    seqs.length ? db.lire('contrats', `sequence_id=in.(${seqs.map((x) => x.id).join(',')})`) : [],
    seances.length ? db.lire('contrats', `seance_id=in.(${seances.map((x) => x.id).join(',')})`) : []]);
  const ks = [...new Map(lots.flat().map((k) => [k.id, k])).values()];
  const S = new Map(seqs.map((x) => [x.id, x])), X = new Map(seances.map((x) => [x.id, x])), M = new Map(ctx.matieres.map((m) => [m.id, m]));
  return ks.map((k) => {
    const x = k.seance_id ? X.get(k.seance_id) : null, sq = k.sequence_id ? S.get(k.sequence_id) : x ? S.get(x.sequence_id) : null;
    const mid = k.matiere_id || sq?.matiere_id, code = ctx.codeMat(M.get(mid)) || '';
    const lib = k.seance_id && x && sq ? `${code} ${sq.numero}.${x.numero} · ${x.titre || 'séance'} — contrat formatif`
      : k.sequence_id && sq ? `${code} séq. ${sq.numero} · ${sq.intitule || ''} — contrat sommatif`
      : `${code} · ${k.titre || 'sans titre'} — contrat ${k.type} hors séquence`;
    const lien = k.seance_id && sq ? `#/fiches/${sq.id}:formatif-${k.seance_id}` : k.sequence_id ? `#/fiches/${k.sequence_id}:sommatif` : `#/contrats/${k.id}`;
    return { id: k.id, type: k.type, lib, lien, matiere_id: mid, ordre: `${code} ${String(sq?.numero ?? 99).padStart(2, '0')} ${String(x?.numero ?? 0).padStart(2, '0')}` };
  }).sort((u, v) => u.ordre.localeCompare(v.ordre, 'fr'));
}
const criteresDe = (cid) => db.lire('criteres', `contrat_id=eq.${cid}&actif=is.true&order=groupe_ordre,ordre,id`);
const libCritere = (k) => `${k.groupe} › ${k.texte || 'critère'}`;

// ------------------------------------------------------------------------------------------- import H5P
// fichier .h5p (zip) : QCM (H5P.MultiChoice), vrai/faux (H5P.TrueFalse), séries (H5P.SingleChoiceSet, H5P.QuestionSet,
// livres interactifs, présentations…) ; les autres activités (textes à trous, glisser-déposer…) sont ignorées
export async function lireH5P(fichier) {
  if (!/\.h5p$/i.test(fichier.name)) throw new Error(`« ${fichier.name} » n’est pas un fichier H5P (.h5p).`);
  const P = await import('../pdf.js?v=20261113'); await P.chargerOutils();
  const zip = await window.JSZip.loadAsync(await fichier.arrayBuffer()).catch(() => { throw new Error(`« ${fichier.name} » est illisible.`); });
  const f = zip.file('content/content.json');
  if (!f) throw new Error(`« ${fichier.name} » ne contient pas d’activité H5P lisible.`);
  const contenu = JSON.parse(await f.async('string'));
  let meta = {};
  try { meta = JSON.parse(await zip.file('h5p.json').async('string')); } catch { /* sans description */ }
  const texte = (html) => (new DOMParser().parseFromString(String(html ?? ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  const out = []; let ignorees = 0;
  const ajouter = (q) => { if (q.texte && q.choix.length >= 2 && q.choix.some((c) => c.bon) && out.length < 200) out.push(q); };
  const visiter = (lib, params) => {
    if (!params || typeof params !== 'object') return;
    const nom = String(lib || '').split(' ')[0];
    if (nom === 'H5P.MultiChoice') {
      const choix = (params.answers || []).slice(0, 8).map((r) => ({ id: id6(), texte: texte(r.text), bon: !!r.correct, fb: texte(r.tipsAndFeedback?.chosenFeedback) }));
      const bons = choix.filter((c) => c.bon);
      ajouter({ id: 'q' + id6(), type: bons.length > 1 ? 'multiple' : 'unique', texte: texte(params.question), savoir: '',
        explication: bons.map((c) => c.fb).filter(Boolean).join(' ') || texte(params.overallFeedback?.[0]?.feedback), choix: choix.map(({ fb, ...c }) => c) });
      return;
    }
    if (nom === 'H5P.TrueFalse') {
      const vrai = String(params.correct) === 'true';
      ajouter({ id: 'q' + id6(), type: 'vraifaux', texte: texte(params.question), savoir: '', explication: texte(params.behaviour?.feedbackOnCorrect),
        choix: [{ id: 'v', texte: 'Vrai', bon: vrai }, { id: 'f', texte: 'Faux', bon: !vrai }] });
      return;
    }
    if (nom === 'H5P.SingleChoiceSet') {
      for (const c of params.choices || []) {
        const rs = (c.answers || []).slice(0, 8).map((r, i) => ({ id: id6(), texte: texte(r), bon: i === 0 }));
        ajouter({ id: 'q' + id6(), type: 'unique', texte: texte(c.question), savoir: '', explication: '', choix: rs });
      }
      return;
    }
    if (/^H5P\.(Blanks|DragText|DragQuestion|MarkTheWords|Essay|Summary|Dictation|ImageHotspotQuestion|AdvancedBlanks|SortParagraphs|ArithmeticQuiz)$/.test(nom)) { ignorees++; return; }
    parcourir(params);
  };
  const parcourir = (o) => {
    if (Array.isArray(o)) o.forEach(parcourir);
    else if (o && typeof o === 'object') { if (typeof o.library === 'string' && o.params) visiter(o.library, o.params); else Object.values(o).forEach(parcourir); }
  };
  visiter(meta.mainLibrary, contenu);
  // les réponses mélangées par le QCM en ligne et les versions papier : ordre d'origine gardé ici
  return { titre: texte(meta.title) || fichier.name.replace(/\.h5p$/i, ''), questions: out, ignorees };
}
function boutonH5P(apres) {
  const entree = h('input', { type: 'file', accept: '.h5p', hidden: true, onchange: async () => {
    const f = entree.files[0]; entree.value = '';
    if (!f) return;
    try {
      const r = await lireH5P(f);
      if (!r.questions.length) throw new Error(`Aucune question à choix (QCM ou vrai/faux) dans « ${f.name} »${r.ignorees ? ` : ${r.ignorees} activité(s) d’un autre type ignorée(s)` : ''}.`);
      await apres(r);
    } catch (e) { erreur(e); }
  } });
  return entree;
}

// ------------------------------------------------------------------------------------------- création
async function creer(ctx, { livre_id = null, contrat_id = null, h5p = false }, liste = []) {
  let docs = [];
  try { docs = (await db.lire('biblio_livres', 'espace=eq.cours&order=titre')).filter((l) => l.proprietaire === ctx.profil.id); } catch { /* Mes cours absent */ }
  const seqs = ctx.promo ? await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`) : [];
  const seances = seqs.length ? await db.lire('seances', `sequence_id=in.(${seqs.map((s) => s.id).join(',')})&order=sequence_id,numero`) : [];
  const contrats = await contratsPromo(ctx, ctx.promo?.id).catch(() => []);
  const S = new Map(seqs.map((s) => [s.id, s])), M = new Map(ctx.matieres.map((m) => [m.id, m]));
  const titre = h('input', { class: 'champ', placeholder: 'ex. Les acteurs de la construction' });
  const mesMats = ctx.matieres.filter((m) => ctx.enseigne(m.id));
  const matiere = h('select', { class: 'champ' }, h('option', { value: '' }, '—'), ctx.matieres.map((m) => h('option', { value: m.id, selected: mesMats[0]?.id === m.id }, m.nom)));
  const source = h('select', { class: 'champ' }, h('option', { value: '' }, 'Aucune : je saisis les questions'),
    docs.length ? h('optgroup', { label: 'Un document de Mes cours' }, docs.map((l) => h('option', { value: 'l-' + l.id, selected: l.id === livre_id }, l.titre))) : null,
    seances.length ? h('optgroup', { label: `Une séance (promotion ${ctx.promo.libelle})` }, seances.filter((x) => x.titre).map((x) => { const s = S.get(x.sequence_id); return h('option', { value: 's-' + x.id }, `${ctx.codeMat(M.get(s.matiere_id))} ${s.numero}.${x.numero} · ${x.titre}`); })) : null);
  const contrat = h('select', { class: 'champ' }, h('option', { value: '' }, 'Aucune'), contrats.map((k) => h('option', { value: k.id, selected: k.id === contrat_id }, k.lib)));
  const dossiers = [...new Set(liste.filter((q) => q.proprietaire === ctx.profil.id).map((q) => q.dossier).filter(Boolean))].sort();
  const dossier = h('input', { class: 'champ', list: 'dossiers-qcm', placeholder: 'ex. Séquence 3 · Charpente' });
  let importe = null;
  const etatH5P = h('small', { class: 'gris' }, 'Facultatif : un fichier .h5p (QCM, vrai/faux, série de questions) préparé avec une IA ou un logiciel comme Nolej.');
  const entree = boutonH5P((r) => { importe = r; if (!titre.value.trim()) titre.value = r.titre; etatH5P.textContent = `✔ ${pluriel(r.questions.length, 'question reconnue', 'questions reconnues')}${r.ignorees ? ` · ${r.ignorees} activité(s) d’un autre type ignorée(s)` : ''}`; etatH5P.className = 'etat-lien ok'; });
  const majTitre = () => {
    const v = source.value;
    if (v.startsWith('s-')) { const x = seances.find((y) => y.id === Number(v.slice(2))); matiere.value = S.get(x.sequence_id)?.matiere_id || matiere.value; }
    if (titre.value.trim()) return;
    if (v.startsWith('l-')) titre.value = docs.find((l) => l.id === Number(v.slice(2)))?.titre || '';
    if (v.startsWith('s-')) titre.value = seances.find((x) => x.id === Number(v.slice(2)))?.titre || '';
  };
  const majContrat = () => {
    const k = contrats.find((x) => x.id === Number(contrat.value)); if (!k) return;
    if (k.matiere_id) matiere.value = k.matiere_id;
    if (!titre.value.trim()) titre.value = 'QCM · ' + k.lib.split(' — ')[0].replace(/^\S+\s/, '');
  };
  source.addEventListener('change', majTitre); contrat.addEventListener('change', majContrat); majContrat(); majTitre();
  if (h5p) setTimeout(() => entree.click(), 50);
  const ok = await fenetre('Nouveau QCM', h('div', { class: 'formulaire' },
    h('label', { class: 'large' }, 'À partir de', source),
    h('div', { class: 'large' }, h('span', { class: 'lib-form' }, 'Importer un fichier H5P'), h('div', { class: 'boutons-detail' }, entree, h('button', { class: 'btn petit', type: 'button', onclick: () => entree.click() }, '📥 Choisir un fichier .h5p'), etatH5P)),
    h('label', { class: 'large' }, 'Titre', titre), h('label', {}, 'Matière', matiere),
    h('label', {}, 'Dossier (facultatif)', dossier, h('datalist', { id: 'dossiers-qcm' }, dossiers.map((d) => h('option', { value: d })))),
    h('label', { class: 'large' }, `Fiche contrat couplée${ctx.promo ? ` (promotion ${ctx.promo.libelle})` : ''}`, contrat,
      h('small', { class: 'gris' }, contrats.length ? 'Une série de questions par critère d’évaluation ; les résultats peuvent remplir les notes de la fiche.' : 'Aucune fiche contrat dans cette promotion : ouvrez d’abord la fiche contrat de la séance ou de la séquence.')),
    h('p', { class: 'aide large' }, 'Avec une source ou une fiche contrat, « 🤖 Remplir avec une IA » prépare la demande à partir de son titre, de son contenu (sommaire, objectifs, critères) et de ses savoirs associés. Aucune donnée d’élève n’est envoyée.')),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Créer', classe: 'principal', action: () => { if (!titre.value.trim()) throw new Error('Donnez un titre.'); return true; } }], { large: true });
  if (!ok) { if (livre_id || contrat_id) history.back(); return; }
  try {
    const v = source.value, x = { titre: titre.value.trim(), matiere_id: matiere.value ? Number(matiere.value) : null,
      livre_id: v.startsWith('l-') ? Number(v.slice(2)) : null, seance_id: v.startsWith('s-') ? Number(v.slice(2)) : null, questions: importe?.questions || [] };
    if (dossier.value.trim()) x.dossier = dossier.value.trim().slice(0, 200);
    if (contrat.value) x.contrat_id = Number(contrat.value);
    const q = await db.ajouter('qcm', x);
    if (importe) toast(`${pluriel(importe.questions.length, 'question importée', 'questions importées')}`);
    location.hash = '#/qcm/' + q.id;
  } catch (e) { erreur(e); }
}

// ------------------------------------------------------------------------------------------- éditeur
async function editeur(zone, ctx, q, sessions, partages, ref, tous = []) {
  const mien = q.proprietaire === ctx.profil.id;
  let source = null;
  try {
    if (q.livre_id) { const l = (await db.lire('biblio_livres', `id=eq.${q.livre_id}`))[0]; if (l) source = { type: 'document', titre: l.titre, lignes: (l.sommaire || []).map((e) => '  '.repeat(e.n || 0) + e.t), savoirs: l.savoirs || [] }; }
    if (q.seance_id) { const x = (await db.lire('seances', `id=eq.${q.seance_id}`))[0]; if (x) source = { type: 'séance', titre: x.titre, lignes: [x.objectif_inter, ...(String(x.objectifs_ops || '').split('\n'))].filter(Boolean), savoirs: x.savoirs || [] }; }
  } catch { /* source supprimée */ }
  let questions = (q.questions || []).map((x) => ({ ...x, choix: (x.choix || []).map((c) => ({ ...c })) }));
  let minuteur = null;
  // fiche contrat couplée (une série de questions par critère)
  const avecContrat = 'contrat_id' in q;
  const contrats = avecContrat && mien ? await contratsPromo(ctx, ctx.promo?.id).catch(() => []) : [];
  let criteres = [], contratLib = null;
  const chargerContrat = async () => {
    criteres = q.contrat_id ? await criteresDe(q.contrat_id).catch(() => []) : [];
    contratLib = q.contrat_id ? (contrats.find((k) => k.id === q.contrat_id) || (await contratsPromo(ctx, ctx.promo?.id).catch(() => [])).find((k) => k.id === q.contrat_id) || { lib: 'fiche contrat d’une autre promotion', lien: null }) : null;
  };
  await chargerContrat();
  const etat = h('span', { class: 'etat-enregistrement gris' });
  const enregistrer = (immediat = false) => {
    if (!mien) return;
    clearTimeout(minuteur); etat.textContent = 'Enregistrement…';
    const f = async () => { try { const v = { titre: q.titre, consigne: q.consigne, matiere_id: q.matiere_id, questions }; if ('dossier' in q) v.dossier = q.dossier; if (avecContrat) v.contrat_id = q.contrat_id; await db.modifier('qcm', q.id, v); q.questions = questions; etat.textContent = 'Enregistré'; } catch (e) { etat.textContent = ''; erreur(e); } };
    if (immediat) return f(); minuteur = setTimeout(f, 700);
  };
  const libSavoir = (c) => ref.sav[c]?.libelle_court || ref.sav[c]?.libelle || '';
  const nbQ = h('input', { class: 'champ court', type: 'number', min: 1, max: 40, value: q.contrat_id ? 3 : 10, 'aria-label': 'Nombre de questions' });
  const importH5P = boutonH5P(async (r) => {
    const rempl = questions.length ? await fenetre('Importer un fichier H5P', h('p', {}, `${pluriel(r.questions.length, 'question reconnue', 'questions reconnues')}${r.ignorees ? ` (${r.ignorees} activité(s) d’un autre type ignorée(s))` : ''}. Les ajouter aux ${questions.length} questions actuelles, ou les remplacer ?`),
      [{ texte: 'Annuler', valeur: null }, { texte: 'Remplacer', valeur: 'r' }, { texte: 'Ajouter', classe: 'principal', valeur: 'a' }]) : 'a';
    if (!rempl) return;
    questions = rempl === 'r' ? r.questions : questions.concat(r.questions); dessinerQuestions(); await enregistrer(true);
    toast(pluriel(r.questions.length, 'question importée', 'questions importées'));
  });
  const niveauIA = h('select', { class: 'champ', 'aria-label': 'Niveau' }, ['BTS 1re année', 'BTS 2e année', 'révision rapide (facile)', 'approfondissement (difficile)'].map((n) => h('option', {}, n)));
  const zoneQ = h('div', { class: 'questions-qcm' });

  const zoneSeries = h('div', {});
  function dessinerSeries() {
    if (!q.contrat_id) { vider(zoneSeries); return; }
    const K = new Set(criteres.map((k) => k.id));
    const sans = questions.filter((x) => !K.has(Number(x.critere))).length;
    vider(zoneSeries, h('section', { class: 'series-qcm' },
      h('div', { class: 'tete-dossier-qcm' }, h('h2', { class: 'titre-section' }, '✅ Séries par critère d’évaluation'),
        contratLib?.lien ? h('a', { class: 'btn petit', href: contratLib.lien }, 'Ouvrir la fiche contrat') : null,
        mien && criteres.length ? h('button', { class: 'btn petit', type: 'button', title: 'Ranger les questions dans l’ordre des critères', onclick: () => {
          const rang = (x) => { const i = criteres.findIndex((k) => k.id === Number(x.critere)); return i < 0 ? 9999 : i; };
          questions = questions.map((x, i) => [x, i]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(([x]) => x); dessinerQuestions(); enregistrer();
        } }, '⇅ Ranger par critère') : null),
      h('p', { class: 'aide' }, `Fiche couplée : ${contratLib?.lib || ''}. Pour chaque critère, la note de l’élève (0 à 5) est la part de bonnes réponses de sa série (ex. 3 justes sur 4 → 4/5). Les critères sans question ne sont pas notés.`),
      criteres.length ? h('ul', { class: 'liste-series' }, criteres.map((k) => { const n = questions.filter((x) => Number(x.critere) === k.id).length; return h('li', { class: n ? '' : 'vide-serie' },
        h('span', { class: 'lib' }, libCritere(k)), h('span', { class: 'etat-compte' + (n ? ' vert' : ' orange') }, pluriel(n, 'question', 'questions')),
        mien ? h('button', { class: 'lien petit', type: 'button', onclick: () => { const x = nouvelleQuestion('unique'); x.critere = k.id; questions.push(x); dessinerQuestions(); enregistrer(); setTimeout(() => zoneQ.querySelector('.question-qcm:last-of-type textarea')?.focus(), 50); } }, '＋ question') : null); })) : h('p', { class: 'vide' }, 'Cette fiche contrat n’a pas encore de critère.'),
      sans ? h('p', { class: 'aide' }, `${pluriel(sans, 'question n’est rattachée', 'questions ne sont rattachées')} à aucun critère (comptée(s) dans la note sur 20, pas dans la fiche contrat).`) : null));
  }
  function dessinerQuestions() {
    dessinerSeries();
    vider(zoneQ, questions.map((x, i) => carteQuestion(x, i)),
      mien ? h('div', { class: 'boutons-detail' }, Object.entries(TYPES).map(([t, lib]) => h('button', { class: 'btn petit', type: 'button', onclick: () => { questions.push(nouvelleQuestion(t)); dessinerQuestions(); enregistrer(); setTimeout(() => zoneQ.querySelector('.question-qcm:last-of-type textarea')?.focus(), 50); } }, '＋ ' + lib))) : null);
    vider(compte, pluriel(questions.length, 'question', 'questions'));
  }
  function carteQuestion(x, i) {
    const ro = !mien;
    const choix = h('div', { class: 'choix-qcm' }, x.choix.map((c, k) => h('div', { class: 'ligne-choix' + (c.bon ? ' bon' : '') },
      h('input', { type: x.type === 'multiple' ? 'checkbox' : 'radio', name: 'bon-' + x.id, checked: !!c.bon, disabled: ro, title: 'Bonne réponse', onchange: () => {
        if (x.type === 'multiple') c.bon = !c.bon; else x.choix.forEach((y) => { y.bon = y === c; });
        dessinerQuestions(); enregistrer(); } }),
      h('input', { class: 'champ', value: c.texte, readonly: ro || x.type === 'vraifaux', placeholder: `Réponse ${String.fromCharCode(65 + k)}`, oninput: (e) => { c.texte = e.target.value; enregistrer(); } }),
      !ro && x.type !== 'vraifaux' && x.choix.length > 2 ? h('button', { class: 'icone', type: 'button', title: 'Retirer cette réponse', onclick: () => { x.choix.splice(k, 1); dessinerQuestions(); enregistrer(); } }, '✖') : null)),
    !ro && x.type !== 'vraifaux' && x.choix.length < 8 ? h('button', { class: 'lien petit', type: 'button', onclick: () => { x.choix.push({ id: id6(), texte: '', bon: false }); dessinerQuestions(); enregistrer(); } }, '＋ réponse') : null);
    const sansBonne = !x.choix.some((c) => c.bon) || !String(x.texte || '').trim() || x.choix.some((c) => !String(c.texte || '').trim());
    return h('section', { class: 'question-qcm' + (sansBonne ? ' incomplete' : '') },
      h('div', { class: 'tete-question' }, h('span', { class: 'num-question' }, i + 1),
        h('select', { class: 'champ type-question', disabled: ro, onchange: (e) => {
          const t = e.target.value;
          if (t === 'vraifaux') x.choix = [{ id: 'v', texte: 'Vrai', bon: true }, { id: 'f', texte: 'Faux', bon: false }];
          else if (x.type === 'vraifaux') x.choix = nouvelleQuestion(t).choix;
          if (t === 'unique' && x.choix.filter((c) => c.bon).length > 1) x.choix.forEach((c, k) => { c.bon = k === x.choix.findIndex((y) => y.bon); });
          x.type = t; dessinerQuestions(); enregistrer();
        } }, Object.entries(TYPES).map(([t, lib]) => h('option', { value: t, selected: t === x.type }, lib))),
        sansBonne ? h('span', { class: 'etat-compte orange' }, 'à compléter') : null,
        !ro ? h('span', { class: 'outils-question' },
          h('button', { class: 'icone', type: 'button', title: 'Monter', disabled: i === 0, onclick: () => { [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]]; dessinerQuestions(); enregistrer(); } }, '▲'),
          h('button', { class: 'icone', type: 'button', title: 'Descendre', disabled: i === questions.length - 1, onclick: () => { [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]]; dessinerQuestions(); enregistrer(); } }, '▼'),
          h('button', { class: 'icone', type: 'button', title: 'Dupliquer', onclick: () => { questions.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(x)), id: 'q' + id6() }); dessinerQuestions(); enregistrer(); } }, '⧉'),
          h('button', { class: 'icone', type: 'button', title: 'Supprimer la question', onclick: () => { questions.splice(i, 1); dessinerQuestions(); enregistrer(); } }, '✖')) : null),
      h('textarea', { class: 'champ enonce', rows: 2, readonly: ro, placeholder: 'Énoncé de la question', oninput: (e) => { x.texte = e.target.value; enregistrer(); } }, x.texte),
      choix,
      h('div', { class: 'pied-question' },
        h('label', {}, 'Explication (montrée à l’élève après correction)', h('textarea', { class: 'champ', rows: 1, readonly: ro, oninput: (e) => { x.explication = e.target.value; enregistrer(); } }, x.explication || '')),
        h('label', {}, 'Savoir associé', h('select', { class: 'champ', disabled: ro, onchange: (e) => { x.savoir = e.target.value; enregistrer(); } },
          h('option', { value: '' }, '—'), ref.savoirs.map((s) => h('option', { value: s.code, selected: s.code === x.savoir }, `${s.code} · ${s.libelle_court || s.libelle}`)))),
        q.contrat_id ? h('label', { class: 'large' }, 'Critère évalué (fiche contrat)', h('select', { class: 'champ', disabled: ro, onchange: (e) => { x.critere = e.target.value ? Number(e.target.value) : null; dessinerSeries(); enregistrer(); } },
          h('option', { value: '' }, '— aucun'), criteres.map((k) => h('option', { value: k.id, selected: k.id === Number(x.critere) }, libCritere(k))))) : null));
  }
  const compte = h('span', {});
  const ss = sessions;
  vider(zone,
    h('nav', { class: 'ariane-biblio' }, h('a', { href: '#/qcm' }, 'Mes QCM'), ' › ', h('b', {}, q.titre || 'QCM')),
    h('header', { class: 'entete-page' },
      h('div', { class: 'tete-qcm' },
        h('input', { class: 'champ titre-qcm', value: q.titre, readonly: !mien, 'aria-label': 'Titre du QCM', oninput: (e) => { q.titre = e.target.value; enregistrer(); } }),
        h('p', { class: 'sous-titre' }, compte, source ? ` · source : ${source.type} « ${source.titre} »` : '', !mien ? ` · partagé par ${nomCollegue(q.proprietaire)}` : '', ' ', etat)),
      h('div', { class: 'actions-page' },
        h('button', { class: 'btn', title: 'Faire le QCM comme un élève (rien n’est enregistré)', onclick: () => { if (!questions.some((x) => x.texte)) return toast('Ajoutez d’abord des questions', 'erreur'); enregistrer(true); apercuEleve(ctx.promo?.id, '#/qcm/' + q.id); } }, '👁  Tester comme un élève'),
        h('button', { class: 'btn', onclick: () => dialoguePDF(ctx, q, questions) }, '⬇  PDF (sujets et corrigés)'),
        mien ? h('button', { class: 'btn principal', onclick: () => ouvrirEnLigne(ctx, [{ q, questions }]) }, '🌐  Ouvrir en ligne') : null,
        mien ? h('button', { class: 'btn', onclick: async () => { if (await partager(q, partages, ctx, ss)) pageQcm(zone, String(q.id), ctx); } }, '👥  Partager') : null,
        h('button', { class: 'btn', onclick: () => copier(q, mien) }, mien ? '⧉  Dupliquer' : '⧉  Copier dans mes QCM'),
        mien ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmer('Supprimer le QCM', `Supprimer « ${q.titre} »${ss.length ? ' et les résultats de ses passations en ligne' : ''} ?`, 'Supprimer')) { try { await db.supprimer('qcm', q.id); toast('QCM supprimé'); location.hash = '#/qcm'; } catch (e) { erreur(e); } } } }, '✖') : null)),
    mien ? h('div', { class: 'formulaire bloc-qcm' },
      h('label', { class: 'large' }, 'Consigne aux élèves (facultatif)', h('textarea', { class: 'champ', rows: 1, oninput: (e) => { q.consigne = e.target.value; enregistrer(); } }, q.consigne || '')),
      h('label', {}, 'Matière', h('select', { class: 'champ', onchange: (e) => { q.matiere_id = e.target.value ? Number(e.target.value) : null; enregistrer(); } },
        h('option', { value: '' }, '—'), ctx.matieres.map((m) => h('option', { value: m.id, selected: m.id === q.matiere_id }, m.nom)))),
      'dossier' in q ? h('label', {}, 'Dossier', h('input', { class: 'champ', value: q.dossier || '', placeholder: 'aucun', list: 'dossiers-qcm-ed', oninput: (e) => { q.dossier = e.target.value.trim().slice(0, 200); enregistrer(); } }),
        h('datalist', { id: 'dossiers-qcm-ed' }, [...new Set(tous.filter((x) => x.proprietaire === q.proprietaire).map((x) => x.dossier).filter(Boolean))].map((d) => h('option', { value: d })))) : null,
      avecContrat ? h('label', { class: 'large' }, `Fiche contrat couplée${ctx.promo ? ` (promotion ${ctx.promo.libelle})` : ''}`, h('select', { class: 'champ', onchange: async (e) => {
        q.contrat_id = e.target.value ? Number(e.target.value) : null; await chargerContrat(); dessinerQuestions(); enregistrer(true);
        const k = contrats.find((c) => c.id === q.contrat_id); if (k && !q.matiere_id && k.matiere_id) q.matiere_id = k.matiere_id;
      } }, h('option', { value: '' }, 'Aucune'), q.contrat_id && !contrats.some((k) => k.id === q.contrat_id) ? h('option', { value: q.contrat_id, selected: true }, contratLib?.lib || 'fiche contrat') : null,
        contrats.map((k) => h('option', { value: k.id, selected: k.id === q.contrat_id }, k.lib)))) : null) : null,
    mien ? h('div', { class: 'barre-ia-qcm' }, h('span', {}, 'Questions proposées par une IA :'), nbQ, h('span', {}, 'questions,'), niveauIA,
      boutonIA(() => configIA(q, source, () => questions, (l, remplacer) => { questions = remplacer ? l : questions.concat(l); dessinerQuestions(); return enregistrer(true); }, ref, Number(nbQ.value) || 10, niveauIA.value, q.contrat_id ? criteres : []), 'btn petit'),
      importH5P, h('button', { class: 'btn petit', type: 'button', onclick: () => importH5P.click(), title: 'Ajouter les questions d’un fichier .h5p (QCM, vrai/faux, série de questions)' }, '📥 Importer un fichier H5P'),
      h('span', { class: 'aide' }, q.contrat_id ? 'Fiche couplée : « questions » = par critère.' : source ? '' : 'Sans source : l’IA part du titre du QCM.')) : null,
    zoneSeries,
    ss.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Passations en ligne'),
      h('ul', { class: 'liste-resultats' }, ss.map((s) => h('li', {}, h('a', { href: '#/qcm/s-' + s.id }, h('b', {}, `Promotion ${ctx.promotions.find((p) => p.id === s.promotion_id)?.libelle || ''}`),
        h('small', { class: 'gris' }, ` · du ${dateHeure(s.ouverture)} au ${dateHeure(s.fermeture)}`), ' → résultats'))))) : null,
    h('h2', { class: 'titre-section' }, 'Questions'), zoneQ);
  dessinerQuestions();
}

// ------------------------------------------------------------------------------------------- IA (copier-coller)
function configIA(q, source, actuelles, ajouter, ref, nb, niveau, criteres = []) {
  const codes = ref.savoirs.map((s) => s.code);
  const K = criteres.map((k, i) => ({ k, code: 'K' + (i + 1) }));
  return {
    titre: `QCM · ${q.titre}`,
    demande: async () => `DOCUMENT À REMPLIR : un QCM formatif pour des élèves de BTS Systèmes constructifs bois et habitat (niveau : ${niveau}).
Titre du QCM : ${q.titre}
${source ? `Source (${source.type}) : ${source.titre}\n${source.lignes.length ? 'Contenu :\n' + source.lignes.join('\n') + '\n' : ''}${source.savoirs.length ? 'Savoirs associés : ' + source.savoirs.join(', ') + '\n' : ''}` : ''}${actuelles().length ? `Questions déjà écrites (à ne pas répéter) : ${actuelles().map((x) => x.texte).filter(Boolean).join(' / ')}\n` : ''}
${K.length ? `FICHE CONTRAT D’ÉVALUATION COUPLÉE (objectifs et critères d’évaluation) :\n${K.map(({ k, code }) => `${code} : ${k.groupe} › ${k.texte}`).join('\n')}\n\n` : ''}TÂCHE : ${K.length ? `rédige une série de ${nb} question(s) pour CHACUN des ${K.length} critères ci-dessus (${nb * K.length} questions en tout), chaque question vérifiant précisément son critère ; indique pour chaque question la ligne « Critère : K… ».` : `rédige ${nb} questions variées et progressives, fidèles au contenu ci-dessus.`} Mélange les types : une seule bonne réponse (4 réponses), plusieurs bonnes réponses (4 à 5 réponses) et vrai/faux. Réponses fausses plausibles (erreurs fréquentes), pas de « toutes les réponses ». Pour chaque question : une explication courte de la bonne réponse et le code du savoir associé du référentiel le plus proche.

SAVOIRS ASSOCIÉS DU RÉFÉRENTIEL :
${listeSavoirs(ref)}`,
    format: '=== QCM ===\nQ : énoncé de la question\nType : unique (ou multiple, ou vraifaux)\n+ bonne réponse\n- réponse fausse\n- réponse fausse\n- réponse fausse\nExplication : …\nSavoir : S…\n' + (K.length ? 'Critère : K1\n' : '') + '\nQ : …\n=== FIN ===\n(une ligne « + » par bonne réponse, une ligne « - » par réponse fausse ; pour vrai/faux : « + Vrai » et « - Faux », ou l’inverse)',
    lire: (B) => {
      const b = B.find((x) => x.nom === 'QCM'); if (!b) return null;
      const l = [];
      let cur = null;
      for (const brute of String(b.corps).split('\n')) {
        const t = brute.trim(); if (!t) continue;
        let m;
        if ((m = t.match(/^(?:Q\s*\d*|Question\s*\d*)\s*[:.)-]\s*(.+)$/i))) { cur = { id: 'q' + id6(), type: '', texte: m[1].trim(), explication: '', savoir: '', choix: [] }; l.push(cur); continue; }
        if (!cur) continue;
        if ((m = t.match(/^Type\s*:\s*(.+)$/i))) { const v = m[1].toLowerCase(); cur.type = /vrai|faux/.test(v) ? 'vraifaux' : /plusieurs|multiple/.test(v) ? 'multiple' : 'unique'; continue; }
        if ((m = t.match(/^Explication\s*:\s*(.+)$/i))) { cur.explication = m[1].trim(); continue; }
        if ((m = t.match(/^Crit[èe]re\s*:\s*K?\s*(\d+)/i))) { const c = K[Number(m[1]) - 1]; if (c) cur.critere = c.k.id; continue; }
        if ((m = t.match(/^Savoirs?\s*:\s*(.+)$/i))) { cur.savoir = codes.find((c) => new RegExp(`(^|[^\\w.-])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(' ' + m[1])) || ''; continue; }
        if ((m = t.match(/^(?:\[(x|X| )\]|([+\-*✔✓✗✘]))\s*(.+)$/))) { const bon = m[1] ? m[1].toLowerCase() === 'x' : /[+✔✓]/.test(m[2]); cur.choix.push({ id: id6(), texte: m[3].trim(), bon }); continue; }
      }
      for (const x of l) {
        const vf = x.choix.length === 2 && x.choix.every((c) => /^(vrai|faux)$/i.test(c.texte));
        if (vf || x.type === 'vraifaux') { const vraiBon = x.choix.find((c) => /^vrai$/i.test(c.texte))?.bon ?? true; x.type = 'vraifaux'; x.choix = [{ id: 'v', texte: 'Vrai', bon: vraiBon }, { id: 'f', texte: 'Faux', bon: !vraiBon }]; }
        else if (!x.type) x.type = x.choix.filter((c) => c.bon).length > 1 ? 'multiple' : 'unique';
        if (x.type === 'unique' && x.choix.filter((c) => c.bon).length > 1) x.type = 'multiple';
      }
      const ok = l.filter((x) => x.texte && x.choix.length >= 2 && x.choix.some((c) => c.bon));
      return { items: ok.length ? [{ cle: 'questions', titre: `${ok.length} question(s)`, detail: resume(ok.map((x, i) => `${i + 1}. ${x.texte}`).join(' · '), 300) }] : [], data: ok };
    },
    appliquer: async (d, coches, remplacer) => {
      if (!coches.has('questions') || !d.length) return 'Aucune question reconnue';
      await ajouter(d, remplacer);
      return remplacer ? `${d.length} questions (les précédentes ont été remplacées)` : `${d.length} questions ajoutées`;
    },
  };
}

// ------------------------------------------------------------------------------------------- PDF : sujets (versions mélangées) et corrigés
async function dialoguePDF(ctx, q, questions) {
  const valides = questions.filter((x) => x.texte && x.choix.some((c) => c.bon));
  if (!valides.length) { toast('Ajoutez d’abord des questions complètes', 'erreur'); return; }
  const versions = h('select', { class: 'champ' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === 2 }, n === 1 ? 'Une seule version' : `${n} versions mélangées (A à ${String.fromCharCode(64 + n)})`)));
  const corriges = h('input', { type: 'checkbox', checked: true }), sujets = h('input', { type: 'checkbox', checked: true });
  const mode = await fenetre('QCM sur papier', h('div', { class: 'formulaire' },
    h('label', { class: 'large' }, 'Sujets', versions),
    h('label', { class: 'case' }, sujets, ' Sujets à distribuer'), h('label', { class: 'case' }, corriges, ' Corrigés (bonnes réponses cochées et explications)'),
    h('p', { class: 'aide large' }, 'Avec plusieurs versions, l’ordre des questions et des réponses change d’une version à l’autre (contre la copie) ; chaque version a son corrigé.')),
  [{ texte: 'Annuler', valeur: null }, { texte: '🖶  Imprimer', valeur: 'imprimer' }, { texte: '⬇  Télécharger le PDF', classe: 'principal', valeur: 'pdf' }]);
  if (!mode) return;
  const n = Number(versions.value), mat = ctx.matieres.find((m) => m.id === q.matiere_id);
  const blocs = [];
  const version = (k) => {
    if (n === 1) return valides;
    const m = melangeur(`${q.id}-${k}`);
    return m(valides).map((x) => ({ ...x, choix: x.type === 'vraifaux' ? x.choix : m(x.choix) }));
  };
  const lettre = (k) => (n > 1 ? ' · version ' + String.fromCharCode(65 + k) : '');
  const partie = (k, corrige) => {
    if (blocs.length) blocs.push({ t: 'saut' });
    blocs.push({ t: 'titre', texte: (corrige ? 'CORRIGÉ · ' : 'QCM · ') + (q.titre || '').toUpperCase(), sous: [mat?.nom, ctx.promo ? 'promotion ' + ctx.promo.libelle : ''].filter(Boolean).join(' · ') + lettre(k), couleur: '#1E8F86' });
    if (!corrige) blocs.push({ t: 'infos', paires: [['Nom, prénom', ''], ['Date', ''], ['Note', `      / ${version(k).length}`], ['Version', n > 1 ? String.fromCharCode(65 + k) : '—']] });
    blocs.push({ t: 'texte', texte: q.consigne || 'Cochez la ou les bonnes réponses. Une question rapporte 1 point si toutes les bonnes réponses, et elles seules, sont cochées.' });
    version(k).forEach((x, i) => blocs.push({ t: 'question', num: i + 1, texte: x.texte, aide: x.type === 'multiple' ? '(plusieurs réponses possibles)' : '', corrige,
      explication: corrige ? [x.explication, x.savoir ? `savoir ${x.savoir}` : ''].filter(Boolean).join(' · ') : '', choix: x.choix.map((c) => ({ texte: c.texte, bon: c.bon })) }));
  };
  for (let k = 0; k < n; k++) if (sujets.checked) partie(k, false);
  for (let k = 0; k < n; k++) if (corriges.checked) partie(k, true);
  if (!blocs.length) return;
  envoyerPDF({ fichier: nomFichier(`QCM_${q.titre}.pdf`), titre: q.titre, pied: `QCM · ${q.titre}`, blocs }, mode);
}

// ------------------------------------------------------------------------------------------- passation en ligne
// un QCM, ou tous ceux d'un dossier ([{ q, questions }]) : ouverts aux élèves d'une promotion entre deux dates
async function ouvrirEnLigne(ctx, lot) {
  const complet = (questions) => questions.length && questions.every((x) => x.texte && x.choix.some((c) => c.bon) && x.choix.every((c) => String(c.texte || '').trim()));
  const bons = lot.filter(({ questions }) => complet(questions)), mauvais = lot.length - bons.length;
  if (!bons.length) { toast(lot.length > 1 ? 'Aucun QCM complet dans ce dossier' : lot[0].questions.length ? 'Complétez d’abord les questions marquées « à compléter »' : 'Ajoutez d’abord des questions', 'erreur'); return; }
  const promos = [...ctx.promotions].sort((a, b) => b.annee_debut - a.annee_debut);
  const promo = h('select', { class: 'champ' }, promos.map((p) => h('option', { value: p.id, selected: p.id === ctx.promo?.id }, 'Promotion ' + p.libelle)));
  const maintenant = new Date(); maintenant.setSeconds(0, 0);
  const fin = new Date(maintenant); fin.setDate(fin.getDate() + 7); fin.setHours(20, 0);
  const ouv = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(maintenant) }), ferm = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(fin) });
  const tent = h('select', { class: 'champ' }, h('option', { value: 1 }, 'Une seule tentative'), h('option', { value: 3 }, '3 tentatives'), h('option', { value: 20 }, 'Illimitées (entraînement)'));
  const melanger = h('input', { type: 'checkbox', checked: true });
  const couples = bons.filter(({ q }) => q.contrat_id);
  const versContrat = couples.length ? h('input', { type: 'checkbox', checked: true }) : null;
  const ok = await fenetre(lot.length > 1 ? `Ouvrir ${pluriel(bons.length, 'QCM', 'QCM')} en ligne` : 'Ouvrir le QCM en ligne', h('div', { class: 'formulaire' },
    lot.length > 1 ? h('p', { class: 'aide large' }, bons.map(({ q }) => q.titre).join(' · ') + (mauvais ? ` — ${pluriel(mauvais, 'QCM incomplet ou vide est laissé', 'QCM incomplets ou vides sont laissés')} de côté.` : '')) : null,
    h('label', {}, 'Pour (classe entière)', promo), h('label', {}, 'Tentatives', tent),
    h('label', {}, 'Ouvert à partir du', ouv), h('label', {}, 'Fermé le', ferm),
    h('label', { class: 'case large' }, melanger, ' Mélanger l’ordre des questions et des réponses pour chaque élève'),
    versContrat ? h('label', { class: 'case large' }, versContrat, ` Remplir automatiquement la fiche contrat couplée dès que l’élève rend ses réponses${couples.length < bons.length ? ` (${pluriel(couples.length, 'QCM couplé', 'QCM couplés')})` : ''}`,
      h('small', { class: 'gris' }, ' — note de 0 à 5 par critère (meilleure tentative) ; réservé aux enseignants de la matière de la fiche')) : null,
    h('p', { class: 'aide large' }, 'Les élèves de la promotion le trouvent dans « Mes QCM » de leur espace pendant cette période. La correction (bonnes réponses et explications) leur est montrée dès qu’ils ont rendu leurs réponses.')),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Ouvrir', classe: 'principal', action: () => { if (new Date(ferm.value) <= new Date(ouv.value)) throw new Error('La fermeture doit être après l’ouverture.'); return true; } }]);
  if (!ok) return;
  let derniere = null, refus = [];
  for (const { q } of bons) {
    const v = { qcm_id: q.id, promotion_id: Number(promo.value), ouverture: new Date(ouv.value).toISOString(), fermeture: new Date(ferm.value).toISOString(), tentatives: Number(tent.value), melanger: melanger.checked };
    if (q.contrat_id && versContrat?.checked) v.vers_contrat = true;
    try { derniere = await db.ajouter('qcm_sessions', v); }
    catch (e) {
      if (v.vers_contrat) { try { delete v.vers_contrat; derniere = await db.ajouter('qcm_sessions', v); refus.push(`${q.titre} : ${e.message}`); continue; } catch (e2) { e = e2; } }
      erreur(e); return;
    }
  }
  if (refus.length) toast('Ouvert, sans remplissage automatique de la fiche contrat : ' + refus.join(' ; '), 'erreur');
  else toast(bons.length > 1 ? `${bons.length} QCM ouverts aux élèves` : 'QCM ouvert aux élèves');
  if (bons.length === 1 && derniere) location.hash = '#/qcm/s-' + derniere.id; else ctx.recharger?.();
}

// résultats d'une passation : par élève, par question, par savoir ; report dans les résultats intermédiaires
async function pageSession(zone, ctx, sid, liste, sessions, ref) {
  const s = sessions.find((x) => x.id === sid);
  if (!s) { vider(zone, h('p', { class: 'vide' }, 'Passation introuvable.')); return; }
  const q = liste.find((x) => x.id === s.qcm_id) || { titre: 'QCM', questions: [] };
  const [eleves, reps] = await Promise.all([db.lire('eleves', `promotion_id=eq.${s.promotion_id}&order=nom,prenom`), db.lire('qcm_reponses', `session_id=eq.${s.id}&order=tentative`)]);
  const P = ctx.promotions.find((p) => p.id === s.promotion_id);
  const meilleure = new Map();
  for (const r of reps) { const m = meilleure.get(r.eleve_id); if (!m || r.points > m.points) meilleure.set(r.eleve_id, r); }
  const juste = (x, r) => { const bons = x.choix.filter((c) => c.bon).map((c) => c.id).sort().join(','); return (r.reponses[x.id] || []).slice().sort().join(',') === bons; };
  const rendus = [...meilleure.values()];
  const parQ = (q.questions || []).map((x, i) => ({ x, i, taux: rendus.length ? rendus.filter((r) => juste(x, r)).length / rendus.length : null })).sort((a, b) => (a.taux ?? 2) - (b.taux ?? 2));
  const sav = new Map();
  for (const { x, taux } of parQ) if (x.savoir && taux !== null) sav.set(x.savoir, (sav.get(x.savoir) || []).concat(taux));
  const notes = rendus.map((r) => (r.total ? (r.points / r.total) * 20 : null)).filter((n) => n !== null);
  const moyenne = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
  const ouvert = new Date(s.ouverture) <= new Date() && new Date(s.fermeture) > new Date();
  const mien = s.proprietaire === ctx.profil.id;
  const crits = q.contrat_id ? await criteresDe(q.contrat_id).catch(() => []) : [];
  const parCritere = rendus.length ? crits.map((k) => { const l = parQ.filter(({ x }) => Number(x.critere) === k.id); return { k, n: l.length, t: l.length ? l.reduce((a, b) => a + (b.taux ?? 0), 0) / l.length : 0 }; }).filter((c) => c.n) : [];
  vider(zone,
    h('nav', { class: 'ariane-biblio' }, h('a', { href: '#/qcm' }, 'Mes QCM'), ' › ', h('a', { href: '#/qcm/' + q.id }, q.titre), ' › ', h('b', {}, 'Résultats')),
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📊  ' + q.titre), h('p', { class: 'sous-titre' }, `Promotion ${P?.libelle || ''} · du ${dateHeure(s.ouverture)} au ${dateHeure(s.fermeture)} · ${s.tentatives === 1 ? 'une tentative' : s.tentatives + ' tentatives'}`)),
      h('div', { class: 'actions-page' },
        ouvert ? h('span', { class: 'etat-compte vert' }, 'en ligne') : h('span', { class: 'etat-compte' }, new Date(s.ouverture) > new Date() ? 'à venir' : 'fermé'),
        mien && ouvert ? h('button', { class: 'btn', onclick: async () => { try { await db.modifier('qcm_sessions', s.id, { fermeture: new Date().toISOString(), ouverture: new Date(Math.min(new Date(s.ouverture), Date.now() - 60000)).toISOString() }); toast('QCM fermé'); pageQcm(zone, 's-' + s.id, ctx); } catch (e) { erreur(e); } } }, '⏹  Fermer maintenant') : null,
        mien ? h('button', { class: 'btn', onclick: () => prolonger(s, zone, ctx) }, '🕑  Modifier les dates') : null,
        mien && rendus.length ? h('button', { class: 'btn principal', onclick: () => reporter(ctx, s, q, zone) }, s.evaluation_id ? '↻  Mettre à jour le report' : '➜  Reporter dans les résultats') : null,
        q.contrat_id && rendus.length ? h('button', { class: 'btn', title: 'Écrire dans la fiche contrat couplée la note de chaque élève pour chaque critère (0 à 5)', onclick: async () => {
          if (!await confirmer('Remplir la fiche contrat', 'Écrire dans la fiche contrat couplée la note (0 à 5) de chaque élève pour chaque critère qui a une série de questions ? Les notes déjà saisies pour ces critères sont remplacées.', 'Remplir')) return;
          try { const n = await db.rpc('qcm_remplir_contrat', { session: s.id }); toast(`${n} note(s) écrite(s) dans la fiche contrat`); } catch (e) { erreur(e); }
        } }, '✅  Remplir la fiche contrat') : null,
        mien ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmer('Supprimer la passation', 'Supprimer cette passation et les réponses des élèves ?', 'Supprimer')) { try { await db.supprimer('qcm_sessions', s.id); location.hash = '#/qcm/' + q.id; } catch (e) { erreur(e); } } } }, '✖') : null)),
    h('section', { class: 'chiffres-cles' },
      h('div', { class: 'tuile' }, h('strong', {}, `${rendus.length} / ${eleves.filter((e) => !e.arret).length}`), h('span', {}, 'élèves ont rendu')),
      h('div', { class: 'tuile' }, h('strong', {}, virgule(moyenne)), h('span', {}, 'moyenne / 20')),
      h('div', { class: 'tuile' }, h('strong', {}, notes.length ? virgule(Math.min(...notes)) + ' – ' + virgule(Math.max(...notes)) : '—'), h('span', {}, 'notes extrêmes'))),
    s.evaluation_id ? h('p', { class: 'info-partage' }, '➜ Reporté dans les résultats intermédiaires (« Résultats et moyennes »).') : null,
    s.vers_contrat ? h('p', { class: 'info-partage' }, '✅ Chaque copie rendue remplit automatiquement la fiche contrat couplée (note de 0 à 5 par critère).') : null,
    parCritere.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Par critère de la fiche contrat'), h('ul', { class: 'barres-questions' }, parCritere.map(({ k, t, n }) => h('li', {},
      h('div', { class: 'lib' }, libCritere(k), h('small', { class: 'gris' }, ` · ${pluriel(n, 'question', 'questions')}`)), h('div', { class: 'barre' }, h('span', { style: { width: Math.round(t * 100) + '%', background: t < 0.4 ? 'var(--g-na, #C0392B)' : t < 0.8 ? '#D4A017' : 'var(--teal)' } })),
      h('span', { class: 'taux' }, Math.round(t * 100) + ' %'))))) : null,
    h('div', { class: 'grille-resultats-qcm' },
      h('section', {}, h('h2', { class: 'titre-section' }, 'Par élève'),
        h('div', { class: 'tableau-defile' }, h('table', { class: 'liste' }, h('thead', {}, h('tr', {}, ['Élève', 'Note / 20', 'Points', 'Rendu le'].map((t) => h('th', {}, t)))),
          h('tbody', {}, eleves.filter((e) => !e.arret).map((e) => { const r = meilleure.get(e.id); return h('tr', { class: r ? '' : 'gris' },
            h('td', {}, h('b', {}, e.nom), ' ', e.prenom), h('td', { class: 'num' }, r ? h('b', {}, virgule(r.total ? r.points / r.total * 20 : null)) : '—'),
            h('td', { class: 'num' }, r ? `${virgule(Number(r.points), 0)} / ${r.total}` : 'non rendu'), h('td', { class: 'petit' }, r ? dateHeure(r.rendu_le) + (r.tentative > 1 ? ` (${r.tentative}e)` : '') : '')); }))))),
      h('section', {}, h('h2', { class: 'titre-section' }, 'Par question (les plus ratées en premier)'),
        rendus.length ? h('ul', { class: 'barres-questions' }, parQ.map(({ x, i, taux }) => h('li', {},
          h('div', { class: 'lib' }, h('b', {}, `Q${i + 1}`), ' ', x.texte, x.savoir ? h('small', { class: 'gris' }, ' · ' + x.savoir) : null),
          h('div', { class: 'barre' }, h('span', { style: { width: Math.round((taux ?? 0) * 100) + '%', background: taux < 0.5 ? 'var(--g-na, #C0392B)' : taux < 0.75 ? '#D4A017' : 'var(--teal)' } })),
          h('span', { class: 'taux' }, Math.round((taux ?? 0) * 100) + ' %')))) : h('p', { class: 'vide' }, 'Pas encore de réponse.'),
        sav.size ? [h('h2', { class: 'titre-section' }, 'Par savoir associé'), h('ul', { class: 'barres-questions' }, [...sav.entries()].map(([c, l]) => { const t = l.reduce((a, b) => a + b, 0) / l.length; return h('li', {},
          h('div', { class: 'lib' }, h('b', {}, c), ' ', ref.sav[c]?.libelle_court || ref.sav[c]?.libelle || ''), h('div', { class: 'barre' }, h('span', { style: { width: Math.round(t * 100) + '%', background: t < 0.5 ? 'var(--g-na, #C0392B)' : t < 0.75 ? '#D4A017' : 'var(--teal)' } })),
          h('span', { class: 'taux' }, Math.round(t * 100) + ' %')); }))] : null)));
}
async function prolonger(s, zone, ctx) {
  const ouv = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(s.ouverture) }), ferm = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(s.fermeture) });
  const ok = await fenetre('Dates de la passation', h('div', { class: 'formulaire' }, h('label', {}, 'Ouvert à partir du', ouv), h('label', {}, 'Fermé le', ferm)),
    [{ texte: 'Annuler', valeur: false }, { texte: 'Enregistrer', classe: 'principal', action: () => { if (new Date(ferm.value) <= new Date(ouv.value)) throw new Error('La fermeture doit être après l’ouverture.'); return true; } }]);
  if (!ok) return;
  try { await db.modifier('qcm_sessions', s.id, { ouverture: new Date(ouv.value).toISOString(), fermeture: new Date(ferm.value).toISOString() }); toast('Dates enregistrées'); pageQcm(zone, 's-' + s.id, ctx); } catch (e) { erreur(e); }
}
async function reporter(ctx, s, q, zone) {
  const mats = ctx.matieres.filter((m) => ctx.peutMatiere(m.id));
  if (!mats.length) { toast('Vous ne pouvez saisir de résultats dans aucune matière', 'erreur'); return; }
  const mat = h('select', { class: 'champ' }, mats.map((m) => h('option', { value: m.id, selected: m.id === q.matiere_id }, m.nom)));
  const lib = h('input', { class: 'champ', value: 'QCM · ' + q.titre }), coef = h('input', { class: 'champ court', type: 'number', min: 0, step: 0.5, value: 1 });
  const ok = await fenetre('Reporter dans les résultats', h('div', { class: 'formulaire' },
    h('p', { class: 'aide large' }, 'Crée (ou met à jour) un résultat intermédiaire noté sur 20 dans « Résultats et moyennes » : la meilleure note de chaque élève. Coefficient 0 : visible sans compter dans la moyenne.'),
    h('label', {}, 'Matière', mat), h('label', {}, 'Coefficient', coef), h('label', { class: 'large' }, 'Intitulé', lib)),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Reporter', classe: 'principal', valeur: true }]);
  if (!ok) return;
  try { await db.rpc('qcm_reporter', { session: s.id, matiere: Number(mat.value), libelle: lib.value.trim() || q.titre, coef: Number(coef.value) }); toast('Notes reportées dans les résultats'); pageQcm(zone, 's-' + s.id, ctx); } catch (e) { erreur(e); }
}

// ------------------------------------------------------------------------------------------- partage et copie
// partage avec la classe = QCM en libre accès dans l'espace élèves (entraînement, tentatives illimitées) jusqu'à la fin de l'année scolaire
const LIBRE = 20;
const finAnnee = () => { const d = new Date(), a = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); return new Date(a, 7, 31, 23, 0); };
const enLibreAcces = (s) => s.tentatives === LIBRE && new Date(s.fermeture) > new Date();
const completQ = (questions) => (questions || []).length && questions.every((x) => x.texte && x.choix?.some((c) => c.bon) && x.choix.every((c) => String(c.texte || '').trim()));
function sectionClasse(ctx, qs, sessions, dossier = false) {
  const promos = [...ctx.promotions].sort((a, b) => b.annee_debut - a.annee_debut);
  const coches = promos.filter((p) => qs.length && qs.every((q) => sessions.some((s) => s.qcm_id === q.id && s.promotion_id === p.id && enLibreAcces(s)))).map((p) => p.id);
  return { promos, coches, texte: `Les élèves des promotions cochées trouvent ${dossier ? 'les QCM de ce dossier' : 'ce QCM'} dans « Mes QCM » de leur espace, en libre accès (entraînement, tentatives illimitées, correction après chaque essai) jusqu’au ${finAnnee().toLocaleDateString('fr-FR')}.${dossier ? ' Un QCM rangé plus tard dans le dossier : partagez le dossier à nouveau.' : ''} Pour une évaluation à dates fixes, utilisez plutôt « 🌐 Ouvrir en ligne ».` };
}
async function enregistrerClasse(qs, sessions, avant, voulues) {
  let ouverts = 0, incomplets = 0;
  const maintenant = new Date(); maintenant.setSeconds(0, 0);
  for (const pid of voulues) for (const q of qs) {
    if (sessions.some((s) => s.qcm_id === q.id && s.promotion_id === pid && enLibreAcces(s))) continue;
    if (!completQ(q.questions)) { incomplets++; continue; }
    const s = await db.ajouter('qcm_sessions', { qcm_id: q.id, promotion_id: pid, ouverture: maintenant.toISOString(), fermeture: finAnnee().toISOString(), tentatives: LIBRE, melanger: true });
    sessions.push(s); ouverts++;
  }
  for (const pid of avant) if (!voulues.includes(pid)) for (const s of sessions.filter((x) => x.promotion_id === pid && qs.some((q) => q.id === x.qcm_id) && enLibreAcces(x))) {
    const v = { fermeture: new Date().toISOString(), ouverture: new Date(Math.min(new Date(s.ouverture), Date.now() - 60000)).toISOString() };
    await db.modifier('qcm_sessions', s.id, v); Object.assign(s, v);
  }
  if (incomplets) toast(`${pluriel(incomplets, 'QCM incomplet n’a pas été ouvert', 'QCM incomplets n’ont pas été ouverts')} aux élèves (questions à compléter)`, 'erreur');
  return ouverts;
}
async function partager(q, partages, ctx, sessions) {
  const classe = ctx ? sectionClasse(ctx, [q], sessions) : null;
  const r = await dialoguePartage(`Partager « ${q.titre} »`, 'Les collègues choisis voient ce QCM, l’impriment et peuvent le copier dans leurs QCM pour l’adapter ou l’ouvrir à leurs élèves ; ils ne modifient pas le vôtre.',
    { tous: q.partage_tous, qui: partages.filter((p) => p.qcm_id === q.id).map((p) => p.destinataire), moi: q.proprietaire, eleves: classe });
  if (!r) return false;
  try {
    if (r.tous !== q.partage_tous) { await db.modifier('qcm', q.id, { partage_tous: r.tous }); q.partage_tous = r.tous; }
    const avant = partages.filter((p) => p.qcm_id === q.id).map((p) => p.destinataire);
    for (const u of avant) if (!r.qui.includes(u)) await db.supprimer('qcm_partages', u, `qcm_id=eq.${q.id}&destinataire`);
    const ajout = r.qui.filter((u) => !avant.includes(u)).map((u) => ({ qcm_id: q.id, destinataire: u }));
    if (ajout.length) await db.ajouter('qcm_partages', ajout);
    if (classe) await enregistrerClasse([q], sessions, classe.coches, r.promos);
    toast(r.tous || r.qui.length || r.promos?.length ? 'Partage enregistré' : 'De nouveau privé');
    return true;
  } catch (e) { erreur(e); return false; }
}
async function partagerDossier(d, dossiersP, moi, zone, ctx, qs = [], sessions = []) {
  const avant = avecTable(dossiersP) ? dossiersP.filter((x) => x.proprietaire === moi && x.dossier === d) : null;
  const classe = sectionClasse(ctx, qs, sessions, true);
  const r = await dialoguePartage(`Partager le dossier « ${d} »`, avant ? 'Les collègues choisis voient tous les QCM de ce dossier, y compris ceux que vous y rangerez plus tard ; ils les impriment et peuvent les copier dans leurs QCM ; ils ne modifient pas les vôtres.'
    : 'Partage du dossier avec des collègues : exécutez d’abord le script 30 dans Supabase (les cases « enseignants » ne sont pas enregistrées).',
  { tous: avant ? avant.some((x) => !x.destinataire) : false, qui: avant ? avant.filter((x) => x.destinataire).map((x) => x.destinataire) : [], moi, eleves: classe });
  if (!r) return;
  try {
    if (avant) {
      for (const x of avant) if (x.destinataire ? !r.qui.includes(x.destinataire) : !r.tous) await db.supprimer('qcm_dossiers_partages', x.id);
      const ajout = r.qui.filter((u) => !avant.some((x) => x.destinataire === u)).map((u) => ({ dossier: d, destinataire: u }));
      if (r.tous && !avant.some((x) => !x.destinataire)) ajout.push({ dossier: d, destinataire: null });
      if (ajout.length) await db.ajouter('qcm_dossiers_partages', ajout);
    }
    await enregistrerClasse(qs, sessions, classe.coches, r.promos);
    toast(r.tous || r.qui.length || r.promos.length ? 'Dossier partagé' : 'Dossier de nouveau privé'); pageQcm(zone, '', ctx);
  } catch (e) { erreur(e); }
}
const avecTable = (x) => Array.isArray(x);
async function copier(q, mien) {
  try {
    const v = { titre: q.titre + (mien ? ' (copie)' : ''), consigne: q.consigne, matiere_id: q.matiere_id, livre_id: mien ? q.livre_id : null, seance_id: q.seance_id, questions: q.questions || [] };
    if (mien && q.dossier) v.dossier = q.dossier;
    if (q.contrat_id) v.contrat_id = q.contrat_id;
    const n = await db.ajouter('qcm', v);
    toast(mien ? 'QCM dupliqué' : 'Copié dans vos QCM'); location.hash = '#/qcm/' + n.id;
  } catch (e) { erreur(e); }
}
