-- 19 · Fiches activité : une ou plusieurs activités en classe décrites dans la fiche de déroulement d'une séance,
-- imprimables en fiche élève A4. Les activités suivent la fiche quand une séance, une séquence ou une promotion
-- est dupliquée ou recopiée, et dans l'import / export des fiches.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Relancer le script ne casse rien.

alter table public.fiches_seance add column if not exists activites jsonb not null default '[]';

create or replace function public.copier_fiche_seance(src bigint, dst bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c record; c_new bigint;
begin
  insert into fiches_seance (seance_id, salle, prerequis, materiel, phases, evaluation, differenciation, bilan, maison_avant, maison_apres, activites)
  select dst, salle, prerequis, materiel, phases, evaluation, differenciation, '', maison_avant, maison_apres, activites from fiches_seance where seance_id = src
  on conflict (seance_id) do nothing;
  for c in select * from contrats where type = 'formatif' and seance_id = src loop
    if exists (select 1 from contrats where type = 'formatif' and seance_id = dst) then exit; end if;
    insert into contrats (type, seance_id, forme, lieu, organisation, duree, coef_resultat)
    values ('formatif', dst, c.forme, c.lieu, c.organisation, c.duree, c.coef_resultat) returning id into c_new;
    insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif)
    select c_new, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif from criteres where contrat_id = c.id;
  end loop;
end $$;
revoke execute on function public.copier_fiche_seance(bigint, bigint) from public, anon, authenticated;

create or replace function public.copier_promotion(source bigint, cible bigint, sequencages boolean, calendrier boolean,
                                                   progression boolean, fiches boolean) returns json
language plpgsql security definer set search_path = public as $$
declare m record; q record; s bigint; r json; n_seq int := 0; n_sem int := 0; n_jours int := 0; n_cases int := 0;
        n_fiches int := 0; n_contrats int := 0; c_old record; c_new bigint;
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  if source = cible then raise exception 'Choisissez deux promotions différentes.'; end if;
  -- séquençages (par matière, si la matière est vide dans la cible)
  if sequencages then
    for m in select id from matieres loop
      if exists (select 1 from sequences where matiere_id = m.id and promotion_id = cible) then continue; end if;
      for q in select * from sequences where matiere_id = m.id and promotion_id = source order by numero loop
        insert into sequences (promotion_id, matiere_id, numero, intitule, objectif) values (cible, m.id, q.numero, q.intitule, q.objectif) returning id into s;
        insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte)
        select s, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte from seances where sequence_id = q.id;
        n_seq := n_seq + 1;
      end loop;
    end loop;
  end if;
  -- calendrier commun : vacances / autres, apprentis, évènements du jour (mêmes semaines et jours de l'année scolaire)
  if calendrier then
    if not exists (select 1 from progression_semaines where promotion_id = cible) then
      insert into progression_semaines (promotion_id, semaine, vacances, apprentis)
      select cible, semaine, vacances, apprentis from progression_semaines where promotion_id = source;
      get diagnostics n_sem = row_count;
    end if;
    if not exists (select 1 from progression_jours where promotion_id = cible) then
      insert into progression_jours (promotion_id, jour, evenement) select cible, jour, evenement from progression_jours where promotion_id = source;
      get diagnostics n_jours = row_count;
    end if;
  end if;
  -- progression : séances placées (retrouvées par matière, n° de séquence et n° de séance), textes et notes
  if progression then
    for m in select id from matieres loop
      if exists (select 1 from progression_cases where matiere_id = m.id and promotion_id = cible) then continue; end if;
      insert into progression_cases (promotion_id, matiere_id, semaine, seance_id, texte, note)
      select cible, m.id, c.semaine,
             (select x2.id from seances x2 join sequences s2 on s2.id = x2.sequence_id
               where s2.promotion_id = cible and s2.matiere_id = m.id and s2.numero = sq.numero and x2.numero = x.numero),
             c.texte, c.note
      from progression_cases c left join seances x on x.id = c.seance_id left join sequences sq on sq.id = x.sequence_id
      where c.promotion_id = source and c.matiere_id = m.id;
      n_cases := n_cases + (select count(*) from progression_cases where promotion_id = cible and matiere_id = m.id);
    end loop;
  end if;
  -- fiches et contrats (critères et coefficients, sans les notes ni la date)
  if fiches then
    insert into fiches_sequence (sequence_id, activites, situation, prerequis, modalites, ressources, bilan)
    select t.id, f.activites, f.situation, f.prerequis, f.modalites, f.ressources, ''
    from fiches_sequence f join sequences o on o.id = f.sequence_id and o.promotion_id = source
    join sequences t on t.promotion_id = cible and t.matiere_id = o.matiere_id and t.numero = o.numero
    on conflict (sequence_id) do nothing;
    get diagnostics n_fiches = row_count;
    insert into fiches_seance (seance_id, salle, prerequis, materiel, phases, evaluation, differenciation, bilan, maison_avant, maison_apres, activites)
    select tx.id, f.salle, f.prerequis, f.materiel, f.phases, f.evaluation, f.differenciation, '', f.maison_avant, f.maison_apres, f.activites
    from fiches_seance f join seances ox on ox.id = f.seance_id join sequences o on o.id = ox.sequence_id and o.promotion_id = source
    join sequences t on t.promotion_id = cible and t.matiere_id = o.matiere_id and t.numero = o.numero
    join seances tx on tx.sequence_id = t.id and tx.numero = ox.numero
    on conflict (seance_id) do nothing;
    n_fiches := n_fiches + (select count(*) from fiches_seance f join seances x on x.id = f.seance_id join sequences s2 on s2.id = x.sequence_id where s2.promotion_id = cible);
    for c_old in
      select c.*, t.id as cible_seq, tx.id as cible_seance
      from contrats c
      left join sequences o on o.id = c.sequence_id
      left join seances ox on ox.id = c.seance_id left join sequences os on os.id = ox.sequence_id
      left join sequences t on c.type = 'sommatif' and t.promotion_id = cible and t.matiere_id = o.matiere_id and t.numero = o.numero
      left join sequences ts on c.type = 'formatif' and ts.promotion_id = cible and ts.matiere_id = os.matiere_id and ts.numero = os.numero
      left join seances tx on tx.sequence_id = ts.id and tx.numero = ox.numero
      where coalesce(o.promotion_id, os.promotion_id) = source
    loop
      if c_old.type = 'sommatif' and (c_old.cible_seq is null or exists (select 1 from contrats where type = 'sommatif' and sequence_id = c_old.cible_seq)) then continue; end if;
      if c_old.type = 'formatif' and (c_old.cible_seance is null or exists (select 1 from contrats where type = 'formatif' and seance_id = c_old.cible_seance)) then continue; end if;
      insert into contrats (type, sequence_id, seance_id, forme, lieu, organisation, duree)
      values (c_old.type, case when c_old.type = 'sommatif' then c_old.cible_seq end, case when c_old.type = 'formatif' then c_old.cible_seance end,
              c_old.forme, c_old.lieu, c_old.organisation, c_old.duree) returning id into c_new;
      insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif)
      select c_new, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif from criteres where contrat_id = c_old.id;
      n_contrats := n_contrats + 1;
    end loop;
  end if;
  if sequencages then perform public.remapper_prerequis(source, cible); end if;
  return json_build_object('sequences', n_seq, 'semaines', n_sem, 'jours', n_jours, 'cases', n_cases, 'fiches', n_fiches, 'contrats', n_contrats);
end $$;

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
        maison_apres = case when p ? 'maison_apres' then nullif(p->'maison_apres', 'null'::jsonb) else maison_apres end,
        activites = case when jsonb_typeof(p->'activites') = 'array' then p->'activites' else activites end
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

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.copier_fiche_seance(bigint, bigint) from authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
