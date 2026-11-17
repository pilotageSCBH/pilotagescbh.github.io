// Assistant « Remplir avec une IA » : copier-coller avec l'IA choisie par chaque enseignant (ChatGPT, Le Chat, Claude…).
// 1. le site prépare une demande complète (contexte du document, référentiel, format de réponse imposé) à copier ;
// 2. l'enseignant la colle dans son IA, puis colle la réponse ici ;
// 3. le site lit la réponse, montre ce qu'il a compris (une case à cocher par élément) et ne remplit qu'après validation.
// Le site n'envoie rien à aucune IA ; les demandes ne contiennent jamais de données d'élèves (noms, notes, appréciations).
//
// Une page déclare un assistant avec boutonIA({ titre, demande: async () => texte, format, lire(blocs) → { items, data },
//   appliquer: async (data, coches, remplacer) → message }) ; items = [{ cle, titre, detail }] (cases à cocher).
import { h, vider, toast, erreur, fenetre } from './ui.js';

export const IAS = [
  ['ChatGPT', 'https://chatgpt.com/'], ['Le Chat (Mistral)', 'https://chat.mistral.ai/'], ['Claude', 'https://claude.ai/new'],
  ['Copilot', 'https://copilot.microsoft.com/'], ['Gemini', 'https://gemini.google.com/'],
];
const CLE_IA = 'pilotage-scbh-ia-preferee';
const lireL = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrireL = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sans stockage */ } };
export const sansAccent = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => sansAccent(String(t).replace(/\([^)]*\)/g, ' ')).replace(/[^a-z0-9]+/g, ' ').trim();

const PREAMBULE = 'Tu es un assistant pédagogique. Tu aides un enseignant de BTS « Systèmes constructifs bois et habitat » (SCBH, lycée, '
  + 'classes d’étudiants scolaires et d’apprentis) à rédiger ses documents de préparation. Réponds en français, avec un vocabulaire professionnel précis, '
  + 'concret et réaliste (construction bois, charpente, ossature, enveloppe, chantier, bureau d’études). Utilise uniquement les codes du référentiel donnés, sans en inventer.';

// ------------------------------------------------------------------------------------------- outils pour les pages
export const listeCompetences = (ref) => ref.competences.map((c) => `${c.code} : ${c.libelle}`).join('\n');
export const listeSavoirs = (ref) => ref.savoirs.map((s) => `${s.code} : ${s.libelle}`).join('\n');
export const resume = (t, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// écrire la valeur proposée ? (champ vide, ou « remplacer » coché)
export const aEcrire = (actuel, nouveau, remplacer) => !!String(nouveau ?? '').trim() && (remplacer || !String(actuel ?? '').trim());
// « 4 », « 4 h », « 2h30 », « 45 min », « 1,5 » → nombre d'heures
export function nombreDe(v) {
  const s = String(v ?? '').toLowerCase().replace(',', '.');
  const hm = s.match(/(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})?/);
  if (hm) return Number(hm[1]) + (hm[2] ? Number(hm[2]) / 60 : 0);
  const mn = s.match(/(\d+)\s*min/); if (mn) return Math.round(Number(mn[1]) / 60 * 100) / 100;
  const n = parseFloat(s); return Number.isFinite(n) ? n : null;
}
// liste à puces normalisée : une ligne par élément, « - » devant
export const enListe = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•–]+|\d+[.)])\s*/, '').trim()).filter(Boolean).map((l) => '- ' + l).join('\n');
// codes connus (compétences, savoirs…) cités dans un texte, dans l'ordre du référentiel
export function codesDans(texte, codes) {
  const t = ' ' + String(texte || '').replace(/[,;()[\]]/g, ' ').replace(/\.(?=\s|$)/g, ' ') + ' ';
  return codes.filter((c) => new RegExp(`[\\s/]${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/])`, 'i').test(t));
}

// ------------------------------------------------------------------------------------------- lecture de la réponse
// blocs « === NOM === » (variantes acceptées : « ### NOM », « **NOM** », « [NOM] », avec un numéro) → [{ nom, corps }]
export function lireBlocs(texte) {
  const lignes = String(texte || '').replace(/\r/g, '').replace(/^\s*```[a-z]*\s*$/gim, '').split('\n');
  const out = []; let cur = null;
  for (const l of lignes) {
    const deco = l.replace(/[#=*_[\]`>]/g, ' ').trim();
    const m = deco.match(/^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' ]{1,30}?)(?:\s+N?°?\s*\d+)?\s*$/);
    if (m && /[#=*[]/.test(l) && !/:\s*\S/.test(l)) { cur = { nom: sansAccent(m[1]).toUpperCase().trim().replace(/\s+/g, '_'), corps: '' }; out.push(cur); continue; }
    if (cur) cur.corps += l + '\n';
  }
  return out.filter((b) => b.nom !== 'FIN');
}
// rubriques « Nom : valeur » d'un bloc (valeur sur plusieurs lignes possible) ; spec : { champ: ['Nom', 'autre nom'…] }
export function champs(corps, spec) {
  const alias = new Map(); for (const [k, l] of Object.entries(spec)) for (const a of l) alias.set(norm(a), k);
  const out = {}; let cur = null;
  for (const l of String(corps || '').split('\n')) {
    const m = l.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?([^:\n]{2,60}?)(?:\*\*)?\s*:\s*(?:\*\*)?\s?(.*)$/);
    if (m && alias.has(norm(m[1]))) { cur = alias.get(norm(m[1])); out[cur] = m[2].replace(/\*\*\s*$/, '').trimEnd(); continue; }
    if (cur) out[cur] += '\n' + l.trimEnd();
  }
  for (const k of Object.keys(out)) { out[k] = out[k].replace(/^\n+|\s+$/g, ''); if (/^(…|\.\.\.|-|—|\(vide\))$/.test(out[k])) out[k] = ''; }
  return out;
}

// ------------------------------------------------------------------------------------------- réponse jointe en fichier
// texte d'un fichier joint (.txt, .md, .csv, .json, .html, .docx, .pdf) ; lu dans le navigateur, rien n'est envoyé
export async function texteFichier(f) {
  const nom = f.name || 'fichier';
  if (f.size > 20 * 1024 * 1024) throw new Error(`« ${nom} » est trop volumineux (20 Mo au maximum).`);
  if (/\.(txt|md|markdown|csv|json|text)$/i.test(nom) || /^text\/plain/.test(f.type)) return f.text();
  if (/\.html?$/i.test(nom)) {
    const d = new DOMParser().parseFromString(await f.text(), 'text/html');
    d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    d.querySelectorAll('li').forEach((li) => li.prepend('- '));
    d.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, pre, tr').forEach((b) => b.append('\n'));
    return d.body.textContent;
  }
  if (/\.docx$/i.test(nom)) {
    const P = await import('./pdf.js?v=20261113'); await P.chargerOutils();
    const zip = await window.JSZip.loadAsync(await f.arrayBuffer());
    const fx = zip.file('word/document.xml'); if (!fx) throw new Error(`« ${nom} » n’est pas un document Word lisible.`);
    const doc = new DOMParser().parseFromString(await fx.async('string'), 'application/xml');
    return [...doc.getElementsByTagName('w:p')].map((par) => {
      const t = [...par.getElementsByTagName('*')].map((e) => (e.tagName === 'w:t' ? e.textContent : e.tagName === 'w:tab' ? ' ' : e.tagName === 'w:br' ? '\n' : '')).join('');
      return par.getElementsByTagName('w:numPr').length && t.trim() ? '- ' + t : t;
    }).join('\n');
  }
  if (/\.pdf$/i.test(nom)) {
    const { ouvrirPdf, textePages } = await import('./ressources.js');
    const pdf = await ouvrirPdf(f);
    return (await textePages(pdf, 1, pdf.numPages)).join('\n');
  }
  if (/\.(doc|odt|rtf|pages)$/i.test(nom)) throw new Error(`« ${nom} » : enregistrez-le d’abord en .docx, .pdf ou .txt (ou copiez son texte).`);
  throw new Error(`« ${nom} » : format non lu. Fichiers acceptés : .txt, .md, .docx, .pdf, .html, .csv, .json.`);
}

// ------------------------------------------------------------------------------------------- fenêtre de l'assistant
export function boutonIA(config, classe = 'btn') {
  return h('button', { class: classe + ' bouton-ia ecran', type: 'button', title: 'Préparer une demande pour l’IA de votre choix (ChatGPT, Le Chat, Claude…), puis remplir avec sa réponse',
    onclick: () => assistantIA(typeof config === 'function' ? config() : config).catch(erreur) }, '🤖 Remplir avec une IA');
}

export async function assistantIA(cfg) {
  const contexte = await cfg.demande();
  const precisions = h('textarea', { class: 'champ zone-ia', rows: 3, placeholder: 'Vos précisions (facultatif) : ex. séance de 4 h en atelier, travail en îlots, chantier fil rouge du collège, public débutant…' });
  const texteDemande = () => `${PREAMBULE}\n\n${contexte}${precisions.value.trim() ? `\n\nPRÉCISIONS DE L’ENSEIGNANT (prioritaires) :\n${precisions.value.trim()}` : ''}\n\n`
    + 'FORMAT DE RÉPONSE OBLIGATOIRE (le site relit ta réponse automatiquement) :\n'
    + '- garde exactement les titres de blocs « === … === » et les noms de rubriques suivis de « : » ;\n'
    + '- remplace les « … » par ton contenu ; pas de tableau ; aucun texte avant ou après ; tu peux mettre toute la réponse dans un bloc de code.\n\n'
    + cfg.format;
  const voir = h('textarea', { class: 'champ zone-ia demande-ia', rows: 9, readonly: true });
  const maj = () => { voir.value = texteDemande(); };
  precisions.addEventListener('input', maj); maj();
  const copier = async () => {
    maj();
    try { await navigator.clipboard.writeText(voir.value); }
    catch { voir.removeAttribute('readonly'); voir.select(); document.execCommand('copy'); voir.setAttribute('readonly', ''); }
    toast('Demande copiée : collez-la dans votre IA (Ctrl+V)');
  };
  const prefere = lireL(CLE_IA, '');
  const liens = h('div', { class: 'liens-ia' }, h('span', { class: 'gris' }, 'Ouvrir mon IA :'),
    IAS.map(([n, u]) => h('a', { class: 'lien-ia' + (n === prefere ? ' prefere' : ''), href: u, target: '_blank', rel: 'noopener', onclick: () => ecrireL(CLE_IA, n) }, n)),
    h('span', { class: 'gris petit' }, 'ou toute autre IA'));

  const reponse = h('textarea', { class: 'champ zone-ia reponse-ia', rows: 7, placeholder: 'Collez ici la réponse complète de l’IA (Ctrl+V), ou joignez le fichier qu’elle a produit…' });
  const remplacer = h('input', { type: 'checkbox' });
  const zoneApercu = h('div', { class: 'apercu-ia' });
  let lu = null, coches = new Set(), attente = null;
  const vide = () => vider(zoneApercu, h('p', { class: 'gris' }, 'Ce que le site a compris de la réponse s’affichera ici, avec une case à cocher par élément.'));
  const lire = () => {
    lu = null;
    if (!reponse.value.trim()) return vide();
    try { lu = cfg.lire(lireBlocs(reponse.value)); } catch (e) { lu = null; vider(zoneApercu, h('p', { class: 'erreur-ia' }, e.message)); return; }
    if (!lu || !lu.items.length) {
      lu = null;
      vider(zoneApercu, h('p', { class: 'erreur-ia' }, 'Réponse non reconnue : vérifiez que toute la réponse a été collée et que l’IA a gardé les titres « === … === ». Sinon, demandez-lui : « Respecte exactement le format demandé ».'));
      return;
    }
    coches = new Set(lu.items.map((x) => x.cle));
    vider(zoneApercu, h('p', { class: 'compte-ia' }, `${lu.items.length} élément(s) reconnu(s) : décochez ceux que vous ne voulez pas.`),
      h('div', { class: 'items-ia' }, lu.items.map((x) => h('label', { class: 'item-ia' },
        h('input', { type: 'checkbox', checked: true, onchange: (e) => (e.target.checked ? coches.add(x.cle) : coches.delete(x.cle)) }),
        h('span', {}, h('b', {}, x.titre), x.detail ? h('small', {}, x.detail) : null)))));
  };
  reponse.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(lire, 250); });
  vide();
  // réponse fournie en fichier (bouton ou glisser-déposer sur la zone)
  const infoFichier = h('span', { class: 'gris petit fichier-ia' });
  const joindre = async (liste) => {
    const fs = [...(liste || [])]; if (!fs.length) return;
    try {
      infoFichier.textContent = '⏳ Lecture…';
      const textes = [];
      for (const f of fs) textes.push((await texteFichier(f)).replace(/\r/g, '').trim());
      const t = textes.filter(Boolean).join('\n\n');
      if (!t) throw new Error('Aucun texte trouvé dans ce fichier (un PDF scanné ne contient pas de texte).');
      reponse.value = reponse.value.trim() ? reponse.value.trimEnd() + '\n\n' + t : t;
      infoFichier.textContent = '📎 ' + fs.map((f) => f.name).join(', ');
      lire();
    } catch (e) { infoFichier.textContent = ''; erreur(e); }
  };
  const choixFichier = h('input', { type: 'file', multiple: true, hidden: true, accept: '.txt,.md,.markdown,.csv,.json,.html,.htm,.docx,.pdf,text/plain',
    onchange: (e) => { joindre(e.target.files); e.target.value = ''; } });
  reponse.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); reponse.classList.add('survol-ia'); } });
  reponse.addEventListener('dragleave', () => reponse.classList.remove('survol-ia'));
  reponse.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); reponse.classList.remove('survol-ia'); joindre(e.dataTransfer.files); });

  await fenetre('🤖  ' + cfg.titre, h('div', { class: 'assistant-ia' },
    h('div', { class: 'etape-ia' }, h('span', { class: 'num-etape' }, '1'), h('div', {},
      h('h3', {}, 'Préparer et copier la demande'), precisions,
      h('div', { class: 'boutons-detail' }, h('button', { class: 'btn principal', type: 'button', onclick: copier }, '📋  Copier la demande'), liens),
      h('details', { class: 'voir-demande' }, h('summary', {}, 'Voir le texte de la demande'), voir))),
    h('div', { class: 'etape-ia' }, h('span', { class: 'num-etape' }, '2'), h('div', {},
      h('h3', {}, 'Coller la réponse de l’IA'), reponse,
      h('div', { class: 'joindre-ia' }, h('button', { class: 'btn petit', type: 'button', onclick: () => choixFichier.click() }, '📎  Joindre un fichier'),
        h('span', { class: 'gris petit' }, 'si l’IA a répondu par un fichier (.docx, .pdf, .txt, .md…) — ou glissez-le sur la zone'), infoFichier, choixFichier))),
    h('div', { class: 'etape-ia' }, h('span', { class: 'num-etape' }, '3'), h('div', {},
      h('h3', {}, 'Vérifier puis remplir'), zoneApercu,
      h('label', { class: 'case remplacer-ia' }, remplacer, ' Remplacer aussi ce qui est déjà rempli (sinon, seules les cases vides sont complétées)'),
      h('p', { class: 'aide' }, '🔒 La demande ne contient aucune donnée d’élève. Relisez toujours la proposition : tout reste modifiable ensuite, et « ↶ Annuler » revient en arrière.')))),
  [{ texte: 'Fermer', valeur: false }, { texte: '✔  Remplir avec les éléments cochés', classe: 'principal', action: async () => {
    if (!lu) { lire(); if (!lu) throw new Error('Collez d’abord une réponse reconnue de l’IA.'); }
    if (!coches.size) throw new Error('Cochez au moins un élément.');
    const msg = await cfg.appliquer(lu.data, coches, remplacer.checked);
    toast(msg || 'Document rempli');
    return true;
  } }], { large: true });
}
