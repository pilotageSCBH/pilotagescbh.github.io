// Téléchargement de fichiers et lecture complète des fiches d'une séquence (utilisée pour les PDF).
import { db } from './api.js';

export const FORMAT = 'pilotage-scbh-fiches';

export function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const nomFichier = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.-]+/g, '_').replace(/_+/g, '_');

// ------------------------------------------------------------------------------------------- fichier d'échange
const texteVide = (v) => (v === null || v === undefined ? '' : v);
async function donneesContrat(type, cle, id) {
  const c = (await db.lire('contrats', `type=eq.${type}&${cle}=eq.${id}`))[0];
  if (!c) return null;
  const k = await db.lire('criteres', `contrat_id=eq.${c.id}&order=groupe_ordre,ordre,id`);
  return { forme: c.forme, lieu: c.lieu, organisation: c.organisation, duree: c.duree, date: c.date_eval || '',
    criteres: k.filter((x) => x.actif).map((x) => ({ rubrique: x.groupe, ordre: x.ordre, texte: x.texte, coefficient: Number(x.coefficient) })) };
}
export async function exportSequence(sq) {
  const [seances, fs] = await Promise.all([db.lire('seances', `sequence_id=eq.${sq.id}&order=numero`), db.lire('fiches_sequence', `sequence_id=eq.${sq.id}`)]);
  const fiches = seances.length ? await db.lire('fiches_seance', `seance_id=in.(${seances.map((x) => x.id).join(',')})`) : [];
  const f0 = fs[0] || {};
  return {
    numero: sq.numero, intitule: sq.intitule, objectif: sq.objectif,
    preparation: { activites: texteVide(f0.activites), situation: texteVide(f0.situation), prerequis: texteVide(f0.prerequis),
      modalites: texteVide(f0.modalites), ressources: texteVide(f0.ressources), bilan: texteVide(f0.bilan) },
    contrat_sommatif: await donneesContrat('sommatif', 'sequence_id', sq.id),
    seances: await Promise.all(seances.map(async (x) => {
      const f = fiches.find((y) => y.seance_id === x.id) || {};
      return {
        numero: x.numero,
        sequencage: { titre: x.titre, duree: x.duree, objectif_intermediaire: x.objectif_inter, objectifs_operationnels: x.objectifs_ops,
          cours: x.cours, competences: x.competences, savoirs: x.savoirs, autres_prerequis: x.prerequis_texte || '' },
        fiche: { salle: texteVide(f.salle), prerequis: texteVide(f.prerequis), materiel: texteVide(f.materiel),
          phases: Array.isArray(f.phases) ? f.phases.map((p) => ({ phase: p.phase || '', activite: p.activite || '', enseignant: p.enseignant || '', eleves: p.eleves || '', duree: p.duree || '' })) : [],
          evaluation: texteVide(f.evaluation), differenciation: texteVide(f.differenciation), bilan: texteVide(f.bilan),
          maison_avant: f.maison_avant ?? null, maison_apres: f.maison_apres ?? null },
        contrat_formatif: await donneesContrat('formatif', 'seance_id', x.id),
      };
    })),
  };
}
export const echapper = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
