-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : COUVERTURE DES COMPÉTENCES ET DES SAVOIRS
-- Pour chaque promotion et chaque matière : compétences et savoirs « prévus » (cochés) ; le « traité » est calculé
-- à partir des séances du séquençage. La fin du script reprend les coches du classeur Excel (promotion 2026-2028).
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne remplace aucune saisie.)
-- =====================================================================================================

create table if not exists public.couverture (
  promotion_id bigint not null references public.promotions (id) on delete cascade,
  matiere_id   bigint not null references public.matieres (id) on delete cascade,
  type         text   not null check (type in ('competence', 'savoir')),
  code         text   not null,
  primary key (promotion_id, matiere_id, type, code)
);
alter table public.couverture enable row level security;
revoke all on public.couverture from anon;
grant select, insert, update, delete on public.couverture to authenticated;
drop policy if exists lecture on public.couverture;
drop policy if exists ecriture on public.couverture;
create policy lecture on public.couverture for select to authenticated using (public.est_actif());
create policy ecriture on public.couverture for all to authenticated using (public.peut_matiere(matiere_id)) with check (public.peut_matiere(matiere_id));

-- ------------------------------------------------------------------------------------------- reprise du classeur Excel
do $$
declare p bigint := (select id from public.promotions where annee_debut = 2026);
begin
  if p is null or exists (select 1 from public.couverture where promotion_id = p) then return; end if;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C1-4c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-1a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-1b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-1c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-2a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-2b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-3a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-3b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-4a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C2-4b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-2a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-2b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-2c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-2d') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-2e') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-4a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-4b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-4c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C3-4d') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-2a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-2b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-3a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-3b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-4a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-4b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-4c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-4d') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C4-4e') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-1a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-1b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-1c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-2a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-2b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-2c') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-2d') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C5-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C6a') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'competence', 'C6b') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-5') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-6') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-7') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-8') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-9') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-10') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-11') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-12') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S21-13') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S22-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S22-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S22-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S22-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S23-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S23-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S23-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S24-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S24-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S24-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S24-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S24-5') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S25-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S25-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S25-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-5') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-6') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S26-7') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-1') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-2') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-3') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-5') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-6') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-7') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S31-8') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S32-4') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S32-5') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S41') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S42') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S43') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S51') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S52') on conflict do nothing;
  insert into public.couverture (promotion_id, matiere_id, type, code) values (p, (select id from public.matieres where ordre = 3), 'savoir', 'S53') on conflict do nothing;
end $$;
