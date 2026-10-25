-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : PARTAGE DES CONTENUS PAR MATIÈRE
--   - pour chaque matière, ses enseignants choisissent qui peut consulter le détail de ses contenus
--     (séquençage, fiches de préparation et de déroulement, contrats) : tous les enseignants, personne,
--     ou seulement les enseignants choisis ;
--   - par défaut (aucun réglage) : partagé avec tous ;
--   - les enseignants de la matière et l'administrateur voient toujours tout ;
--   - la progression, la couverture et la validation des compétences restent communes (numéros et titres
--     des séances, résultats) ; le contenu des fiches et l'historique de ces fiches sont protégés par la base.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucun réglage.)
-- =====================================================================================================

create table if not exists public.partages (
  matiere_id bigint primary key references public.matieres (id) on delete cascade,
  mode       text   not null default 'tous' check (mode in ('tous', 'aucun', 'choisis')),
  lecteurs   bigint[] not null default '{}',          -- enseignants (id) autorisés quand mode = 'choisis'
  maj_le     timestamptz not null default now(),
  maj_par    uuid default auth.uid()
);
drop trigger if exists trace_maj on public.partages;
create trigger trace_maj before update on public.partages for each row execute function public.trace_maj();

-- enseignant (fiche « équipe ») de l'utilisateur connecté
create or replace function public.mon_enseignant() returns bigint
language sql stable security definer set search_path = public as $$
  select id from enseignants where profil_id = auth.uid() order by id limit 1;
$$;

-- l'utilisateur connecté peut-il consulter le détail des contenus de la matière m ?
create or replace function public.voit_matiere(m bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_actif() and (
    public.est_admin()
    or exists (select 1 from enseignants e where e.profil_id = auth.uid() and m = any (e.matieres))
    or coalesce((select p.mode = 'tous' or (p.mode = 'choisis' and public.mon_enseignant() = any (p.lecteurs))
                 from partages p where p.matiere_id = m), true));
$$;
create or replace function public.voit_sequence(s bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.voit_matiere((select matiere_id from sequences where id = s)), false);
$$;
create or replace function public.voit_seance(x bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.voit_sequence((select sequence_id from seances where id = x));
$$;

-- droits : lecture pour tous les comptes actifs, modification par les enseignants de la matière (ou l'administrateur)
alter table public.partages enable row level security;
revoke all on public.partages from anon;
grant select, insert, update, delete on public.partages to authenticated;
drop policy if exists lecture on public.partages;
drop policy if exists ecriture on public.partages;
create policy lecture on public.partages for select to authenticated using (public.est_actif());
create policy ecriture on public.partages for all to authenticated
  using (public.est_admin() or public.enseigne_matiere(matiere_id))
  with check (public.est_admin() or public.enseigne_matiere(matiere_id));

-- fiches de préparation et de déroulement : lecture selon le partage de la matière
drop policy if exists lecture on public.fiches_sequence;
create policy lecture on public.fiches_sequence for select to authenticated using (public.voit_sequence(sequence_id));
drop policy if exists lecture on public.fiches_seance;
create policy lecture on public.fiches_seance for select to authenticated using (public.voit_seance(seance_id));

-- historique : les modifications des fiches et des contrats d'une matière non partagée ne sont pas visibles
drop policy if exists lecture on public.journal;
create policy lecture on public.journal for select to authenticated using (
  public.est_actif() and (
    matiere_id is null
    or table_nom not in ('fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'sequences', 'seances')
    or public.voit_matiere(matiere_id)));

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
