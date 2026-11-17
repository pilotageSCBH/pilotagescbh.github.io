-- =====================================================================================================
-- 40 · Fiche élève : coordonnées du tuteur en entreprise et enseignant chargé du suivi.
-- La page « Stages et entreprises » du script 39 est abandonnée : ses tables (stages, visites) sont supprimées.
-- À exécuter après le script 39. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script (seulement la structure).
-- =====================================================================================================

-- 1. tuteur et suivi sur la fiche de l'élève (modifiable par l'administrateur, comme le reste de la fiche)
alter table public.eleves add column if not exists tuteur          text not null default '' check (length(tuteur) <= 160);
alter table public.eleves add column if not exists tuteur_fonction text not null default '' check (length(tuteur_fonction) <= 120);
alter table public.eleves add column if not exists tuteur_tel      text not null default '' check (length(tuteur_tel) <= 40);
alter table public.eleves add column if not exists tuteur_mail     text not null default '' check (length(tuteur_mail) <= 160);
alter table public.eleves add column if not exists suivi_par       uuid;     -- enseignant chargé du suivi (profil)

-- 2. « Stages et entreprises » supprimé
drop table if exists public.visites;
drop table if exists public.stages;

-- 3. sauvegarde complète : liste des tables sans stages ni visites
create or replace function public.tables_sauvegarde() returns text[] language sql immutable as $$
  select array['activites', 'taches', 'competences', 'savoirs', 'durees', 'matieres', 'enseignants', 'promotions', 'eleves',
               'sequences', 'seances', 'progression_semaines', 'progression_jours', 'progression_cases', 'couverture',
               'fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'notes', 'commentaires', 'evaluations', 'resultats', 'appreciations',
               'cours', 'cours_partages', 'ressources_reglages', 'biblio_themes', 'biblio_livres', 'biblio_partages',
               'comptes_eleves', 'publications_eleves', 'qcm', 'qcm_partages', 'qcm_dossiers_partages', 'qcm_sessions', 'qcm_reponses',
               'seances_realisees', 'competences_manuelles', 'epreuves', 'annonces'];
$$;
