// Cahier de textes (Pronote) : texte d'une séance prêt à coller — « Contenu de la séance » et « Travail à faire ».
// Rien n'est envoyé nulle part : le texte est seulement copié dans le presse-papiers.
import { h, toast, fenetre } from './ui.js';

const dateLongue = (v) => (v ? new Date(v + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const lignes = (t) => String(t || '').split(/\n+/).map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim()).filter(Boolean);

// x : séance (avec seq) ; m : matière ; f : fiche de séance (maison_avant / maison_apres) ; code : code de la matière (PR, OR…)
export function texteCahier(x, m, f, code, libSavoir = (k) => k) {
  const c = [];
  c.push(`${m?.nom || ''} · Séance ${x.seq?.numero}.${x.numero} · ${x.titre || ''}`.trim());
  if (x.seq?.intitule) c.push(`Séquence ${x.seq.numero} : ${x.seq.intitule}`);
  if (x.objectif_inter) c.push('', `Objectif : ${x.objectif_inter}`);
  const ops = lignes(x.objectifs_ops);
  if (ops.length) c.push('', 'Objectifs opérationnels :', ...ops.map((l) => `- ${l}`));
  if ((x.savoirs || []).length) c.push('', `Savoirs associés : ${x.savoirs.map(libSavoir).join(' ; ')}`);
  const cours = (x.cours_lies || []).map((k) => k.titre).filter(Boolean);
  if (cours.length) c.push('', `Documents : ${cours.join(' ; ')}`);
  const t = [];
  const apres = f?.maison_apres, avant = f?.maison_avant;
  if (apres) {
    t.push(`Pour le ${dateLongue(apres.echeance) || 'prochain cours'}${apres.duree ? ` (environ ${apres.duree})` : ''} :`);
    t.push(...lignes(apres.consignes));
    if (apres.ressources) t.push('', 'Ressources :', ...lignes(apres.ressources));
    if (apres.rendu) t.push('', `Rendu : ${apres.rendu}`);
  }
  if (avant) {
    if (t.length) t.push('');
    t.push(`Travail préparatoire pour la séance${avant.echeance ? ` du ${dateLongue(avant.echeance)}` : ''}${avant.duree ? ` (environ ${avant.duree})` : ''} :`);
    if (avant.objectif) t.push(avant.objectif);
    t.push(...lignes(avant.consignes));
    if (avant.ressources) t.push('', 'Ressources :', ...lignes(avant.ressources));
  }
  return { contenu: c.join('\n'), travail: t.join('\n'), code };
}

async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); toast('Copié : collez-le dans Pronote (Ctrl + V)'); }
  catch { toast('Copie impossible : sélectionnez le texte et faites Ctrl + C', 'erreur'); }
}

export function ouvrirCahier(x, m, f, code, libSavoir) {
  const { contenu, travail } = texteCahier(x, m, f, code, libSavoir);
  const zone = (titre, texte, vide) => {
    const ta = h('textarea', { class: 'champ texte-cahier', rows: Math.min(14, Math.max(4, texte.split('\n').length + 1)), readonly: true });
    ta.value = texte || vide;
    return h('section', { class: 'bloc-cahier' }, h('div', { class: 'tete-cahier' }, h('h3', {}, titre),
      texte ? h('button', { class: 'btn petit principal', type: 'button', onclick: () => copier(texte) }, '📋 Copier') : null), ta);
  };
  return fenetre(`Cahier de textes · ${code} ${x.seq?.numero}.${x.numero}`, h('div', { class: 'cahier-textes' },
    h('p', { class: 'aide' }, 'Dans Pronote, ouvrez le cahier de textes du cours, puis collez chaque partie dans la bonne case : « Contenu » et « Travail à faire ». Le texte reprend la séance, ses objectifs et la fiche de déroulement (travail à la maison).'),
    zone('Contenu de la séance', contenu, ''),
    zone('Travail à faire', travail, 'Pas de travail à la maison dans la fiche de déroulement de cette séance.')),
  [{ texte: 'Fermer', classe: 'principal', valeur: true }], { large: true });
}
