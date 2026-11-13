-- =====================================================================================================
-- 31 · « Ma bibliothèque » n'est plus partagée avec les élèves (seuls les documents de « Mes cours » le sont)
-- À exécuter après le script 30. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

-- 1. publications d'ouvrages ou de thèmes de la bibliothèque déjà faites : retirées
delete from public.publications_eleves p
where (p.livre_id is not null and exists (select 1 from public.biblio_livres l where l.id = p.livre_id and l.espace <> 'cours'))
   or (p.theme_id is not null and exists (select 1 from public.biblio_themes t where t.id = p.theme_id and t.espace <> 'cours'));

-- 2. publication manuelle : uniquement les documents et dossiers de « Mes cours » de l'enseignant
drop policy if exists ecriture on public.publications_eleves;
create policy ecriture on public.publications_eleves for all to authenticated
  using (proprietaire = auth.uid() and public.est_redacteur())
  with check (proprietaire = auth.uid() and public.est_redacteur()
    and (livre_id is null or exists (select 1 from public.biblio_livres l where l.id = livre_id and l.proprietaire = auth.uid() and l.espace = 'cours'))
    and (theme_id is null or exists (select 1 from public.biblio_themes t where t.id = theme_id and t.proprietaire = auth.uid() and t.espace = 'cours')));

-- 3. documents visibles des élèves : « Mes cours » seulement (publiés à la main ou automatiquement par la progression)
create or replace function public.livres_publies(p bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  with recursive pub as (select * from publications_eleves where promotion_id = p and (a_partir_de is null or a_partir_de <= current_date)),
  arbre as (
    select t.id from biblio_themes t join pub on pub.theme_id = t.id where t.espace = 'cours'
    union
    select t.id from biblio_themes t join arbre a on t.parent_id = a.id where t.espace = 'cours')
  select l.id from biblio_livres l where l.espace = 'cours' and (l.id in (select pub.livre_id from pub) or l.theme_id in (select id from arbre))
  union
  select a.livre_id from public.cours_auto(p) a where a.le <= now();
$$;
revoke all on function public.livres_publies(bigint) from public, anon, authenticated;
