-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : FICHE ÉLÈVE ET LIVRET DE COMPÉTENCES — APPRÉCIATIONS
-- Une appréciation par élève et par matière (rédigée par les enseignants de la matière), et une appréciation
-- générale (matière 0, rédigée par tout enseignant). Elles figurent sur la fiche élève et dans son PDF.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune saisie.)
-- =====================================================================================================

create table if not exists public.appreciations (
  eleve_id   bigint not null references public.eleves (id) on delete cascade,
  matiere_id bigint not null default 0,                     -- 0 = appréciation générale
  texte      text not null default '',
  maj_le     timestamptz not null default now(),
  maj_par    uuid default auth.uid(),
  primary key (eleve_id, matiere_id)
);
drop trigger if exists trace_maj on public.appreciations;
create trigger trace_maj before update on public.appreciations for each row execute function public.trace_maj();
alter table public.appreciations enable row level security;
revoke all on public.appreciations from anon;
grant select, insert, update, delete on public.appreciations to authenticated;
drop policy if exists lecture on public.appreciations;
drop policy if exists ecriture on public.appreciations;
create policy lecture on public.appreciations for select to authenticated using (public.est_actif());
create policy ecriture on public.appreciations for all to authenticated
  using (case when matiere_id = 0 then public.est_redacteur() else public.peut_matiere(matiere_id) end)
  with check (case when matiere_id = 0 then public.est_redacteur() else public.peut_matiere(matiere_id) end);
