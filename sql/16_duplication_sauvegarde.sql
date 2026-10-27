-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour 16 : DUPLICATION et SAUVEGARDE
--   - dupliquer une séquence (séances, fiches, contrats et critères, sans les notes ni les dates) vers une matière
--     enseignée et une promotion au choix ; dupliquer une séance à la fin d'une autre séquence ;
--   - sauvegarde complète téléchargeable par l'administrateur, et restauration à partir de ce fichier.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien.)
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------- outils de copie
-- copie la fiche de déroulement et le contrat formatif d'une séance vers une autre
create or replace function public.copier_fiche_seance(src bigint, dst bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c record; c_new bigint;
begin
  insert into fiches_seance (seance_id, salle, prerequis, materiel, phases, evaluation, differenciation, bilan, maison_avant, maison_apres)
  select dst, salle, prerequis, materiel, phases, evaluation, differenciation, '', maison_avant, maison_apres from fiches_seance where seance_id = src
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

-- ------------------------------------------------------------------------------------------- dupliquer une séquence
-- s : séquence source (n'importe quelle matière ou promotion) ; m, p : matière (enseignée) et promotion de destination.
-- La copie prend le numéro suivant dans la destination. Retourne l'identifiant de la nouvelle séquence.
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
    insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte)
    values (s_new, x.numero, x.titre, x.duree, x.objectif_inter, x.objectifs_ops, x.cours, x.competences, x.savoirs, x.prerequis_texte)
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

-- ------------------------------------------------------------------------------------------- dupliquer une séance
-- x : séance source ; cible : séquence de destination (d'une matière enseignée). La copie est ajoutée en fin de séquence.
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
  insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis, prerequis_texte)
  values (cible, n, src.titre, src.duree, src.objectif_inter, src.objectifs_ops, src.cours, src.competences, src.savoirs,
          case when p_src = p_dst then src.prerequis else '{}' end, src.prerequis_texte)
  returning id into x_new;
  perform public.copier_fiche_seance(x, x_new);
  return x_new;
end $$;

-- ------------------------------------------------------------------------------------------- sauvegarde complète
-- tables sauvegardées, dans l'ordre de création (les parents avant les enfants)
create or replace function public.tables_sauvegarde() returns text[] language sql immutable as $$
  select array['activites', 'taches', 'competences', 'savoirs', 'durees', 'matieres', 'enseignants', 'promotions', 'eleves',
               'sequences', 'seances', 'progression_semaines', 'progression_jours', 'progression_cases', 'couverture',
               'fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'notes', 'commentaires', 'evaluations', 'resultats', 'appreciations'];
$$;

create or replace function public.sauvegarde() returns json
language plpgsql security definer set search_path = public as $$
declare t text; r jsonb := '{}'; v jsonb;
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  foreach t in array public.tables_sauvegarde() loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', t) into v;
    r := r || jsonb_build_object(t, v);
  end loop;
  return json_build_object('format', 'pilotage-scbh-sauvegarde', 'version', 1, 'date', now(), 'tables', r);
end $$;

-- Restauration : remplace TOUTES les données sauvegardées par celles du fichier (les comptes de connexion sont conservés).
create or replace function public.restaurer(d jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare t text; lignes jsonb; cols text; nb int; bilan jsonb := '{}'; tabs text[] := public.tables_sauvegarde(); i int;
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  if d ->> 'format' is distinct from 'pilotage-scbh-sauvegarde' then raise exception 'Ce fichier n''est pas une sauvegarde du site.'; end if;
  if jsonb_typeof(d -> 'tables') <> 'object' or not (d -> 'tables') ? 'promotions' then raise exception 'Sauvegarde incomplète.'; end if;
  set constraints all deferred;
  -- pas d'historique ni de traces automatiques pendant la restauration
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I disable trigger user', t); end if;
  end loop;
  -- suppression (enfants d'abord)
  for i in reverse cardinality(tabs) .. 1 loop
    t := tabs[i];
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I', t); end if;
  end loop;
  -- comptes : on ne relie que les comptes qui existent encore
  d := jsonb_set(d, '{tables,enseignants}', coalesce((select jsonb_agg(case when e ->> 'profil_id' is not null
      and not exists (select 1 from profils where id = (e ->> 'profil_id')::uuid) then jsonb_set(e, '{profil_id}', 'null') else e end)
      from jsonb_array_elements(d -> 'tables' -> 'enseignants') e), '[]'));
  d := jsonb_set(d, '{tables,commentaires}', coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(d -> 'tables' -> 'commentaires', '[]')) e
      where exists (select 1 from profils where id = (e ->> 'auteur')::uuid)), '[]'));
  -- insertion (parents d'abord), colonnes présentes à la fois dans le fichier et dans la table
  foreach t in array tabs loop
    lignes := d -> 'tables' -> t;
    if to_regclass('public.' || t) is null or lignes is null or jsonb_array_length(lignes) = 0 then continue; end if;
    select string_agg(quote_ident(a.attname), ', ') into cols
    from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and exists (select 1 from jsonb_array_elements(lignes) e where e ? a.attname);
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', t, cols, cols, t) using lignes;
    get diagnostics nb = row_count;
    bilan := bilan || jsonb_build_object(t, nb);
    if exists (select 1 from pg_attribute where attrelid = ('public.' || t)::regclass and attname = 'id' and attnum > 0)
       and pg_get_serial_sequence('public.' || t, 'id') is not null then
      execute format('select setval(pg_get_serial_sequence(''public.%I'', ''id''), greatest(coalesce((select max(id) from public.%I), 0), 1))', t, t);
    end if;
  end loop;
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I enable trigger user', t); end if;
  end loop;
  -- l'historique d'avant la restauration ne correspond plus aux données : il est vidé
  delete from journal;
  return bilan;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.copier_fiche_seance(bigint, bigint) from authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
