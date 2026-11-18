-- =====================================================================================================
-- 41 · Séances hors séquence : une séance rattachée seulement à une promotion et une matière (cas particuliers),
-- avec sa fiche de déroulement (et sa fiche contrat formatif). Elle n'apparaît ni dans le séquençage, ni dans la
-- progression, ni dans la couverture du référentiel. Supprimer la séance supprime ses fiches.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Relancer le script ne casse rien.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

alter table public.seances alter column sequence_id drop not null;
alter table public.seances add column if not exists promotion_id bigint references public.promotions (id) on delete cascade;
alter table public.seances add column if not exists matiere_id   bigint references public.matieres (id) on delete cascade;
alter table public.seances drop constraint if exists seances_rattachement;
alter table public.seances add constraint seances_rattachement check (sequence_id is not null or (promotion_id is not null and matiere_id is not null));
create index if not exists seances_libres on public.seances (promotion_id) where sequence_id is null;

-- droits : séance d'une séquence = droits de la séquence ; séance hors séquence = droits de la matière
create or replace function public.peut_seance(x bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when sequence_id is null then public.peut_matiere(matiere_id) else public.peut_sequence(sequence_id) end
                   from seances where id = x), false);
$$;
-- (lecture partagée, script 14 : seulement si ce script a été exécuté)
do $do$ begin
  if exists (select 1 from pg_proc where proname = 'voit_matiere') then
    execute $f$
      create or replace function public.voit_seance(x bigint) returns boolean
      language sql stable security definer set search_path = public as $$
        select coalesce((select case when sequence_id is null then public.voit_matiere(matiere_id) else public.voit_sequence(sequence_id) end
                         from seances where id = x), false);
      $$ $f$;
  end if;
end $do$;
drop policy if exists ecriture on public.seances;
create policy ecriture on public.seances for all to authenticated
  using (case when sequence_id is null then public.enseigne_matiere(matiere_id) else public.enseigne_sequence(sequence_id) end)
  with check (case when sequence_id is null then public.enseigne_matiere(matiere_id) else public.enseigne_sequence(sequence_id) end);

-- historique et « Annuler » : contexte lisible des séances hors séquence
create or replace function public.contexte_ligne(t text, j jsonb, out p bigint, out m bigint, out c text)
language plpgsql stable security definer set search_path = public as $$
declare sq record; x record; k record; ct record; e record;
begin
  case t
  when 'sequences' then
    p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
    c := 'Séquence ' || (j->>'numero') || coalesce(' · ' || nullif(j->>'intitule', ''), '');
  when 'seances' then
    if j->>'sequence_id' is null then   -- séance hors séquence
      p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
      c := 'Séance hors séquence' || coalesce(' · ' || nullif(j->>'titre', ''), '');
    else
      select * into sq from sequences where id = (j->>'sequence_id')::bigint;
      p := sq.promotion_id; m := sq.matiere_id;
      c := 'Séance ' || coalesce(sq.numero::text, '?') || '.' || (j->>'numero') || coalesce(' · ' || nullif(j->>'titre', ''), '');
    end if;
  when 'progression_cases' then
    p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
    c := 'Progression · semaine ' || (j->>'semaine');
  when 'progression_semaines' then
    p := (j->>'promotion_id')::bigint; c := 'Calendrier · semaine ' || (j->>'semaine');
  when 'progression_jours' then
    p := (j->>'promotion_id')::bigint; c := 'Évènement · jour ' || (j->>'jour');
  when 'eleves' then
    p := (j->>'promotion_id')::bigint; c := 'Élève ' || (j->>'nom') || ' ' || (j->>'prenom');
  when 'couverture' then
    p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
    c := 'Couverture ' || case when j->>'type' = 'savoir' then 'savoir ' else 'compétence ' end || (j->>'code');
  when 'fiches_sequence' then
    select * into sq from sequences where id = (j->>'sequence_id')::bigint;
    p := sq.promotion_id; m := sq.matiere_id; c := 'Fiche de préparation · séquence ' || coalesce(sq.numero::text, '?');
  when 'fiches_seance' then
    select x2.numero, s2.numero as sn, coalesce(s2.promotion_id, x2.promotion_id) as promotion_id, coalesce(s2.matiere_id, x2.matiere_id) as matiere_id, x2.titre into x from seances x2 left join sequences s2 on s2.id = x2.sequence_id where x2.id = (j->>'seance_id')::bigint;
    p := x.promotion_id; m := x.matiere_id; c := 'Fiche de déroulement · séance ' || coalesce(x.sn || '.' || x.numero, 'hors séquence' || coalesce(' · ' || nullif(x.titre, ''), ''), '?');
  when 'contrats', 'criteres', 'notes' then
    if t = 'notes' then
      select * into k from criteres where id = (j->>'critere_id')::bigint;
      select * into ct from contrats where id = k.contrat_id;
      select * into e from eleves where id = (j->>'eleve_id')::bigint;
    elsif t = 'criteres' then
      select * into ct from contrats where id = (j->>'contrat_id')::bigint;
    else
      select * into ct from contrats where id = (j->>'id')::bigint;
      if ct.id is null then ct := jsonb_populate_record(null::contrats, j); end if;
    end if;
    if ct.id is not null and ct.sequence_id is null and ct.seance_id is null then
      p := ct.promotion_id; m := ct.matiere_id;
      c := 'Contrat ' || ct.type || ' hors séquence' || coalesce(' · ' || nullif(ct.titre, ''), '');
    elsif ct.type = 'sommatif' then
      select * into sq from sequences where id = ct.sequence_id;
      p := sq.promotion_id; m := sq.matiere_id; c := 'Contrat sommatif · séquence ' || coalesce(sq.numero::text, '?');
    elsif ct.type = 'formatif' then
      select x2.numero, s2.numero as sn, coalesce(s2.promotion_id, x2.promotion_id) as promotion_id, coalesce(s2.matiere_id, x2.matiere_id) as matiere_id, x2.titre into x from seances x2 left join sequences s2 on s2.id = x2.sequence_id where x2.id = ct.seance_id;
      p := x.promotion_id; m := x.matiere_id; c := 'Contrat formatif · séance ' || coalesce(x.sn || '.' || x.numero, 'hors séquence' || coalesce(' · ' || nullif(x.titre, ''), ''), '?');
    else c := 'Contrat';
    end if;
    if t = 'criteres' then c := c || ' · critère « ' || left(coalesce(j->>'texte', ''), 60) || ' »'; end if;
    if t = 'notes' then c := c || ' · note de ' || coalesce(e.nom || ' ' || e.prenom, 'élève'); end if;
  when 'evaluations' then
    p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
    c := 'Résultat intermédiaire · ' || coalesce(nullif(j->>'libelle', ''), 'sans titre');
  when 'resultats' then
    select * into x from evaluations where id = (j->>'evaluation_id')::bigint;
    select * into e from eleves where id = (j->>'eleve_id')::bigint;
    p := x.promotion_id; m := x.matiere_id;
    c := 'Résultat intermédiaire · ' || coalesce(nullif(x.libelle, ''), 'sans titre') || ' · note de ' || coalesce(e.nom || ' ' || e.prenom, 'élève');
  else c := t;
  end case;
  c := coalesce(c, t);   -- jamais vide : l'historique exige un contexte
end $$;

