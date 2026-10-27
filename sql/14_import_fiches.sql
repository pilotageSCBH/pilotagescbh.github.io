-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : IMPORT DES FICHES (fichier d'échange)
-- « Importer » dans Fiches et contrats : remplit en une fois (une seule opération, annulable) la fiche de préparation,
-- les fiches de déroulement (phases, travail à la maison…) et les en-têtes et critères des contrats d'une séquence,
-- à partir d'un fichier d'échange (.json) exporté par l'application puis complété.
-- Le séquençage (titres, objectifs, compétences) et les notes des élèves ne sont jamais modifiés.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien.)
-- =====================================================================================================

create or replace function public.importer_fiches(s bigint, d jsonb) returns json
language plpgsql set search_path = public as $$
declare e jsonb; x bigint; c bigint; k jsonb; p jsonb; n_fiches int := 0; n_contrats int := 0; n_crit int := 0; n_ignores int := 0;
begin
  if not public.peut_sequence(s) then raise exception 'Vous ne pouvez pas modifier les fiches de cette matière.'; end if;

  -- fiche de préparation de séquence (seules les rubriques présentes dans le fichier sont modifiées)
  p := d->'preparation';
  if jsonb_typeof(p) = 'object' then
    insert into fiches_sequence (sequence_id) values (s) on conflict (sequence_id) do nothing;
    update fiches_sequence set
      activites  = coalesce(p->>'activites', activites),  situation  = coalesce(p->>'situation', situation),
      prerequis  = coalesce(p->>'prerequis', prerequis),  modalites  = coalesce(p->>'modalites', modalites),
      ressources = coalesce(p->>'ressources', ressources), bilan     = coalesce(p->>'bilan', bilan)
    where sequence_id = s;
    n_fiches := n_fiches + 1;
  end if;

  -- contrat sommatif
  if jsonb_typeof(d->'contrat_sommatif') = 'object' then
    c := public.contrat_sommatif(s);
    perform public.importer_contrat(c, d->'contrat_sommatif');
    n_contrats := n_contrats + 1;
    n_crit := n_crit + coalesce(jsonb_array_length(d->'contrat_sommatif'->'criteres'), 0);
  end if;

  -- séances (retrouvées par leur numéro dans la séquence)
  for e in select * from jsonb_array_elements(coalesce(d->'seances', '[]')) loop
    select id into x from seances where sequence_id = s and numero = (e->>'numero')::int;
    if x is null then n_ignores := n_ignores + 1; continue; end if;
    p := e->'fiche';
    if jsonb_typeof(p) = 'object' then
      insert into fiches_seance (seance_id) values (x) on conflict (seance_id) do nothing;
      update fiches_seance set
        salle = coalesce(p->>'salle', salle), prerequis = coalesce(p->>'prerequis', prerequis), materiel = coalesce(p->>'materiel', materiel),
        phases = case when jsonb_typeof(p->'phases') = 'array' then p->'phases' else phases end,
        evaluation = coalesce(p->>'evaluation', evaluation), differenciation = coalesce(p->>'differenciation', differenciation),
        bilan = coalesce(p->>'bilan', bilan),
        maison_avant = case when p ? 'maison_avant' then nullif(p->'maison_avant', 'null'::jsonb) else maison_avant end,
        maison_apres = case when p ? 'maison_apres' then nullif(p->'maison_apres', 'null'::jsonb) else maison_apres end
      where seance_id = x;
      n_fiches := n_fiches + 1;
    end if;
    if jsonb_typeof(e->'contrat_formatif') = 'object' then
      c := public.contrat_formatif(x);
      perform public.importer_contrat(c, e->'contrat_formatif');
      n_contrats := n_contrats + 1;
      n_crit := n_crit + coalesce(jsonb_array_length(e->'contrat_formatif'->'criteres'), 0);
    end if;
    x := null;
  end loop;
  return json_build_object('fiches', n_fiches, 'contrats', n_contrats, 'criteres', n_crit, 'seances_ignorees', n_ignores);
end $$;

-- en-tête et critères d'un contrat : critère retrouvé par (rubrique, n° d'ordre) → texte et coefficient remplacés ;
-- sinon ajouté. Aucun critère n'est supprimé (les notes déjà saisies sont conservées).
create or replace function public.importer_contrat(c bigint, d jsonb) returns void
language plpgsql set search_path = public as $$
declare k jsonb; g int; o int; id_k bigint;
begin
  if not public.peut_contrat(c) then raise exception 'Vous ne pouvez pas modifier ce contrat.'; end if;
  update contrats set forme = coalesce(d->>'forme', forme), lieu = coalesce(d->>'lieu', lieu),
         organisation = coalesce(d->>'organisation', organisation), duree = coalesce(d->>'duree', duree),
         date_eval = case when d ? 'date' then nullif(d->>'date', '')::date else date_eval end
  where id = c;
  for k in select * from jsonb_array_elements(coalesce(d->'criteres', '[]')) loop
    if coalesce(k->>'texte', '') = '' or coalesce(k->>'rubrique', '') = '' then continue; end if;
    select groupe_ordre into g from criteres where contrat_id = c and groupe = k->>'rubrique' limit 1;
    if g is null then select coalesce(max(groupe_ordre), 0) + 1 into g from criteres where contrat_id = c; end if;
    o := coalesce((k->>'ordre')::int, 0);
    select id into id_k from criteres where contrat_id = c and groupe = k->>'rubrique' and ordre = o limit 1;
    if id_k is not null then
      update criteres set texte = k->>'texte', coefficient = coalesce((k->>'coefficient')::numeric, coefficient), actif = true where id = id_k;
    else
      insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte, coefficient, libre)
      values (c, k->>'rubrique', g, case when o > 0 then o else (select coalesce(max(ordre), 0) + 1 from criteres where contrat_id = c and groupe = k->>'rubrique') end,
              k->>'texte', coalesce((k->>'coefficient')::numeric, 1), true);
    end if;
    id_k := null; g := null;
  end loop;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
