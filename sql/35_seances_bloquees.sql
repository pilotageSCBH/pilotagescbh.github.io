-- =====================================================================================================
-- 35 · Progression : bloquer une séance à sa date
-- Une séance bloquée ne bouge plus : déplacements, insertions et décalages des autres séances passent autour d'elle.
-- À exécuter après le script 34. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

alter table public.progression_cases add column if not exists bloquee boolean not null default false;
