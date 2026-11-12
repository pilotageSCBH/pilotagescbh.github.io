-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour 26 : « MES COURS » FONCTIONNE EXACTEMENT COMME « MA BIBLIOTHÈQUE »
-- Les deux espaces utilisent désormais les mêmes tables (biblio_themes, biblio_livres, biblio_partages) :
-- la colonne « espace » les distingue ('biblio' = Ma bibliothèque, 'cours' = Mes cours).
-- Les documents de Mes cours ont en plus un type (cours, exercice, TD/TP, évaluation, corrigé, ressource, autre).
-- Les dossiers, documents et partages déjà saisis dans « Mes cours » sont repris automatiquement
-- (sommaire, savoirs associés, chemin sur Nuage, lien, image du dossier ; les étiquettes passent dans les notes),
-- et les cours cochés dans les séquençages restent reliés. L'ancienne table « cours » est conservée, sans être utilisée.
--
-- À exécuter UNE fois dans Supabase (après le script 25) : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne reprend pas deux fois les mêmes documents.)
-- =====================================================================================================

alter table public.biblio_themes add column if not exists espace text not null default 'biblio';
alter table public.biblio_livres add column if not exists espace text not null default 'biblio';
alter table public.biblio_livres add column if not exists genre text not null default 'cours';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'biblio_themes_espace') then
    alter table public.biblio_themes add constraint biblio_themes_espace check (espace in ('biblio', 'cours'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'biblio_livres_espace') then
    alter table public.biblio_livres add constraint biblio_livres_espace check (espace in ('biblio', 'cours'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'biblio_livres_genre') then
    alter table public.biblio_livres add constraint biblio_livres_genre check (genre in ('cours', 'exercice', 'tdtp', 'evaluation', 'corrige', 'ressource', 'autre'));
  end if;
end $$;
create index if not exists biblio_themes_espace_i on public.biblio_themes (espace, proprietaire);
create index if not exists biblio_livres_espace_i on public.biblio_livres (espace, proprietaire);

-- contrôles : parent et thème du même enseignant ET du même espace ; pas de thème dans lui-même
create or replace function public.biblio_controle_theme() returns trigger
language plpgsql security definer set search_path = public as $$
declare x bigint; n int := 0;
begin
  if new.parent_id is not null then
    if not exists (select 1 from biblio_themes where id = new.parent_id and proprietaire = new.proprietaire and espace = new.espace) then raise exception 'Dossier parent introuvable.'; end if;
    x := new.parent_id;
    while x is not null and n < 100 loop
      if x = new.id then raise exception 'Un dossier ne peut pas être rangé dans lui-même.'; end if;
      select parent_id into x from biblio_themes where id = x; n := n + 1;
    end loop;
  end if;
  return new;
end $$;
create or replace function public.biblio_controle_livre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.theme_id is not null and not exists (select 1 from biblio_themes where id = new.theme_id and proprietaire = new.proprietaire and espace = new.espace) then
    raise exception 'Dossier introuvable.';
  end if;
  return new;
end $$;
drop trigger if exists biblio_controle on public.biblio_themes;
create trigger biblio_controle before insert or update of parent_id, espace on public.biblio_themes for each row execute function public.biblio_controle_theme();
drop trigger if exists biblio_controle on public.biblio_livres;
create trigger biblio_controle before insert or update of theme_id, espace on public.biblio_livres for each row execute function public.biblio_controle_livre();

-- reprise des anciens dossiers et documents de « Mes cours »
create table if not exists public.cours_migration (
  ancien   bigint primary key,
  nouveau  bigint not null,
  sorte    text not null,              -- 'dossier' ou 'cours'
  relie    boolean not null default false
);
alter table public.cours_migration enable row level security;
revoke all on public.cours_migration from anon, authenticated;

do $$
declare r record; nouveau bigint; nb int;
begin
  if to_regclass('public.cours') is null then return; end if;
  -- dossiers, du haut vers le bas de l'arborescence
  loop
    nb := 0;
    for r in select c.* from public.cours c
             where c.type = 'dossier' and not exists (select 1 from public.cours_migration m where m.ancien = c.id)
               and (c.parent_id is null or exists (select 1 from public.cours_migration m where m.ancien = c.parent_id)
                    or not exists (select 1 from public.cours p where p.id = c.parent_id))
             order by c.ordre, c.id loop
      insert into public.biblio_themes (espace, proprietaire, parent_id, nom, dossier, image, ordre, partage_tous, cree_le)
      values ('cours', r.proprietaire, (select m.nouveau from public.cours_migration m where m.ancien = r.parent_id),
              left(coalesce(nullif(btrim(r.titre), ''), 'Dossier'), 200), left(coalesce(r.chemin, ''), 1000),
              case when length(coalesce(r.image, '')) <= 400000 then coalesce(r.image, '') else '' end, r.ordre, r.partage_tous, r.cree_le)
      returning id into nouveau;
      insert into public.cours_migration (ancien, nouveau, sorte) values (r.id, nouveau, 'dossier');
      nb := nb + 1;
    end loop;
    exit when nb = 0;
  end loop;
  -- documents
  for r in select c.* from public.cours c
           where c.type = 'cours' and not exists (select 1 from public.cours_migration m where m.ancien = c.id)
           order by c.ordre, c.id loop
    insert into public.biblio_livres (espace, proprietaire, theme_id, titre, chemin, lien, sommaire, source, savoirs, notes, genre, ordre, partage_tous, cree_le)
    values ('cours', r.proprietaire, (select m.nouveau from public.cours_migration m where m.ancien = r.parent_id and m.sorte = 'dossier'),
      left(coalesce(nullif(btrim(r.titre), ''), 'Document'), 500), left(coalesce(r.chemin, ''), 1000), left(coalesce(r.lien, ''), 1000),
      coalesce((select jsonb_agg(jsonb_build_object(
                  't', btrim(regexp_replace(l, '^[[:space:]-]*', '')),
                  'p', null,
                  'n', least(4, length(replace(substring(l from '^[[:space:]]*'), E'\t', '  ')) / 2
                               + length(coalesce(substring(regexp_replace(l, '^[[:space:]]*', '') from '^-+'), ''))))
                order by i)
                from unnest(string_to_array(coalesce(r.sommaire, ''), E'\n')) with ordinality u(l, i)
                where btrim(regexp_replace(l, '^[[:space:]-]*', '')) <> ''), '[]'::jsonb),
      'saisi', coalesce(r.savoirs, '{}'),
      left(concat_ws(E'\n',
        case when coalesce(cardinality(r.etiquettes), 0) > 0 then 'Étiquettes : ' || array_to_string(r.etiquettes, ', ') end,
        case when btrim(coalesce(r.mots_cles, '')) <> '' then 'Mots-clés : ' || r.mots_cles end), 5000),
      case when r.genre in ('cours', 'exercice', 'tdtp', 'evaluation', 'corrige', 'ressource', 'autre') then r.genre else 'cours' end,
      r.ordre, r.partage_tous, r.cree_le)
    returning id into nouveau;
    insert into public.cours_migration (ancien, nouveau, sorte) values (r.id, nouveau, 'cours');
  end loop;
  -- partages
  if to_regclass('public.cours_partages') is not null then
    insert into public.biblio_partages (theme_id, livre_id, destinataire)
    select case when m.sorte = 'dossier' then m.nouveau end, case when m.sorte = 'cours' then m.nouveau end, p.destinataire
    from public.cours_partages p join public.cours_migration m on m.ancien = p.cours_id
    on conflict do nothing;
  end if;
  -- cours cochés dans les séquençages : nouveaux numéros (une seule fois par document repris)
  update public.seances s set cours_lies = (
      select jsonb_agg(case when m.nouveau is not null then jsonb_set(e, '{id}', to_jsonb(m.nouveau)) else e end order by i)
      from jsonb_array_elements(s.cours_lies) with ordinality x(e, i)
      left join public.cours_migration m on m.sorte = 'cours' and not m.relie and m.ancien::text = e ->> 'id')
    where jsonb_typeof(s.cours_lies) = 'array' and jsonb_array_length(s.cours_lies) > 0
      and exists (select 1 from jsonb_array_elements(s.cours_lies) e join public.cours_migration m on m.sorte = 'cours' and not m.relie and m.ancien::text = e ->> 'id');
  update public.cours_migration set relie = true where not relie;
end $$;
