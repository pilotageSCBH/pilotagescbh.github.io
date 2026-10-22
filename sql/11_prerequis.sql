-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : PRÉREQUIS (ANTÉRIORITÉS) DES SÉANCES
--   - chaque séance peut avoir pour prérequis d'autres séances de la promotion (de n'importe quelle matière),
--     et des prérequis rédigés librement ;
--   - la progression signale une séance placée avant l'une de ses séances prérequises ;
--   - les prérequis suivent la reprise d'un séquençage ou d'une promotion.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune saisie.)
-- =====================================================================================================

alter table public.seances add column if not exists prerequis bigint[] not null default '{}';      -- séances à faire avant
alter table public.seances add column if not exists prerequis_texte text not null default '';      -- autres prérequis

-- après une recopie de « source » vers « cible » : les prérequis des séances recopiées désignent les séances
-- correspondantes de la cible (même matière, même n° de séquence, même n° de séance) ; seulement si encore vides
create or replace function public.remapper_prerequis(source bigint, cible bigint) returns void
language sql as $$
  update seances t set prerequis = coalesce((
      select array_agg(tx.id order by u.ord)
      from unnest(o.prerequis) with ordinality u(pid, ord)
      join seances ps on ps.id = u.pid join sequences pq on pq.id = ps.sequence_id
      join sequences tq on tq.promotion_id = cible and tq.matiere_id = pq.matiere_id and tq.numero = pq.numero
      join seances tx on tx.sequence_id = tq.id and tx.numero = ps.numero), '{}')
  from seances o join sequences oq on oq.id = o.sequence_id and oq.promotion_id = source, sequences tq2
  where t.sequence_id = tq2.id and tq2.promotion_id = cible and tq2.matiere_id = oq.matiere_id and tq2.numero = oq.numero
    and t.numero = o.numero and t.prerequis = '{}' and o.prerequis <> '{}';
$$;

-- reprise du séquençage d'une matière (prérequis compris)
create or replace function public.copier_sequencage(m bigint, source bigint, cible bigint) returns int
language plpgsql as $$
declare q record; s bigint; nb int := 0;
begin
  if not public.peut_matiere(m) then raise exception 'Vous ne pouvez pas modifier cette matière.'; end if;
  if source = cible then raise exception 'Choisissez une autre promotion.'; end if;
  if exists (select 1 from sequences where matiere_id = m and promotion_id = cible) then
    raise exception 'Cette promotion a déjà des séquences dans cette matière : supprimez-les d''abord.';
  end if;
  for q in select * from sequences where matiere_id = m and promotion_id = source order by numero loop
    insert into sequences (promotion_id, matiere_id, numero, intitule, objectif)
    values (cible, m, q.numero, q.intitule, q.objectif) returning id into s;
    insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte)
    select s, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte
    from seances where sequence_id = q.id;
    nb := nb + 1;
  end loop;
  if nb = 0 then raise exception 'La promotion choisie n''a aucune séquence dans cette matière.'; end if;
  perform public.remapper_prerequis(source, cible);
  return nb;
end $$;

-- reprise d'une promotion (prérequis compris)
create or replace function public.copier_promotion(source bigint, cible bigint, sequencages boolean, calendrier boolean,
                                                   progression boolean, fiches boolean) returns json
language plpgsql as $$
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
    insert into fiches_seance (seance_id, salle, prerequis, materiel, phases, evaluation, differenciation, bilan)
    select tx.id, f.salle, f.prerequis, f.materiel, f.phases, f.evaluation, f.differenciation, ''
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

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
