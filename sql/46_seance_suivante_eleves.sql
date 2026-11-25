-- =====================================================================================================
-- 46 · Espace élève : « Ma semaine » ne montre que les séances passées, celles de la semaine et la séance suivante de
--   chaque matière. Toutes les séances restent visibles dans « Ma formation » et le calendrier, mais le travail
--   préparatoire et le travail à la maison d'une séance placée plus loin que la prochaine séance de sa matière ne sont
--   pas envoyés aux élèves. Une séance qui n'est pas placée dans la progression garde son travail (comme avant).
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run), après le script 32. Relancer ne casse rien.
-- Aucune donnée d'élève dans ce script ; rien n'est modifié dans les tables.
-- =====================================================================================================

-- lundi de la semaine w (0 à 89) d'une promotion qui commence l'année y (même calcul que le site)
create or replace function public.lundi_promo(y int, w int) returns date
language sql immutable as $$
  select make_date(y + w / 45, 9, 1) - (extract(isodow from make_date(y + w / 45, 9, 1))::int - 1) + 7 * (w % 45);
$$;

-- semaine « actuelle » de la promotion (heure de Paris) ; avant, entre ou après les deux années : la plus proche
create or replace function public.semaine_promo(y int) returns int
language plpgsql stable as $$
declare d date := (now() at time zone 'Europe/Paris')::date; k int;
begin
  for a in 0..1 loop
    k := floor((d - public.lundi_promo(y, a * 45)) / 7.0);
    if k between 0 and 44 then return a * 45 + k; end if;
  end loop;
  if d < public.lundi_promo(y, 0) then return 0; end if;
  if d < public.lundi_promo(y, 45) then return 45; end if;
  return 89;
end $$;

-- séances de la promotion p dont le travail est caché aux élèves : placées seulement après la prochaine séance de leur matière
create or replace function public.seances_futures_eleve(p bigint) returns table (seance_id bigint)
language sql stable security definer set search_path = public as $$
  with wc as (select public.semaine_promo(annee_debut) w from promotions where id = p),
  pl as (
    select c.matiere_id, c.semaine, c.seance_id id from progression_cases c where c.promotion_id = p and c.seance_id is not null
    union all
    select c.matiere_id, c.semaine, c.seance2_id from progression_cases c where c.promotion_id = p and c.seance2_id is not null),
  prochaine as (select matiere_id, min(semaine) w from pl, wc where pl.semaine > wc.w group by matiere_id),
  ok as (select pl.id from pl cross join wc left join prochaine n on n.matiere_id = pl.matiere_id
         where pl.semaine <= wc.w or pl.semaine = n.w)
  select distinct pl.id from pl where pl.id not in (select id from ok);
$$;
revoke all on function public.seances_futures_eleve(bigint) from public, anon, authenticated;

-- détail des séances pour l'élève (script 32) : sans le travail à la maison des séances lointaines
create or replace function public.details_seances_eleve(p bigint) returns json
language sql stable security definer set search_path = public as $$
  with futures as (select seance_id from public.seances_futures_eleve(p))
  select coalesce(json_agg(json_build_object(
      'id', x.id,
      'objectifs_ops', x.objectifs_ops,
      'maison_avant', case when x.id in (select seance_id from futures) then null else f.maison_avant end,
      'maison_apres', case when x.id in (select seance_id from futures) then null else f.maison_apres end)), '[]')
  from seances x
  join sequences s on s.id = x.sequence_id and s.promotion_id = p
  left join fiches_seance f on f.seance_id = x.id;
$$;
revoke all on function public.details_seances_eleve(bigint) from public, anon, authenticated;
