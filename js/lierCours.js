// Cours cités en texte dans « Cours mobilisés » (saisie libre, import Excel…) reliés automatiquement au document
// correspondant de « Mes cours » (les vôtres et ceux partagés avec vous) : une fois relié, le document est partagé
// automatiquement avec les élèves de la promotion (comme un cours coché avec « ＋ depuis mes cours »).
// Correspondance sûre seulement : même code (A1 = A01) et titres proches, ou titre identique. Sinon, rien n'est relié.
import { db } from './api.js';
import { chargerReglages, masqueeNuage } from './ressources.js';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\.(pdf|docx?|pptx?|xlsx?|odt|html?)$/i, '').replace(/\((verifie|nv|v\d+|version[^)]*)\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
// « A01 - L'entreprise », « A1 – Entreprise et cadre juridique » → { code: 'a1', mots }
const VIDES = new Set(['le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'et', 'en', 'a', 'au', 'aux', 'un', 'une', 'sur', 'pour', 'par', 'dans']);
function analyser(t) {
  const n = norm(t);
  const m = n.match(/^([a-z])\s?0*(\d{1,2})\b\s*(.*)$/);
  const reste = m ? m[3] : n;
  return { code: m ? m[1] + Number(m[2]) : null, titre: reste, mots: new Set(reste.split(' ').filter((w) => w.length > 2 && !VIDES.has(w))) };
}
const proches = (a, b) => {
  if (!a.mots.size || !b.mots.size) return 0;
  let n = 0; for (const w of a.mots) if (b.mots.has(w) || [...b.mots].some((x) => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) n++;
  return n / Math.min(a.mots.size, b.mots.size);
};
export function trouver(ligne, docs) {
  const a = analyser(ligne); if (!a.titre && !a.code) return null;
  const candidats = docs.map((d) => ({ d, b: analyser(d.titre) })).map(({ d, b }) => {
    if (a.titre && a.titre === b.titre && (!a.code || !b.code || a.code === b.code)) return { d, s: 3 };
    if (a.code && b.code && a.code === b.code) { const p = proches(a, b); return { d, s: p >= 0.34 || !a.mots.size ? 2 + p : 0 }; }
    const p = proches(a, b);   // codes différents (renumérotation) : titres presque identiques seulement
    return { d, s: a.mots.size >= 2 && b.mots.size >= 2 && p >= 0.8 ? 2 + p / 2 : 0 };
  }).filter((x) => x.s >= 2).sort((x, y) => y.s - x.s);
  if (!candidats.length || (candidats[1] && candidats[1].s === candidats[0].s && candidats[1].d.id !== candidats[0].d.id)) return null;   // ambigu : on ne relie pas
  return candidats[0].d;
}

// relie les cours cités dans les séances (de la promotion affichée) ; renvoie le nombre de cours reliés
export async function lierCoursCites(seances, ref) {
  const avecTexte = seances.filter((x) => String(x.cours || '').trim());
  if (!avecTexte.length) return 0;
  await chargerReglages().catch(() => null);
  const docs = (await db.lire('biblio_livres', 'espace=eq.cours&order=ordre,id')).filter((l) => !masqueeNuage(l));
  if (!docs.length) return 0;
  const rang = ref.savoirs.map((y) => y.code);
  let n = 0;
  for (const x of avecTexte) {
    const lignes = String(x.cours).replace(/\r/g, '').split('\n');
    const lies = [...(x.cours_lies || [])];
    let sav = [...(x.savoirs || [])], reste = [], ajout = 0;
    for (const ligne of lignes) {
      const t = ligne.replace(/^\s*[-•*]\s*/, '').trim();
      const d = t ? trouver(t, docs) : null;
      if (!d) { reste.push(ligne); continue; }
      if (!lies.some((c) => c.id === d.id)) {
        const savoirs = d.savoirs || [], ajoutes = [];
        for (const c of savoirs) if (!sav.includes(c)) { sav.push(c); ajoutes.push(c); }
        lies.push({ id: d.id, titre: d.titre, savoirs, ajoutes, lien: d.lien || '', genre: d.genre || 'cours', espace: 'cours' });
        ajout++;
      }
    }
    if (!ajout && reste.length === lignes.length) continue;
    sav.sort((a, b) => rang.indexOf(a) - rang.indexOf(b));
    const cours = reste.join('\n').trim();
    try { await db.modifier('seances', x.id, { cours_lies: lies, savoirs: sav, cours }); Object.assign(x, { cours_lies: lies, savoirs: sav, cours }); n += ajout; }
    catch { /* séance d'une matière que l'on n'enseigne pas, ou droit refusé : ignorée */ }
  }
  return n;
}
