-- =====================================================================================================
-- 45 · Ressources qui ne sont plus partagées sur Nuage : elles ne s'affichent plus sur le site.
--   - biblio_livres.absent_nuage : le fichier n'est plus dans le dossier partagé (supprimé, déplacé, retiré du partage) ;
--   - ressources_reglages.coupes : espaces ('biblio', 'cours', 'divers') dont le lien de partage ne fonctionne plus
--     (partage supprimé, expiré ou protégé par mot de passe).
-- Le site de l'enseignant vérifie son Nuage à la connexion et à l'ouverture de « Mes ressources » et met ces repères
-- à jour. Rien n'est supprimé : une ressource à nouveau partagée réapparaît. Les élèves ne voient jamais une
-- ressource masquée. À exécuter une fois dans Supabase (SQL Editor → New query → Run). Relancer ne casse rien.
-- =====================================================================================================

alter table public.biblio_livres add column if not exists absent_nuage boolean not null default false;
alter table public.ressources_reglages add column if not exists coupes text[] not null default '{}';

-- documents visibles des élèves d'une promotion : sans les ressources masquées (même définition que le script 36,
-- avec ce filtre en plus)
create or replace function public.livres_publies(p bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  with recursive pub as (select * from publications_eleves where promotion_id = p and (a_partir_de is null or a_partir_de <= current_date)),
  arbre as (
    select t.id from biblio_themes t join pub on pub.theme_id = t.id where t.espace in ('cours', 'divers')
    union
    select t.id from biblio_themes t join arbre a on t.parent_id = a.id where t.espace in ('cours', 'divers')),
  tous as (
    select l.id from biblio_livres l where l.espace in ('cours', 'divers') and (l.id in (select pub.livre_id from pub) or l.theme_id in (select id from arbre))
    union
    select a.livre_id from public.cours_auto(p) a where a.le <= now())
  select l.id from tous t join biblio_livres l on l.id = t.id
  where not l.absent_nuage
    and not exists (select 1 from ressources_reglages g where g.proprietaire = l.proprietaire and l.espace = any (g.coupes));
$$;
revoke all on function public.livres_publies(bigint) from public, anon, authenticated;
