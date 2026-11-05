-- 22 · Correctif : suppression d'une séance, d'une séquence ou d'un contrat
-- Depuis le script 20, supprimer une séance (ou une séquence, ou un contrat) qui a un contrat avec des critères
-- échouait : l'historique ne retrouvait plus le contrat déjà supprimé et ne savait pas décrire la ligne.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Sans effet sur les données.

create or replace function public.contexte_ligne(t text, j jsonb, out p bigint, out m bigint, out c text)
language plpgsql stable security definer set search_path = public as $$
declare sq record; x record; k record; ct record; e record;
begin
  case t
  when 'sequences' then
    p := (j->>'promotion_id')::bigint; m := (j->>'matiere_id')::bigint;
    c := 'Séquence ' || (j->>'numero') || coalesce(' · ' || nullif(j->>'intitule', ''), '');
  when 'seances' then
    select * into sq from sequences where id = (j->>'sequence_id')::bigint;
    p := sq.promotion_id; m := sq.matiere_id;
    c := 'Séance ' || coalesce(sq.numero::text, '?') || '.' || (j->>'numero') || coalesce(' · ' || nullif(j->>'titre', ''), '');
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
    select x2.numero, s2.numero as sn, s2.promotion_id, s2.matiere_id into x from seances x2 join sequences s2 on s2.id = x2.sequence_id where x2.id = (j->>'seance_id')::bigint;
    p := x.promotion_id; m := x.matiere_id; c := 'Fiche de déroulement · séance ' || coalesce(x.sn || '.' || x.numero, '?');
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
      select x2.numero, s2.numero as sn, s2.promotion_id, s2.matiere_id into x from seances x2 join sequences s2 on s2.id = x2.sequence_id where x2.id = ct.seance_id;
      p := x.promotion_id; m := x.matiere_id; c := 'Contrat formatif · séance ' || coalesce(x.sn || '.' || x.numero, '?');
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
