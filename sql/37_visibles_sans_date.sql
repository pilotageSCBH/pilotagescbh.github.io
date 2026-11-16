-- =====================================================================================================
-- 37 · Espace élèves : un document mobilisé dans le séquençage est visible des élèves TOUT DE SUITE, sans date
-- (avant : le lundi de la semaine où la séance était placée dans la progression).
-- Il suffit qu'il soit coché comme cours mobilisé d'une séance d'une séquence de la promotion.
-- Décoché de toutes les séances, il n'est plus visible (sauf s'il est aussi publié à la main).
-- Les documents déjà publiés automatiquement par l'ancien système deviennent des publications manuelles :
-- ils restent visibles et l'enseignant peut les retirer avec « 👁 Choisir pour les élèves ».
-- Le réglage « partage_auto » (⚙ Réglages Nuage) reste respecté.
-- À exécuter après le script 36. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

-- 1. plus de « gel » lié aux dates de la progression
drop trigger if exists figer_cours on public.progression_cases;
drop trigger if exists figer_cours on public.seances;
update public.publications_eleves set origine = 'manuel' where origine = 'auto';

-- 2. documents mobilisés dans le séquençage d'une promotion : visibles dès maintenant
create or replace function public.cours_auto(p bigint) returns table (livre_id bigint, le timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, '2000-01-01'::timestamptz
  from sequences q
  join seances s on s.sequence_id = q.id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.cours_lies) = 'array' then s.cours_lies else '[]'::jsonb end) e
  join biblio_livres l on l.id = case when (e ->> 'id') ~ '^\d{1,15}$' then (e ->> 'id')::bigint end and l.espace in ('cours', 'divers')
  where q.promotion_id = p
    and coalesce((select g.partage_auto from ressources_reglages g where g.proprietaire = l.proprietaire), true)
  group by l.id;
$$;
revoke all on function public.cours_auto(bigint) from public, anon, authenticated;
