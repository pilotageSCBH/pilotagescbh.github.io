// Bouton « Annuler » des pages à remplir : annule les dernières modifications de l'utilisateur connecté sur la page
// (une opération à la fois : un déplacement de séance, une suppression de séquence… comptent pour une seule).
// L'annulation s'appuie sur l'historique : une valeur modifiée depuis par un collègue n'est pas écrasée.
import { db, MODIFICATION } from './api.js';
import { h, toast, erreur } from './ui.js';

// tables concernées par chaque page
export const TABLES = {
  sequencage: ['sequences', 'seances'],
  progression: ['progression_cases', 'progression_semaines', 'progression_jours'],
  fiches: ['fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'notes'],
  couverture: ['couverture'],
  eleves: ['eleves'],
  resultats: ['evaluations', 'resultats', 'contrats'],
};

// « Progression · semaine 5 » / « jour 37 » (rangs dans le calendrier de la promotion) → date lisible
export function contexteLisible(promo, c) {
  const Y = promo.annee_debut;
  const lundi = (w) => { const d = new Date(Y + Math.floor(w / 45), 8, 1); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (w % 45)); return d; };
  return String(c || '')
    .replace(/semaine (\d+)$/, (_, w) => 'semaine du ' + lundi(Number(w)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))
    .replace(/jour (\d+)$/, (_, j) => { const d = lundi(Math.floor(j / 7)); d.setDate(d.getDate() + (j % 7)); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); });
}

// attendre la fin des enregistrements automatiques en cours (champ quitté juste avant le clic)
async function finEnregistrements() {
  for (let i = 0; i < 40 && document.querySelector('.champ.envoi'); i++) await new Promise((r) => setTimeout(r, 100));
}

export function boutonAnnuler(ctx, page) {
  if (!ctx.peutEcrire()) return null;
  const tables = TABLES[page];
  const b = h('button', { class: 'btn annuler', type: 'button', disabled: true, title: 'Aucune modification à annuler' }, '↶  Annuler');
  const derniere = () => db.lire('journal', `qui=eq.${ctx.profil.id}&promotion_id=eq.${ctx.promo.id}&table_nom=in.(${tables.join(',')})`
    + '&annule=is.false&annulation=is.false&order=id.desc&limit=1');
  const maj = async () => {
    try {
      const [d] = await derniere();
      b.disabled = !d;
      b.title = d ? `Annuler ma dernière modification : ${contexteLisible(ctx.promo, d.contexte)}` : 'Aucune modification à annuler sur cette page';
    } catch { b.disabled = true; }
  };
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await finEnregistrements();
      const r = await db.rpc('annuler', { promo: ctx.promo.id, tables });
      if (!r) { toast('Rien à annuler'); return maj(); }
      toast('Annulé : ' + contexteLisible(ctx.promo, r.contexte));
      await ctx.recharger();
    } catch (e) { erreur(e); maj(); }
  });
  // après chaque enregistrement de la page, le bouton se met à jour (tant qu'il est affiché)
  let attente = null, vu = false;
  const ecoute = () => {
    if (b.isConnected) vu = true;
    else if (vu) { window.removeEventListener(MODIFICATION, ecoute); return; }
    clearTimeout(attente); attente = setTimeout(maj, 400);
  };
  window.addEventListener(MODIFICATION, ecoute);
  maj();
  return b;
}
