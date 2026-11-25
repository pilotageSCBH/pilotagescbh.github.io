-- =====================================================================================================
-- 48 · QCM couplé à une fiche contrat : date et durée remplies automatiquement.
--   - Le site note l'heure à laquelle l'élève commence chaque tentative ; la durée de la copie est enregistrée
--     quand il la rend (affichée dans les résultats du QCM).
--   - Quand le QCM remplit la fiche contrat couplée (« Remplir automatiquement… » ou « ✅ Remplir la fiche contrat ») :
--       · Date de la fiche = jour où le premier élève a rendu le QCM ;
--       · Durée de la fiche = moyenne des durées des élèves (1re tentative ; une durée de plus de 4 h est ignorée).
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run), après le script 47. Relancer ne casse rien.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

alter table public.qcm_reponses add column if not exists duree_s integer;

-- début de chaque tentative (le premier affichage des questions compte ; recharger la page ne le change pas)
create table if not exists public.qcm_debuts (
  session_id  bigint not null references public.qcm_sessions (id) on delete cascade,
  eleve_id    bigint not null references public.eleves (id) on delete cascade,
  tentative   integer not null,
  debut       timestamptz not null default now(),
  primary key (session_id, eleve_id, tentative)
);
alter table public.qcm_debuts enable row level security;
revoke all on public.qcm_debuts from anon, authenticated;
grant select on public.qcm_debuts to authenticated;
drop policy if exists lecture on public.qcm_debuts;
create policy lecture on public.qcm_debuts for select to authenticated using (public.est_redacteur());

-- « 12 min », « 1 h 05 »
create or replace function public.duree_lisible(s numeric) returns text language sql immutable as $$
  select case when s is null then null
              when round(s / 60) < 60 then greatest(1, round(s / 60))::int || ' min'
              else (round(s / 60)::int / 60) || ' h ' || lpad((round(s / 60)::int % 60)::text, 2, '0') end;
$$;

-- date (1er élève) et durée moyenne de la passation, écrites dans la fiche contrat couplée
create or replace function public.qcm_infos_contrat(sess bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s record; q record; d date; moy numeric;
begin
  select * into s from qcm_sessions where id = sess;
  if not found then return; end if;
  select * into q from qcm where id = s.qcm_id;
  if q.contrat_id is null or public.contrat_promotion(q.contrat_id) is distinct from s.promotion_id then return; end if;
  select min((rendu_le at time zone 'Europe/Paris')::date) into d from qcm_reponses where session_id = sess;
  if d is null then return; end if;
  select avg(duree_s) into moy from qcm_reponses where session_id = sess and tentative = 1 and duree_s between 1 and 14400;
  update contrats set date_eval = d, duree = coalesce(public.duree_lisible(moy), duree), maj_le = now() where id = q.contrat_id;
end $$;
revoke all on function public.qcm_infos_contrat(bigint) from public, anon, authenticated;

-- notes de la fiche contrat couplée (script 30) + date et durée
create or replace function public.qcm_vers_contrat(sess bigint, el bigint) returns int
language plpgsql security definer set search_path = public as $$
declare s record; q record; r record; n int := 0;
begin
  select * into s from qcm_sessions where id = sess;
  if not found then return 0; end if;
  select * into q from qcm where id = s.qcm_id;
  if q.contrat_id is null or public.contrat_promotion(q.contrat_id) is distinct from s.promotion_id then return 0; end if;
  select * into r from qcm_reponses where session_id = s.id and eleve_id = el order by points desc, tentative desc limit 1;
  if not found then return 0; end if;
  insert into notes (critere_id, eleve_id, valeur)
  select k.id, el, round(5.0 * sum(case when public.qcm_juste(x, r.reponses) then 1 else 0 end) / count(*))::int::text
  from jsonb_array_elements(q.questions) x
  join criteres k on k.id = case when (x ->> 'critere') ~ '^\d{1,15}$' then (x ->> 'critere')::bigint end and k.contrat_id = q.contrat_id and k.actif
  group by k.id
  on conflict (critere_id, eleve_id) do update set valeur = excluded.valeur;
  get diagnostics n = row_count;
  perform public.qcm_infos_contrat(s.id);
  return n;
end $$;
revoke all on function public.qcm_vers_contrat(bigint, bigint) from public, anon, authenticated;

-- ouvrir (script 47) : note le début de la tentative
create or replace function public.eleve_qcm_ouvrir(jeton text, session bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record; n int;
begin
  e := public.eleve_de_session(jeton);
  select * into s from qcm_sessions where id = session and promotion_id = (select promotion_id from eleves where id = e);
  if not found then raise exception 'QCM introuvable.'; end if;
  if now() < s.ouverture then raise exception 'Ce QCM n’est pas encore ouvert.'; end if;
  if now() > s.fermeture then raise exception 'Ce QCM est fermé.'; end if;
  if not public.qcm_acces(s.id, e) then raise exception 'Ce QCM est bloqué : votre enseignant doit d’abord le débloquer.'; end if;
  select count(*) into n from qcm_reponses where session_id = s.id and eleve_id = e;
  if n >= public.qcm_tentatives(s.id, e) then
    raise exception 'Vous avez déjà fait ce QCM. Pour le refaire, demandez à votre enseignant une nouvelle tentative.'; end if;
  insert into qcm_debuts (session_id, eleve_id, tentative) values (s.id, e, n + 1) on conflict do nothing;
  select * into q from qcm where id = s.qcm_id;
  return json_build_object('session', s.id, 'titre', q.titre, 'consigne', q.consigne, 'melanger', s.melanger, 'fermeture', s.fermeture,
    'questions', (select coalesce(json_agg(json_build_object('id', x ->> 'id', 'type', x ->> 'type', 'texte', x ->> 'texte',
      'choix', (select coalesce(json_agg(json_build_object('id', c ->> 'id', 'texte', c ->> 'texte')), '[]') from jsonb_array_elements(x -> 'choix') c))), '[]')
      from jsonb_array_elements(q.questions) x));
end $$;

-- rendre (script 47) : enregistre aussi la durée de la tentative
create or replace function public.eleve_qcm_rendre(jeton text, session bigint, reponses jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record; n int; pts numeric; deb timestamptz;
begin
  e := public.eleve_de_session(jeton);
  select * into s from qcm_sessions where id = session and promotion_id = (select promotion_id from eleves where id = e);
  if not found then raise exception 'QCM introuvable.'; end if;
  if now() > s.fermeture + interval '10 minutes' then raise exception 'Ce QCM est fermé : vos réponses n’ont pas été enregistrées.'; end if;
  if not public.qcm_acces(s.id, e) then raise exception 'Ce QCM a été bloqué par votre enseignant : vos réponses n’ont pas été enregistrées.'; end if;
  select count(*) into n from qcm_reponses where session_id = s.id and eleve_id = e;
  if n >= public.qcm_tentatives(s.id, e) then raise exception 'Vous avez déjà fait ce QCM.'; end if;
  if jsonb_typeof(reponses) <> 'object' or length(reponses::text) > 50000 then raise exception 'Réponses illisibles.'; end if;
  select * into q from qcm where id = s.qcm_id;
  select debut into deb from qcm_debuts where session_id = s.id and eleve_id = e and tentative = n + 1;
  pts := public.qcm_noter(q.questions, reponses);
  insert into qcm_reponses (session_id, eleve_id, tentative, reponses, points, total, duree_s)
    values (s.id, e, n + 1, reponses, pts, jsonb_array_length(q.questions), case when deb is not null then extract(epoch from now() - deb)::int end);
  insert into consultations_eleves (eleve_id, quoi, titre) values (e, 'qcm', left(q.titre, 200));
  if s.vers_contrat then perform public.qcm_vers_contrat(s.id, e); end if;
  return public.eleve_qcm_correction(jeton, session);
end $$;
grant execute on function public.eleve_qcm_ouvrir(text, bigint), public.eleve_qcm_rendre(text, bigint, jsonb) to anon, authenticated;
