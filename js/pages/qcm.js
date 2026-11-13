// Mes QCM : QCM formatifs de l'enseignant (préparés avec une IA à partir d'un cours ou d'une séance, ou à la main),
// version papier (sujets mélangés et corrigés), passation en ligne dans l'espace élèves, résultats et report.
// #/qcm : liste · #/qcm/ID : un QCM · #/qcm/l-ID : nouveau QCM à partir d'un document de Mes cours · #/qcm/s-ID : résultats d'une passation
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
  let liste, partages, sessions;
  try { [liste, partages, sessions] = await Promise.all([db.lire('qcm', 'order=maj_le.desc'), db.lire('qcm_partages'), db.lire('qcm_sessions', 'order=fermeture.desc'), chargerCollegues()]); }
  catch (e) {
    vider(zone, h('header', { class: 'entete-page' }, h('h1', {}, '📝  Mes QCM')), h('div', { class: 'erreur-page' }, h('h2', {}, 'QCM pas encore installés'),
      h('p', {}, ctx.estAdmin() ? 'Exécutez le script « 28_qcm.sql » dans Supabase (SQL Editor → New query → Run), puis rechargez la page.' : 'L’administrateur doit d’abord installer les QCM.'), h('p', { class: 'aide' }, e.message)));
    return;
  }
  const a = String(arg || '');
  if (/^s-\d+$/.test(a)) return pageSession(zone, ctx, Number(a.slice(2)), liste, sessions, ref);
  if (/^\d+$/.test(a)) { const q = liste.find((x) => x.id === Number(a)); if (q) return editeur(zone, ctx, q, sessions.filter((s) => s.qcm_id === q.id), partages, ref); }
  if (/^l-\d+$/.test(a)) return creer(ctx, { livre_id: Number(a.slice(2)) });

  const mats = new Map(ctx.matieres.map((m) => [m.id, m]));
  const miens = liste.filter((q) => q.proprietaire === moi), autres = liste.filter((q) => q.proprietaire !== moi);
  const carte = (q) => {
    const ss = sessions.filter((s) => s.qcm_id === q.id), ouverte = ss.find((s) => new Date(s.ouverture) <= new Date() && new Date(s.fermeture) > new Date());
    const partage = q.partage_tous || partages.some((p) => p.qcm_id === q.id);
    return h('a', { class: 'carte-qcm', href: '#/qcm/' + q.id, style: { '--couleur': mats.get(q.matiere_id)?.couleur || 'var(--teal)' } },
      h('b', {}, q.titre || 'QCM sans titre'),
      h('span', { class: 'gris' }, [pluriel((q.questions || []).length, 'question', 'questions'), mats.get(q.matiere_id)?.nom, q.proprietaire !== moi ? 'par ' + nomCollegue(q.proprietaire) : null].filter(Boolean).join(' · ')),
      h('span', { class: 'badges-qcm' }, ouverte ? h('span', { class: 'etat-compte vert' }, 'en ligne jusqu’au ' + dateHeure(ouverte.fermeture)) : null,
        ss.length && !ouverte ? h('span', { class: 'etat-compte' }, pluriel(ss.length, 'passation', 'passations')) : null, partage && q.proprietaire === moi ? h('span', { class: 'etat-compte' }, '👥 partagé') : null));
  };
  vider(zone,
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📝  Mes QCM'), h('p', { class: 'sous-titre' }, 'QCM formatifs : préparés avec une IA à partir d’un cours ou d’une séance, sur papier ou en ligne dans l’espace élèves')),
      h('div', { class: 'actions-page' }, h('button', { class: 'btn principal', onclick: () => creer(ctx, {}) }, '＋  Nouveau QCM'))),
    miens.length ? h('div', { class: 'grille-qcm' }, miens.map(carte)) : h('div', { class: 'carte-detail accueil-cours' }, h('h2', {}, '📝 Aucun QCM pour l’instant'),
      h('ul', { class: 'conseils-cours' },
        h('li', {}, '« ＋ Nouveau QCM » : partez d’un document de Mes cours ou d’une séance, puis « 🤖 Remplir avec une IA » propose les questions (seul le contenu du cours est envoyé à l’IA).'),
        h('li', {}, 'Ou, depuis la fiche d’un document de Mes cours : « 📝 Créer un QCM ».'),
        h('li', {}, 'Ensuite : version papier (sujets mélangés et corrigés) ou passation en ligne dans l’espace élèves.'))),
    autres.length ? [h('h2', { class: 'titre-section' }, '👥 Partagés avec moi'), h('div', { class: 'grille-qcm' }, autres.map(carte))] : null);
}

// ------------------------------------------------------------------------------------------- création
async function creer(ctx, { livre_id = null }) {
  const ref = await ctx.referentiel();
  let docs = [];
  try { docs = (await db.lire('biblio_livres', 'espace=eq.cours&order=titre')).filter((l) => l.proprietaire === ctx.profil.id); } catch { /* Mes cours absent */ }
  const seqs = ctx.promo ? await db.lire('sequences', `promotion_id=eq.${ctx.promo.id}&order=matiere_id,numero`) : [];
  const seances = seqs.length ? await db.lire('seances', `sequence_id=in.(${seqs.map((s) => s.id).join(',')})&order=sequence_id,numero`) : [];
  const S = new Map(seqs.map((s) => [s.id, s])), M = new Map(ctx.matieres.map((m) => [m.id, m]));
  const titre = h('input', { class: 'champ', placeholder: 'ex. Les acteurs de la construction' });
  const mesMats = ctx.matieres.filter((m) => ctx.enseigne(m.id));
  const matiere = h('select', { class: 'champ' }, h('option', { value: '' }, '—'), ctx.matieres.map((m) => h('option', { value: m.id, selected: mesMats[0]?.id === m.id }, m.nom)));
  const source = h('select', { class: 'champ' }, h('option', { value: '' }, 'Aucune : je saisis les questions'),
    docs.length ? h('optgroup', { label: 'Un document de Mes cours' }, docs.map((l) => h('option', { value: 'l-' + l.id, selected: l.id === livre_id }, l.titre))) : null,
    seances.length ? h('optgroup', { label: `Une séance (promotion ${ctx.promo.libelle})` }, seances.filter((x) => x.titre).map((x) => { const s = S.get(x.sequence_id); return h('option', { value: 's-' + x.id }, `${ctx.codeMat(M.get(s.matiere_id))} ${s.numero}.${x.numero} · ${x.titre}`); })) : null);
  const majTitre = () => { if (titre.value.trim()) return; const v = source.value; if (v.startsWith('l-')) titre.value = docs.find((l) => l.id === Number(v.slice(2)))?.titre || ''; if (v.startsWith('s-')) titre.value = seances.find((x) => x.id === Number(v.slice(2)))?.titre || ''; if (v.startsWith('s-')) { const x = seances.find((y) => y.id === Number(v.slice(2))); matiere.value = S.get(x.sequence_id)?.matiere_id || matiere.value; } };
  source.addEventListener('change', majTitre); majTitre();
  const ok = await fenetre('Nouveau QCM', h('div', { class: 'formulaire' },
    h('label', { class: 'large' }, 'À partir de', source), h('label', { class: 'large' }, 'Titre', titre), h('label', {}, 'Matière', matiere),
    h('p', { class: 'aide large' }, 'Avec une source, le bouton « 🤖 Remplir avec une IA » de l’éditeur prépare la demande à partir de son titre, de son sommaire (ou de ses objectifs) et de ses savoirs associés. Aucune donnée d’élève n’est envoyée.')),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Créer', classe: 'principal', action: () => { if (!titre.value.trim()) throw new Error('Donnez un titre.'); return true; } }], { large: true });
  if (!ok) { if (livre_id) history.back(); return; }
  try {
    const v = source.value;
    const q = await db.ajouter('qcm', { titre: titre.value.trim(), matiere_id: matiere.value ? Number(matiere.value) : null,
      livre_id: v.startsWith('l-') ? Number(v.slice(2)) : null, seance_id: v.startsWith('s-') ? Number(v.slice(2)) : null, questions: [] });
    location.hash = '#/qcm/' + q.id;
  } catch (e) { erreur(e); }
  void ref;
}

// ------------------------------------------------------------------------------------------- éditeur
async function editeur(zone, ctx, q, sessions, partages, ref) {
  const mien = q.proprietaire === ctx.profil.id;
  let source = null;
  try {
    if (q.livre_id) { const l = (await db.lire('biblio_livres', `id=eq.${q.livre_id}`))[0]; if (l) source = { type: 'document', titre: l.titre, lignes: (l.sommaire || []).map((e) => '  '.repeat(e.n || 0) + e.t), savoirs: l.savoirs || [] }; }
    if (q.seance_id) { const x = (await db.lire('seances', `id=eq.${q.seance_id}`))[0]; if (x) source = { type: 'séance', titre: x.titre, lignes: [x.objectif_inter, ...(String(x.objectifs_ops || '').split('\n'))].filter(Boolean), savoirs: x.savoirs || [] }; }
  } catch { /* source supprimée */ }
  let questions = (q.questions || []).map((x) => ({ ...x, choix: (x.choix || []).map((c) => ({ ...c })) }));
  let minuteur = null;
  const etat = h('span', { class: 'etat-enregistrement gris' });
  const enregistrer = (immediat = false) => {
    if (!mien) return;
    clearTimeout(minuteur); etat.textContent = 'Enregistrement…';
    const f = async () => { try { await db.modifier('qcm', q.id, { titre: q.titre, consigne: q.consigne, matiere_id: q.matiere_id, questions }); q.questions = questions; etat.textContent = 'Enregistré'; } catch (e) { etat.textContent = ''; erreur(e); } };
    if (immediat) return f(); minuteur = setTimeout(f, 700);
  };
  const libSavoir = (c) => ref.sav[c]?.libelle_court || ref.sav[c]?.libelle || '';
  const nbQ = h('input', { class: 'champ court', type: 'number', min: 3, max: 40, value: 10, 'aria-label': 'Nombre de questions' });
  const niveauIA = h('select', { class: 'champ', 'aria-label': 'Niveau' }, ['BTS 1re année', 'BTS 2e année', 'révision rapide (facile)', 'approfondissement (difficile)'].map((n) => h('option', {}, n)));
  const zoneQ = h('div', { class: 'questions-qcm' });

  function dessinerQuestions() {
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
          h('option', { value: '' }, '—'), ref.savoirs.map((s) => h('option', { value: s.code, selected: s.code === x.savoir }, `${s.code} · ${s.libelle_court || s.libelle}`))))));
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
        mien ? h('button', { class: 'btn principal', onclick: () => ouvrirEnLigne(ctx, q, questions) }, '🌐  Ouvrir en ligne') : null,
        mien ? h('button', { class: 'btn', onclick: () => partager(q, partages) }, '👥  Partager') : null,
        h('button', { class: 'btn', onclick: () => copier(q, mien) }, mien ? '⧉  Dupliquer' : '⧉  Copier dans mes QCM'),
        mien ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmer('Supprimer le QCM', `Supprimer « ${q.titre} »${ss.length ? ' et les résultats de ses passations en ligne' : ''} ?`, 'Supprimer')) { try { await db.supprimer('qcm', q.id); toast('QCM supprimé'); location.hash = '#/qcm'; } catch (e) { erreur(e); } } } }, '✖') : null)),
    mien ? h('div', { class: 'formulaire bloc-qcm' },
      h('label', { class: 'large' }, 'Consigne aux élèves (facultatif)', h('textarea', { class: 'champ', rows: 1, oninput: (e) => { q.consigne = e.target.value; enregistrer(); } }, q.consigne || '')),
      h('label', {}, 'Matière', h('select', { class: 'champ', onchange: (e) => { q.matiere_id = e.target.value ? Number(e.target.value) : null; enregistrer(); } },
        h('option', { value: '' }, '—'), ctx.matieres.map((m) => h('option', { value: m.id, selected: m.id === q.matiere_id }, m.nom))))) : null,
    mien ? h('div', { class: 'barre-ia-qcm' }, h('span', {}, 'Questions proposées par une IA :'), nbQ, h('span', {}, 'questions,'), niveauIA,
      boutonIA(() => configIA(q, source, () => questions, (l, remplacer) => { questions = remplacer ? l : questions.concat(l); dessinerQuestions(); return enregistrer(true); }, ref, Number(nbQ.value) || 10, niveauIA.value), 'btn petit'),
      h('span', { class: 'aide' }, source ? '' : 'Sans source : l’IA part du titre du QCM.')) : null,
    ss.length ? h('section', {}, h('h2', { class: 'titre-section' }, 'Passations en ligne'),
      h('ul', { class: 'liste-resultats' }, ss.map((s) => h('li', {}, h('a', { href: '#/qcm/s-' + s.id }, h('b', {}, `Promotion ${ctx.promotions.find((p) => p.id === s.promotion_id)?.libelle || ''}`),
        h('small', { class: 'gris' }, ` · du ${dateHeure(s.ouverture)} au ${dateHeure(s.fermeture)}`), ' → résultats'))))) : null,
    h('h2', { class: 'titre-section' }, 'Questions'), zoneQ);
  dessinerQuestions();
}

// ------------------------------------------------------------------------------------------- IA (copier-coller)
function configIA(q, source, actuelles, ajouter, ref, nb, niveau) {
  const codes = ref.savoirs.map((s) => s.code);
  return {
    titre: `QCM · ${q.titre}`,
    demande: async () => `DOCUMENT À REMPLIR : un QCM formatif pour des élèves de BTS Systèmes constructifs bois et habitat (niveau : ${niveau}).
Titre du QCM : ${q.titre}
${source ? `Source (${source.type}) : ${source.titre}\n${source.lignes.length ? 'Contenu :\n' + source.lignes.join('\n') + '\n' : ''}${source.savoirs.length ? 'Savoirs associés : ' + source.savoirs.join(', ') + '\n' : ''}` : ''}${actuelles().length ? `Questions déjà écrites (à ne pas répéter) : ${actuelles().map((x) => x.texte).filter(Boolean).join(' / ')}\n` : ''}
TÂCHE : rédige ${nb} questions variées et progressives, fidèles au contenu ci-dessus. Mélange les types : une seule bonne réponse (4 réponses), plusieurs bonnes réponses (4 à 5 réponses) et vrai/faux. Réponses fausses plausibles (erreurs fréquentes), pas de « toutes les réponses ». Pour chaque question : une explication courte de la bonne réponse et le code du savoir associé du référentiel le plus proche.

SAVOIRS ASSOCIÉS DU RÉFÉRENTIEL :
${listeSavoirs(ref)}`,
    format: '=== QCM ===\nQ : énoncé de la question\nType : unique (ou multiple, ou vraifaux)\n+ bonne réponse\n- réponse fausse\n- réponse fausse\n- réponse fausse\nExplication : …\nSavoir : S…\n\nQ : …\n=== FIN ===\n(une ligne « + » par bonne réponse, une ligne « - » par réponse fausse ; pour vrai/faux : « + Vrai » et « - Faux », ou l’inverse)',
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
async function ouvrirEnLigne(ctx, q, questions) {
  const valides = questions.filter((x) => x.texte && x.choix.some((c) => c.bon) && x.choix.every((c) => String(c.texte || '').trim()));
  if (!valides.length || valides.length < questions.length) { toast(valides.length ? 'Complétez d’abord les questions marquées « à compléter »' : 'Ajoutez d’abord des questions', 'erreur'); return; }
  const promos = [...ctx.promotions].sort((a, b) => b.annee_debut - a.annee_debut);
  const promo = h('select', { class: 'champ' }, promos.map((p) => h('option', { value: p.id, selected: p.id === ctx.promo?.id }, 'Promotion ' + p.libelle)));
  const maintenant = new Date(); maintenant.setSeconds(0, 0);
  const fin = new Date(maintenant); fin.setDate(fin.getDate() + 7); fin.setHours(20, 0);
  const ouv = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(maintenant) }), ferm = h('input', { class: 'champ', type: 'datetime-local', value: pourLocal(fin) });
  const tent = h('select', { class: 'champ' }, h('option', { value: 1 }, 'Une seule tentative'), h('option', { value: 3 }, '3 tentatives'), h('option', { value: 20 }, 'Illimitées (entraînement)'));
  const melanger = h('input', { type: 'checkbox', checked: true });
  const ok = await fenetre('Ouvrir le QCM en ligne', h('div', { class: 'formulaire' },
    h('label', {}, 'Pour', promo), h('label', {}, 'Tentatives', tent),
    h('label', {}, 'Ouvert à partir du', ouv), h('label', {}, 'Fermé le', ferm),
    h('label', { class: 'case large' }, melanger, ' Mélanger l’ordre des questions et des réponses pour chaque élève'),
    h('p', { class: 'aide large' }, 'Les élèves de la promotion le trouvent dans « Mes QCM » de leur espace pendant cette période. La correction (bonnes réponses et explications) leur est montrée dès qu’ils ont rendu leurs réponses.')),
  [{ texte: 'Annuler', valeur: false }, { texte: 'Ouvrir', classe: 'principal', action: () => { if (new Date(ferm.value) <= new Date(ouv.value)) throw new Error('La fermeture doit être après l’ouverture.'); return true; } }]);
  if (!ok) return;
  try {
    const s = await db.ajouter('qcm_sessions', { qcm_id: q.id, promotion_id: Number(promo.value), ouverture: new Date(ouv.value).toISOString(), fermeture: new Date(ferm.value).toISOString(), tentatives: Number(tent.value), melanger: melanger.checked });
    toast('QCM ouvert aux élèves'); location.hash = '#/qcm/s-' + s.id;
  } catch (e) { erreur(e); }
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
  vider(zone,
    h('nav', { class: 'ariane-biblio' }, h('a', { href: '#/qcm' }, 'Mes QCM'), ' › ', h('a', { href: '#/qcm/' + q.id }, q.titre), ' › ', h('b', {}, 'Résultats')),
    h('header', { class: 'entete-page' }, h('div', {}, h('h1', {}, '📊  ' + q.titre), h('p', { class: 'sous-titre' }, `Promotion ${P?.libelle || ''} · du ${dateHeure(s.ouverture)} au ${dateHeure(s.fermeture)} · ${s.tentatives === 1 ? 'une tentative' : s.tentatives + ' tentatives'}`)),
      h('div', { class: 'actions-page' },
        ouvert ? h('span', { class: 'etat-compte vert' }, 'en ligne') : h('span', { class: 'etat-compte' }, new Date(s.ouverture) > new Date() ? 'à venir' : 'fermé'),
        mien && ouvert ? h('button', { class: 'btn', onclick: async () => { try { await db.modifier('qcm_sessions', s.id, { fermeture: new Date().toISOString(), ouverture: new Date(Math.min(new Date(s.ouverture), Date.now() - 60000)).toISOString() }); toast('QCM fermé'); pageQcm(zone, 's-' + s.id, ctx); } catch (e) { erreur(e); } } }, '⏹  Fermer maintenant') : null,
        mien ? h('button', { class: 'btn', onclick: () => prolonger(s, zone, ctx) }, '🕑  Modifier les dates') : null,
        mien && rendus.length ? h('button', { class: 'btn principal', onclick: () => reporter(ctx, s, q, zone) }, s.evaluation_id ? '↻  Mettre à jour le report' : '➜  Reporter dans les résultats') : null,
        mien ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmer('Supprimer la passation', 'Supprimer cette passation et les réponses des élèves ?', 'Supprimer')) { try { await db.supprimer('qcm_sessions', s.id); location.hash = '#/qcm/' + q.id; } catch (e) { erreur(e); } } } }, '✖') : null)),
    h('section', { class: 'chiffres-cles' },
      h('div', { class: 'tuile' }, h('strong', {}, `${rendus.length} / ${eleves.filter((e) => !e.arret).length}`), h('span', {}, 'élèves ont rendu')),
      h('div', { class: 'tuile' }, h('strong', {}, virgule(moyenne)), h('span', {}, 'moyenne / 20')),
      h('div', { class: 'tuile' }, h('strong', {}, notes.length ? virgule(Math.min(...notes)) + ' – ' + virgule(Math.max(...notes)) : '—'), h('span', {}, 'notes extrêmes'))),
    s.evaluation_id ? h('p', { class: 'info-partage' }, '➜ Reporté dans les résultats intermédiaires (« Résultats et moyennes »).') : null,
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
async function partager(q, partages) {
  const r = await dialoguePartage(`Partager « ${q.titre} »`, 'Les collègues choisis voient ce QCM, l’impriment et peuvent le copier dans leurs QCM pour l’adapter ou l’ouvrir à leurs élèves ; ils ne modifient pas le vôtre.',
    { tous: q.partage_tous, qui: partages.filter((p) => p.qcm_id === q.id).map((p) => p.destinataire), moi: q.proprietaire });
  if (!r) return;
  try {
    if (r.tous !== q.partage_tous) { await db.modifier('qcm', q.id, { partage_tous: r.tous }); q.partage_tous = r.tous; }
    const avant = partages.filter((p) => p.qcm_id === q.id).map((p) => p.destinataire);
    for (const u of avant) if (!r.qui.includes(u)) await db.supprimer('qcm_partages', u, `qcm_id=eq.${q.id}&destinataire`);
    const ajout = r.qui.filter((u) => !avant.includes(u)).map((u) => ({ qcm_id: q.id, destinataire: u }));
    if (ajout.length) await db.ajouter('qcm_partages', ajout);
    toast(r.tous || r.qui.length ? 'Partage enregistré' : 'De nouveau privé');
  } catch (e) { erreur(e); }
}
async function copier(q, mien) {
  try {
    const n = await db.ajouter('qcm', { titre: q.titre + (mien ? ' (copie)' : ''), consigne: q.consigne, matiere_id: q.matiere_id, livre_id: mien ? q.livre_id : null, seance_id: q.seance_id, questions: q.questions || [] });
    toast(mien ? 'QCM dupliqué' : 'Copié dans vos QCM'); location.hash = '#/qcm/' + n.id;
  } catch (e) { erreur(e); }
}
