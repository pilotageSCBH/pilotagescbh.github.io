-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour 24 : COURS MOBILISÉS RELIÉS AUX COURS RESSOURCES
-- Dans le séquençage, une séance peut citer des cours de « Mes cours ressources » (cochés dans une liste) :
-- leur titre s'affiche dans « Cours mobilisés » et leurs savoirs associés sont ajoutés à la séance.
-- La saisie libre des cours mobilisés reste possible.
-- Cours ressources : seuls le titre, le sommaire et les savoirs sont enregistrés (aucun fichier), avec une
-- taille limitée par cours.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune saisie.)
-- =====================================================================================================

-- cours reliés à la séance : [{ id, titre, savoirs, ajoutes }] (titre et savoirs recopiés : visibles par toute l'équipe)
alter table public.seances add column if not exists cours_lies jsonb not null default '[]';

-- cours ressources : taille limitée (titre, sommaire, savoirs seulement)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cours_taille') then
    alter table public.cours add constraint cours_taille check (length(titre) <= 300 and length(sommaire) <= 20000
      and cardinality(savoirs) <= 100 and length(mots_cles) <= 500 and length(lien) <= 1000) not valid;
  end if;
end $$;

-- les copies de séances (reprise d'une promotion, duplication) gardent les cours reliés
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
        insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis_texte)
        select s, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis_texte from seances where sequence_id = q.id;
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
      insert into progression_cases (promotion_id, matiere_id, semaine, seance_id, seance2_id, texte, note)
      select cible, m.id, c.semaine,
             (select x2.id from seances x2 join sequences s2 on s2.id = x2.sequence_id
               where s2.promotion_id = cible and s2.matiere_id = m.id and s2.numero = sq.numero and x2.numero = x.numero),
             (select x2.id from seances x2 join sequences s2 on s2.id = x2.sequence_id
               where s2.promotion_id = cible and s2.matiere_id = m.id and s2.numero = sq2.numero and x2.numero = y.numero),
             c.texte, c.note
      from progression_cases c left join seances x on x.id = c.seance_id left join sequences sq on sq.id = x.sequence_id
           left join seances y on y.id = c.seance2_id left join sequences sq2 on sq2.id = y.sequence_id
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

create or replace function public.dupliquer_sequence(s bigint, m bigint, p bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare src sequences%rowtype; n int; s_new bigint; x record; x_new bigint; carte jsonb := '{}'; c record; c_new bigint;
begin
  if not public.est_actif() then raise exception 'Accès refusé.'; end if;
  if not public.enseigne_matiere(m) then raise exception 'Vous ne pouvez dupliquer que vers une matière que vous enseignez.'; end if;
  select * into src from sequences where id = s;
  if src.id is null then raise exception 'Séquence introuvable.'; end if;
  if not exists (select 1 from promotions where id = p) then raise exception 'Promotion introuvable.'; end if;
  select coalesce(max(numero), 0) + 1 into n from sequences where matiere_id = m and promotion_id = p;
  if n > 10 then raise exception '10 séquences au maximum par matière : la matière de destination est complète.'; end if;
  insert into sequences (promotion_id, matiere_id, numero, intitule, objectif) values (p, m, n, src.intitule, src.objectif) returning id into s_new;
  for x in select * from seances where sequence_id = s order by numero loop
    insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis_texte)
    values (s_new, x.numero, x.titre, x.duree, x.objectif_inter, x.objectifs_ops, x.cours, x.cours_lies, x.competences, x.savoirs, x.prerequis_texte)
    returning id into x_new;
    carte := carte || jsonb_build_object(x.id::text, x_new);
    perform public.copier_fiche_seance(x.id, x_new);
  end loop;
  -- prérequis : les séances de la séquence copiée pointent vers leurs copies ; les autres sont gardés dans la même promotion
  for x in select * from seances where sequence_id = s and cardinality(prerequis) > 0 loop
    update seances set prerequis = coalesce((
      select array_agg(coalesce((carte ->> o::text)::bigint, case when src.promotion_id = p then o end))
      from unnest(x.prerequis) o where carte ? o::text or src.promotion_id = p), '{}')
    where id = (carte ->> x.id::text)::bigint;
  end loop;
  insert into fiches_sequence (sequence_id, activites, situation, prerequis, modalites, ressources, bilan)
  select s_new, activites, situation, prerequis, modalites, ressources, '' from fiches_sequence where sequence_id = s;
  for c in select * from contrats where type = 'sommatif' and sequence_id = s loop
    insert into contrats (type, sequence_id, forme, lieu, organisation, duree, coef_resultat)
    values ('sommatif', s_new, c.forme, c.lieu, c.organisation, c.duree, c.coef_resultat) returning id into c_new;
    insert into criteres (contrat_id, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif)
    select c_new, groupe, groupe_ordre, ordre, texte, coefficient, libre, actif from criteres where contrat_id = c.id;
  end loop;
  return s_new;
end $$;

create or replace function public.dupliquer_seance(x bigint, cible bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare src seances%rowtype; p_src bigint; p_dst bigint; n int; x_new bigint;
begin
  if not public.est_actif() then raise exception 'Accès refusé.'; end if;
  if not public.enseigne_sequence(cible) then raise exception 'Vous ne pouvez dupliquer que vers une séquence d''une matière que vous enseignez.'; end if;
  select * into src from seances where id = x;
  if src.id is null then raise exception 'Séance introuvable.'; end if;
  select promotion_id into p_src from sequences where id = src.sequence_id;
  select promotion_id into p_dst from sequences where id = cible;
  select coalesce(max(numero), 0) + 1 into n from seances where sequence_id = cible;
  insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis, prerequis_texte)
  values (cible, n, src.titre, src.duree, src.objectif_inter, src.objectifs_ops, src.cours, src.cours_lies, src.competences, src.savoirs,
          case when p_src = p_dst then src.prerequis else '{}' end, src.prerequis_texte)
  returning id into x_new;
  perform public.copier_fiche_seance(x, x_new);
  return x_new;
end $$;

create or replace function public.copier_sequencage(m bigint, source bigint, cible bigint) returns int
language plpgsql as $$
declare q record; s bigint; nb int := 0;
begin
  if not public.enseigne_matiere(m) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  if source = cible then raise exception 'Choisissez une autre promotion.'; end if;
  if exists (select 1 from sequences where matiere_id = m and promotion_id = cible) then
    raise exception 'Cette promotion a déjà des séquences dans cette matière : supprimez-les d''abord.';
  end if;
  for q in select * from sequences where matiere_id = m and promotion_id = source order by numero loop
    insert into sequences (promotion_id, matiere_id, numero, intitule, objectif)
    values (cible, m, q.numero, q.intitule, q.objectif) returning id into s;
    insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis_texte)
    select s, numero, titre, duree, objectif_inter, objectifs_ops, cours, cours_lies, competences, savoirs, prerequis_texte
    from seances where sequence_id = q.id;
    nb := nb + 1;
  end loop;
  if nb = 0 then raise exception 'La promotion choisie n''a aucune séquence dans cette matière.'; end if;
  perform public.remapper_prerequis(source, cible);
  return nb;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.copier_fiche_seance(bigint, bigint) from authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
