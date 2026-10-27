// Fichiers téléchargés depuis « Fiches et contrats » :
//  - documents Word (fiches et contrats d'une séance ou de toute une séquence) ;
//  - fichier d'échange (.json) d'une séquence ou d'une matière, à compléter puis à réimporter.
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
export const enTeteEchange = (ctx, m, promo) => ({
  format: FORMAT, version: 1, exporte_le: new Date().toISOString(), promotion: promo, matiere: m.nom,
  mode_d_emploi: "Fichier d'échange des fiches et contrats. À compléter ou modifier : « preparation », « fiche » (phases, travail à la maison maison_avant / maison_apres…), "
    + "« contrat_sommatif » et « contrat_formatif » (critères : rubrique = compétence ou objectif, ordre, texte, coefficient). Les blocs « sequencage » sont donnés pour information : "
    + "ils ne sont pas importés (ils se modifient dans le séquençage). Les séances sont retrouvées par leur numéro ; les notes des élèves ne sont jamais touchées. "
    + 'Puis : Fiches et contrats → « ⬆ Importer ».',
});

// ------------------------------------------------------------------------------------------- document Word
// (page HTML lue par Word : se modifie et s'enregistre ensuite en .docx ou en PDF)
export function documentWord(titre, sections) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${echapper(titre)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Portrait { size: 595.3pt 841.9pt; margin: 1.6cm 1.6cm 1.6cm 1.6cm; }
@page Paysage { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 1.4cm 1.4cm 1.4cm 1.4cm; }
div.Portrait { page: Portrait; } div.Paysage { page: Paysage; }
body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #1F2D2B; }
h1 { font-size: 16pt; color: #146B63; margin: 0 0 2pt; } h2.sous { font-size: 12pt; color: #7A4FA0; margin: 0 0 8pt; font-weight: bold; }
h3 { font-size: 10pt; color: #fff; background: #146B63; margin: 10pt 0 0; padding: 3pt 6pt; text-transform: uppercase; }
p { margin: 0; } .bloc { border: 1px solid #C9D2D0; border-top: 0; padding: 5pt 7pt; white-space: pre-wrap; }
table { border-collapse: collapse; width: 100%; margin-top: 4pt; } td, th { border: 1px solid #A9B5B2; padding: 3pt 5pt; vertical-align: top; font-size: 9.5pt; }
th { background: #E3F1EF; color: #146B63; text-align: left; } td.lib { background: #E3F1EF; color: #146B63; font-weight: bold; width: 22%; }
.groupe td { background: #1E8F86; color: #fff; font-weight: bold; } .centre { text-align: center; }
.maison { border: 2px solid #E8893A; padding: 4pt 7pt; margin-top: 10pt; } .maison.apres { border-color: #3D84C6; }
.maison h4 { margin: 0 0 4pt; color: #A2561A; font-size: 10.5pt; } .maison.apres h4 { color: #245F96; }
</style></head><body>${sections.map((s, i) => `${i ? '<br clear="all" style="page-break-before:always">' : ''}<div class="${s.paysage ? 'Paysage' : 'Portrait'}">${s.html}</div>`).join('\n')}</body></html>`;
}
export const echapper = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
