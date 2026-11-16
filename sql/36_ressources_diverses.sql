-- =====================================================================================================
-- 36 · Mes ressources → « Mes ressources diverses » : un deuxième espace qui fonctionne exactement comme « Mes cours »
-- (dossiers, fiches, types de documents, partage avec les collègues et les élèves, cours mobilisés des séances,
-- publication automatique, QCM). Ses fichiers sont dans un dossier Nuage à part, avec son propre lien de partage.
-- À exécuter après le script 35. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

-- 1. nouvel espace « divers » dans les tables communes
alter table public.biblio_themes drop constraint if exists biblio_themes_espace;
alter table public.biblio_themes add constraint biblio_themes_espace check (espace in ('biblio', 'cours', 'divers'));
alter table public.biblio_livres drop constraint if exists biblio_livres_espace;
alter table public.biblio_livres add constraint biblio_livres_espace check (espace in ('biblio', 'cours', 'divers'));

-- 2. lien de partage Nuage du dossier « Mes ressources diverses »
alter table public.ressources_reglages add column if not exists lien_divers text not null default '' check (length(lien_divers) <= 1000);

-- 3. publication aux élèves : documents et dossiers de « Mes cours » et de « Mes ressources diverses »
drop policy if exists ecriture on public.publications_eleves;
create policy ecriture on public.publications_eleves for all to authenticated
  using (proprietaire = auth.uid() and public.est_redacteur())
  with check (proprietaire = auth.uid() and public.est_redacteur()
    and (livre_id is null or exists (select 1 from public.biblio_livres l where l.id = livre_id and l.proprietaire = auth.uid() and l.espace in ('cours', 'divers')))
    and (theme_id is null or exists (select 1 from public.biblio_themes t where t.id = theme_id and t.proprietaire = auth.uid() and t.espace in ('cours', 'divers'))));

-- 4. publication automatique des documents mobilisés dans les séances
create or replace function public.cours_auto(p bigint) returns table (livre_id bigint, le timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, min(public.moment_semaine(pr.annee_debut, c.semaine))
  from progression_cases c
  join promotions pr on pr.id = c.promotion_id
  join seances s on s.id = c.seance_id or s.id = c.seance2_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.cours_lies) = 'array' then s.cours_lies else '[]'::jsonb end) e
  join biblio_livres l on l.id = case when (e ->> 'id') ~ '^\d{1,15}$' then (e ->> 'id')::bigint end and l.espace in ('cours', 'divers')
  where c.promotion_id = p
    and coalesce((select g.partage_auto from ressources_reglages g where g.proprietaire = l.proprietaire), true)
  group by l.id;
$$;
revoke all on function public.cours_auto(bigint) from public, anon, authenticated;

create or replace function public.figer_cours(p bigint, w int, cours jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p is null or w is null or cours is null or jsonb_typeof(cours) <> 'array' or jsonb_array_length(cours) = 0 then return; end if;
  if public.moment_semaine((select annee_debut from promotions where id = p), w) > now() then return; end if;
  insert into publications_eleves (proprietaire, livre_id, promotion_id, origine)
  select distinct l.proprietaire, l.id, p, 'auto'
  from jsonb_array_elements(cours) e
  join biblio_livres l on l.id = case when (e ->> 'id') ~ '^\d{1,15}$' then (e ->> 'id')::bigint end and l.espace in ('cours', 'divers')
  where coalesce((select g.partage_auto from ressources_reglages g where g.proprietaire = l.proprietaire), true)
  on conflict (livre_id, promotion_id) where livre_id is not null do nothing;
end $$;
revoke all on function public.figer_cours(bigint, int, jsonb) from public, anon, authenticated;

-- 5. documents visibles des élèves d'une promotion
create or replace function public.livres_publies(p bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  with recursive pub as (select * from publications_eleves where promotion_id = p and (a_partir_de is null or a_partir_de <= current_date)),
  arbre as (
    select t.id from biblio_themes t join pub on pub.theme_id = t.id where t.espace in ('cours', 'divers')
    union
    select t.id from biblio_themes t join arbre a on t.parent_id = a.id where t.espace in ('cours', 'divers'))
  select l.id from biblio_livres l where l.espace in ('cours', 'divers') and (l.id in (select pub.livre_id from pub) or l.theme_id in (select id from arbre))
  union
  select a.livre_id from public.cours_auto(p) a where a.le <= now();
$$;
revoke all on function public.livres_publies(bigint) from public, anon, authenticated;

-- 6. ouverture d'un document par un élève : lien du dossier Nuage de l'espace du document
create or replace function public.eleve_document(jeton text, livre bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; l record; g record;
begin
  e := public.eleve_de_session(jeton);
  if livre not in (select livre_id from public.eleve_livres_visibles(e)) then raise exception 'Document non publié pour votre promotion.'; end if;
  select * into l from biblio_livres where id = livre;
  select * into g from ressources_reglages where proprietaire = l.proprietaire;
  insert into consultations_eleves (eleve_id, quoi, livre_id, titre) values (e, 'document', l.id, left(l.titre, 200));
  return json_build_object('lien', coalesce(case when l.espace = 'biblio' then g.lien_bibliotheque when l.espace = 'divers' then g.lien_divers else g.lien_cours end, ''),
    'chemin', l.chemin, 'lien_direct', l.lien, 'titre', l.titre);
end $$;
revoke all on function public.eleve_document(text, bigint) from public;
grant execute on function public.eleve_document(text, bigint) to anon, authenticated;
