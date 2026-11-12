// Mes cours : cours, exercices, TD/TP, évaluations, corrigés, ressources de chaque enseignant.
// Fonctionne exactement comme « Ma bibliothèque » (même moteur : voir espace.js) ; chaque document a en plus un type.
import { pageEspace, ESPACES } from './espace.js';

export { GENRES, iconeDoc, genreDepuisNom, lireWord } from './espace.js';
export const pageCours = pageEspace(ESPACES.cours);
