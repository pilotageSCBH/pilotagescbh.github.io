// Ma bibliothèque : bibliothèque personnelle de chaque enseignant (thèmes, ouvrages, sommaires avec les pages).
// Même moteur que « Mes cours » : voir espace.js.
import { pageEspace, ESPACES, oublierEspaces } from './espace.js';

export const pageBibliotheque = pageEspace(ESPACES.biblio);
export const oublierBibliotheque = oublierEspaces;
