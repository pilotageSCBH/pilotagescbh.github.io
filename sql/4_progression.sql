-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : PROGRESSION (calendrier des deux années)
-- Pour chaque promotion : 90 semaines (2 × 45, de la rentrée de septembre à juillet), avec
--   - par semaine : vacances / autres (Vacances, Epreuves, Stage) et apprentis (Présents, PFMP) ;
--   - par jour : un évènement (Férié / pont, Sortie scolaire, Épreuve ou texte libre) ;
--   - par matière et par semaine : la séance (ou un texte libre) et une note.
-- La fin du script reprend la progression du classeur Excel (promotion 2026-2028) si elle est encore vide.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne remplace aucune saisie.)
-- =====================================================================================================

create table if not exists public.progression_semaines (
  promotion_id bigint not null references public.promotions (id) on delete cascade,
  semaine      int    not null check (semaine between 0 and 89),
  vacances     text   not null default '',
  apprentis    text   not null default '',
  primary key (promotion_id, semaine)
);
create table if not exists public.progression_jours (
  promotion_id bigint not null references public.promotions (id) on delete cascade,
  jour         int    not null check (jour between 0 and 629),          -- semaine × 7 + jour (0 = lundi)
  evenement    text   not null default '',
  primary key (promotion_id, jour)
);
create table if not exists public.progression_cases (
  promotion_id bigint not null references public.promotions (id) on delete cascade,
  matiere_id   bigint not null references public.matieres (id) on delete cascade,
  semaine      int    not null check (semaine between 0 and 89),
  seance_id    bigint references public.seances (id) on delete set null,
  texte        text   not null default '',                              -- texte libre à la place d'une séance
  note         text   not null default '',                              -- note de la semaine
  maj_le       timestamptz not null default now(),
  maj_par      uuid default auth.uid(),
  primary key (promotion_id, matiere_id, semaine)
);
create index if not exists progression_cases_seance on public.progression_cases (seance_id);
drop trigger if exists trace_maj on public.progression_cases;
create trigger trace_maj before update on public.progression_cases for each row execute function public.trace_maj();

-- droits : tout compte actif lit ; le calendrier commun (vacances, apprentis, évènements) est modifiable par tous
-- les comptes actifs ; les séances d'une matière par l'administrateur ou les enseignants de cette matière
do $$ declare t text; begin
  foreach t in array array['progression_semaines', 'progression_jours', 'progression_cases'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists lecture on public.%I', t);
    execute format('drop policy if exists ecriture on public.%I', t);
    execute format('create policy lecture on public.%I for select to authenticated using (public.est_actif())', t);
  end loop;
end $$;
create policy ecriture on public.progression_semaines for all to authenticated using (public.est_actif()) with check (public.est_actif());
create policy ecriture on public.progression_jours for all to authenticated using (public.est_actif()) with check (public.est_actif());
create policy ecriture on public.progression_cases for all to authenticated
  using (public.peut_matiere(matiere_id)) with check (public.peut_matiere(matiere_id));

-- ------------------------------------------------------------------------------------------- reprise du classeur Excel
-- progression de la promotion 2026-2028, reprise seulement si rien n'a encore été saisi pour elle
do $$
declare p bigint := (select id from public.promotions where annee_debut = 2026);
begin
  if p is null then return; end if;
  if exists (select 1 from public.progression_semaines where promotion_id = p)
     or exists (select 1 from public.progression_jours where promotion_id = p)
     or exists (select 1 from public.progression_cases where promotion_id = p) then return; end if;
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 0, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 1, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 2, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 3, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 4, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 5, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 6, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 7, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 8, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 9, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 10, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 11, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 12, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 13, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 14, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 15, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 16, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 17, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 18, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 19, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 20, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 21, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 22, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 23, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 24, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 25, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 26, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 27, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 28, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 29, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 30, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 31, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 32, '', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 33, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 34, 'Vacances', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 35, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 36, '', 'Présents');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 37, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 38, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 39, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 40, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 41, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 42, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 43, 'Stage', 'PFMP');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 44, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 53, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 54, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 61, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 62, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 68, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 69, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 78, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 79, 'Vacances', '');
  insert into public.progression_semaines (promotion_id, semaine, vacances, apprentis) values (p, 89, 'Vacances', '');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 18, 'Visite salon Epinal');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 21, 'Démontage stand Epinal');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 24, 'Journée intégration');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 62, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 72, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 116, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 123, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 210, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 243, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 248, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 249, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 250, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 259, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 378, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 432, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 439, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 546, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 560, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 567, 'Férié / pont');
  insert into public.progression_jours (promotion_id, jour, evenement) values (p, 584, 'Férié / pont');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 0, null, '', 'présentation de la formation, évaluation diagnostique');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 1, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 1 and x.numero = 2), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 2, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 1 and x.numero = 3), '', 'intervenant extérieur');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 3, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 1 and x.numero = 4), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 4, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 1 and x.numero = 1), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 5, null, '', 'révisions + évaluation de fin de séquence 1');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 6, null, '', 'séance reportée (remplacement)');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 9, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 2 and x.numero = 1), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 10, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 2 and x.numero = 2), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 11, (select x.id from public.seances x join public.sequences sq on sq.id = x.sequence_id where sq.promotion_id = p and sq.matiere_id = (select id from public.matieres where ordre = 3) and sq.numero = 2 and x.numero = 3), '', '');
  insert into public.progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note) values (p, (select id from public.matieres where ordre = 3), 12, null, '', 'révisions + évaluation de fin de séquence 2');
end $$;
