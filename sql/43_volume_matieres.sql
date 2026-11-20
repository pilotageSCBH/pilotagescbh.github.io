-- =====================================================================================================
-- 43 · Volume horaire prévu par matière (sur toute la formation), comparé au total des séances du séquençage.
-- Réglable par les enseignants de la matière et l'administrateur. À exécuter une fois dans Supabase
-- (SQL Editor → New query → Run). Relancer le script ne casse rien. Aucune donnée d'élève.
-- =====================================================================================================

alter table public.matieres add column if not exists volume numeric check (volume is null or (volume >= 0 and volume <= 2000));

create or replace function public.regler_volume(m bigint, h numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.peut_matiere(m) then raise exception 'Seuls les enseignants de cette matière peuvent régler son volume.'; end if;
  update matieres set volume = h where id = m;
end $$;
revoke all on function public.regler_volume(bigint, numeric) from public, anon;
grant execute on function public.regler_volume(bigint, numeric) to authenticated;
