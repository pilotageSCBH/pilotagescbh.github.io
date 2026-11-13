-- =====================================================================================================
-- 32 · Espace élève : détail des séances (objectifs opérationnels, travail préparatoire, travail à la maison)
-- À exécuter après le script 31. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script ; rien n'est modifié dans les tables.
-- =====================================================================================================

-- séances de la promotion p : seulement ce qui sert à l'élève (pas le déroulement ni le bilan de l'enseignant)
create or replace function public.details_seances_eleve(p bigint) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'id', x.id,
      'objectifs_ops', x.objectifs_ops,
      'maison_avant', f.maison_avant,
      'maison_apres', f.maison_apres)), '[]')
  from seances x
  join sequences s on s.id = x.sequence_id and s.promotion_id = p
  left join fiches_seance f on f.seance_id = x.id;
$$;
revoke all on function public.details_seances_eleve(bigint) from public, anon, authenticated;

-- élève connecté : sa promotion
create or replace function public.eleve_details_seances(jeton text) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; p bigint;
begin
  e := public.eleve_de_session(jeton);
  select promotion_id into p from eleves where id = e;
  return public.details_seances_eleve(p);
end $$;
revoke all on function public.eleve_details_seances(text) from public;
grant execute on function public.eleve_details_seances(text) to anon, authenticated;

-- aperçu enseignant (élève fictif)
create or replace function public.apercu_details_seances(p bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  return public.details_seances_eleve(p);
end $$;
revoke all on function public.apercu_details_seances(bigint) from public, anon;
grant execute on function public.apercu_details_seances(bigint) to authenticated;
