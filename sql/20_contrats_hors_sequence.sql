-- 20 · Contrats hors séquence : fiches contrat formatif ou sommatif rattachées seulement à une promotion et une matière
-- (ex. évaluer des compétences transversales qui ne sont pas prévues dans le séquençage). Les contrats sommatifs hors
-- séquence comptent dans la validation des compétences, les résultats et moyennes, la fiche élève et le livret.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Relancer le script ne casse rien.

alter table public.contrats add column if not exists promotion_id bigint references public.promotions (id) on delete cascade;
alter table public.contrats add column if not exists matiere_id   bigint references public.matieres (id) on delete cascade;
alter table public.contrats add column if not exists titre        text not null default '';
alter table public.contrats drop constraint if exists contrats_check;
alter table public.contrats add constraint contrats_check check (
  (type = 'sommatif' and sequence_id is not null) or (type = 'formatif' and seance_id is not null)
  or (sequence_id is null and seance_id is null and promotion_id is not null and matiere_id is not null));
create index if not exists contrats_libres on public.contrats (promotion_id) where promotion_id is not null;

-- droits : contrat hors séquence = enseignant de la matière ou administrateur
create or replace function public.peut_contrat(c bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when sequence_id is null and seance_id is null then public.peut_matiere(matiere_id)
                               when type = 'sommatif' then public.peut_sequence(sequence_id) else public.peut_seance(seance_id) end
                   from contrats where id = c), false);
$$;
drop policy if exists ecriture on public.contrats;
create policy ecriture on public.contrats for all to authenticated
  using (case when sequence_id is null and seance_id is null then public.peut_matiere(matiere_id)
              when type = 'sommatif' then public.peut_sequence(sequence_id) else public.peut_seance(seance_id) end)
  with check (case when sequence_id is null and seance_id is null then public.peut_matiere(matiere_id)
                   when type = 'sommatif' then public.peut_sequence(sequence_id) else public.peut_seance(seance_id) end);

-- notes / 20 des contrats sommatifs de la promotion p (contrats des séquences et contrats hors séquence)
create or replace function public.notes_sommatives(p bigint) returns table (contrat_id bigint, eleve_id bigint, note numeric)
language sql stable set search_path = public as $$
  with g as (
    select k.contrat_id, k.groupe, n.eleve_id, sum(n.valeur::numeric * k.coefficient) / nullif(sum(k.coefficient), 0) as m
    from contrats c
    left join sequences s on s.id = c.sequence_id
    join criteres k on k.contrat_id = c.id and k.actif
    join notes n on n.critere_id = k.id and n.valeur <> 'NE'
    where c.type = 'sommatif' and coalesce(s.promotion_id, c.promotion_id) = p
    group by 1, 2, 3)
  select contrat_id, eleve_id, avg(m) * 4 from g where m is not null group by 1, 2;
$$;

-- ajoute à un contrat une rubrique par compétence choisie (critères = indicateurs de performance du référentiel)
create or replace function public.ajouter_competences_contrat(c bigint, comps text[]) returns integer
language plpgsql set search_path = public as $$
declare k record; n integer := 0;
begin
  if not public.peut_contrat(c) then raise exception 'Vous ne pouvez pas modifier ce contrat.'; end if;
  for k in
    select cp.code, cp.indicateurs, cp.ordre from competences cp
    where cp.code = any(comps) and not exists (select 1 from criteres cr where cr.contrat_id = c and cr.groupe = cp.code)
    order by cp.ordre
  loop
    insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte)
    select c, k.code, k.ordre, i.n, i.t from unnest(k.indicateurs) with ordinality as i(t, n);
    if not found then
      insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte, libre) values (c, k.code, k.ordre, 1, '', true);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- nouveau contrat hors séquence (type 'formatif' ou 'sommatif') avec les compétences choisies
create or replace function public.creer_contrat_libre(t text, p bigint, m bigint, titre text, d date, comps text[]) returns bigint
language plpgsql set search_path = public as $$
declare c bigint;
begin
  if not public.peut_matiere(m) then raise exception 'Vous ne pouvez créer un contrat que dans une matière que vous enseignez.'; end if;
  if t not in ('formatif', 'sommatif') then raise exception 'Type de contrat inconnu.'; end if;
  insert into contrats (type, promotion_id, matiere_id, titre, date_eval) values (t, p, m, coalesce(titre, ''), d) returning id into c;
  perform public.ajouter_competences_contrat(c, coalesce(comps, '{}'));
  return c;
end $$;

-- historique : contexte lisible des contrats hors séquence
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
    if ct.sequence_id is null and ct.seance_id is null then
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
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.copier_fiche_seance(bigint, bigint) from authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
