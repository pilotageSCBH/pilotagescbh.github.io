-- =====================================================================================================
-- 34 · Espace élève : « Mes cours » rangés par matière
-- À exécuter après le script 33. Peut être exécuté plusieurs fois sans risque.
-- Aucune donnée d'élève dans ce script ; rien n'est modifié dans les tables.
-- Un document est rangé dans la matière des séances qui le mobilisent ; à défaut, dans la ou les matières
-- de l'enseignant qui l'a publié (c'est ce que renvoient ces fonctions).
-- =====================================================================================================

-- documents visibles de la promotion p : matières enseignées par leur auteur
create or replace function public.matieres_documents_eleve(p bigint) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', l.id,
      'matieres', coalesce((select array_agg(distinct m) from enseignants e, unnest(e.matieres) m where e.profil_id = l.proprietaire), '{}'))), '[]')
  from biblio_livres l
  where l.id in (select livre_id from public.livres_publies(p));
$$;
revoke all on function public.matieres_documents_eleve(bigint) from public, anon, authenticated;

-- élève connecté : sa promotion
create or replace function public.eleve_matieres_documents(jeton text) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; p bigint;
begin
  e := public.eleve_de_session(jeton);
  select promotion_id into p from eleves where id = e;
  return public.matieres_documents_eleve(p);
end $$;
revoke all on function public.eleve_matieres_documents(text) from public;
grant execute on function public.eleve_matieres_documents(text) to anon, authenticated;

-- aperçu enseignant (élève fictif)
create or replace function public.apercu_matieres_documents(p bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  return public.matieres_documents_eleve(p);
end $$;
revoke all on function public.apercu_matieres_documents(bigint) from public, anon;
grant execute on function public.apercu_matieres_documents(bigint) to authenticated;
