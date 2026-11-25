-- =====================================================================================================
-- 47 · QCM : une seule tentative par élève, accès bloqué par défaut.
--   - Tous les QCM proposés aux élèves (« Ouvrir en ligne » et libre accès « Partager avec la classe ») :
--     une seule tentative par élève ; l'enseignant peut accorder des tentatives en plus à un élève, sur demande.
--   - L'accès est bloqué tant que l'enseignant ne le débloque pas, pour toute la classe ; il peut aussi bloquer ou
--     débloquer un élève en particulier.
--   - Les QCM déjà ouverts avant ce script restent débloqués (ils l'étaient déjà) mais passent à une tentative.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run), après les scripts 28 à 30. Relancer ne casse rien.
-- Aucune donnée d'élève dans ce script.
-- =====================================================================================================

-- contrôle de la fiche contrat couplée (script 30) : seulement à la création ou si le couplage change
-- (débloquer l'accès ou changer les dates ne demande pas d'être enseignant de la matière de la fiche)
create or replace function public.qcm_session_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  if new.vers_contrat and (tg_op = 'INSERT' or not old.vers_contrat or new.qcm_id <> old.qcm_id or new.promotion_id <> old.promotion_id) then
    select contrat_id into c from qcm where id = new.qcm_id;
    if c is null then new.vers_contrat := false;
    elsif public.contrat_promotion(c) is distinct from new.promotion_id then raise exception 'La fiche contrat couplée appartient à une autre promotion.';
    elsif not public.peut_matiere(public.contrat_matiere(c)) then raise exception 'Seul un enseignant de la matière peut remplir cette fiche contrat.';
    end if;
  end if;
  return new;
end $$;

alter table public.qcm_sessions add column if not exists libre boolean not null default false;
alter table public.qcm_sessions add column if not exists acces_ouvert boolean not null default false;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'qcm_sessions' and column_name = 'regle_47') then
    alter table public.qcm_sessions add column regle_47 boolean not null default true;
    update public.qcm_sessions set libre = (tentatives >= 20), acces_ouvert = true, tentatives = 1;
  end if;
end $$;
alter table public.qcm_sessions alter column tentatives set default 1;

-- réglages par élève : accès forcé (ouvert / bloqué, sinon celui de la classe) et tentatives accordées en plus
create table if not exists public.qcm_acces_eleves (
  session_id  bigint not null references public.qcm_sessions (id) on delete cascade,
  eleve_id    bigint not null references public.eleves (id) on delete cascade,
  acces       text check (acces in ('ouvert', 'bloque')),
  bonus       integer not null default 0 check (bonus between 0 and 50),
  maj_le      timestamptz not null default now(),
  primary key (session_id, eleve_id)
);
alter table public.qcm_acces_eleves enable row level security;
revoke all on public.qcm_acces_eleves from anon;
grant select, insert, update, delete on public.qcm_acces_eleves to authenticated;
drop policy if exists lecture on public.qcm_acces_eleves;
drop policy if exists ecriture on public.qcm_acces_eleves;
create policy lecture on public.qcm_acces_eleves for select to authenticated using (public.est_redacteur());
create policy ecriture on public.qcm_acces_eleves for all to authenticated
  using (public.est_redacteur() and exists (select 1 from qcm_sessions s where s.id = session_id and (s.proprietaire = auth.uid() or public.est_admin())))
  with check (public.est_redacteur() and exists (select 1 from qcm_sessions s where s.id = session_id and (s.proprietaire = auth.uid() or public.est_admin())));

-- l'élève e a-t-il accès à la passation ? combien de tentatives au total ?
create or replace function public.qcm_acces(sess bigint, e bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select a.acces = 'ouvert' from qcm_acces_eleves a where a.session_id = sess and a.eleve_id = e and a.acces is not null),
                  (select s.acces_ouvert from qcm_sessions s where s.id = sess), false);
$$;
create or replace function public.qcm_tentatives(sess bigint, e bigint) returns int
language sql stable security definer set search_path = public as $$
  select (select s.tentatives from qcm_sessions s where s.id = sess) + coalesce((select a.bonus from qcm_acces_eleves a where a.session_id = sess and a.eleve_id = e), 0);
$$;
revoke all on function public.qcm_acces(bigint, bigint), public.qcm_tentatives(bigint, bigint) from public, anon, authenticated;

-- QCM de sa promotion, avec l'accès et le nombre de tentatives de l'élève
create or replace function public.eleve_qcm_liste(jeton text) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; p bigint;
begin
  e := public.eleve_de_session(jeton);
  select promotion_id into p from eleves where id = e;
  return (select coalesce(json_agg(json_build_object('session', s.id, 'titre', q.titre, 'consigne', q.consigne, 'matiere_id', q.matiere_id,
      'ouverture', s.ouverture, 'fermeture', s.fermeture, 'tentatives', public.qcm_tentatives(s.id, e), 'acces', public.qcm_acces(s.id, e), 'libre', s.libre,
      'nb_questions', jsonb_array_length(q.questions),
      'faites', (select count(*) from qcm_reponses r where r.session_id = s.id and r.eleve_id = e),
      'meilleur', (select max(case when r.total > 0 then r.points / r.total * 20 end) from qcm_reponses r where r.session_id = s.id and r.eleve_id = e))
      order by s.fermeture desc), '[]')
    from qcm_sessions s join qcm q on q.id = s.qcm_id where s.promotion_id = p and s.ouverture <= now() + interval '14 days');
end $$;

create or replace function public.eleve_qcm_ouvrir(jeton text, session bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record;
begin
  e := public.eleve_de_session(jeton);
  select * into s from qcm_sessions where id = session and promotion_id = (select promotion_id from eleves where id = e);
  if not found then raise exception 'QCM introuvable.'; end if;
  if now() < s.ouverture then raise exception 'Ce QCM n’est pas encore ouvert.'; end if;
  if now() > s.fermeture then raise exception 'Ce QCM est fermé.'; end if;
  if not public.qcm_acces(s.id, e) then raise exception 'Ce QCM est bloqué : votre enseignant doit d’abord le débloquer.'; end if;
  if (select count(*) from qcm_reponses where session_id = s.id and eleve_id = e) >= public.qcm_tentatives(s.id, e) then
    raise exception 'Vous avez déjà fait ce QCM. Pour le refaire, demandez à votre enseignant une nouvelle tentative.'; end if;
  select * into q from qcm where id = s.qcm_id;
  return json_build_object('session', s.id, 'titre', q.titre, 'consigne', q.consigne, 'melanger', s.melanger, 'fermeture', s.fermeture,
    'questions', (select coalesce(json_agg(json_build_object('id', x ->> 'id', 'type', x ->> 'type', 'texte', x ->> 'texte',
      'choix', (select coalesce(json_agg(json_build_object('id', c ->> 'id', 'texte', c ->> 'texte')), '[]') from jsonb_array_elements(x -> 'choix') c))), '[]')
      from jsonb_array_elements(q.questions) x));
end $$;

-- rendre : mêmes contrôles (accès, tentatives), correction, fiche contrat couplée
create or replace function public.eleve_qcm_rendre(jeton text, session bigint, reponses jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record; n int; pts numeric;
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
  pts := public.qcm_noter(q.questions, reponses);
  insert into qcm_reponses (session_id, eleve_id, tentative, reponses, points, total) values (s.id, e, n + 1, reponses, pts, jsonb_array_length(q.questions));
  insert into consultations_eleves (eleve_id, quoi, titre) values (e, 'qcm', left(q.titre, 200));
  if s.vers_contrat then perform public.qcm_vers_contrat(s.id, e); end if;
  return public.eleve_qcm_correction(jeton, session);
end $$;

-- correction : le nombre de tentatives est celui de l'élève
create or replace function public.eleve_qcm_correction(jeton text, session bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record; r record;
begin
  e := public.eleve_de_session(jeton);
  select * into s from qcm_sessions where id = session and promotion_id = (select promotion_id from eleves where id = e);
  if not found then raise exception 'QCM introuvable.'; end if;
  select * into r from qcm_reponses where session_id = s.id and eleve_id = e order by tentative desc limit 1;
  if not found then raise exception 'Faites d’abord le QCM.'; end if;
  select * into q from qcm where id = s.qcm_id;
  return json_build_object('session', s.id, 'titre', q.titre, 'points', r.points, 'total', r.total, 'reponses', r.reponses, 'tentative', r.tentative,
    'tentatives', public.qcm_tentatives(s.id, e),
    'questions', (select coalesce(json_agg(json_build_object('id', x ->> 'id', 'type', x ->> 'type', 'texte', x ->> 'texte', 'explication', x ->> 'explication', 'savoir', x ->> 'savoir',
      'choix', (select coalesce(json_agg(json_build_object('id', c ->> 'id', 'texte', c ->> 'texte', 'bon', coalesce((c ->> 'bon')::boolean, false))), '[]') from jsonb_array_elements(x -> 'choix') c))), '[]')
      from jsonb_array_elements(q.questions) x));
end $$;
grant execute on function public.eleve_qcm_liste(text), public.eleve_qcm_ouvrir(text, bigint), public.eleve_qcm_rendre(text, bigint, jsonb), public.eleve_qcm_correction(text, bigint) to anon, authenticated;

-- aperçu enseignant : montre l'état d'accès réel de la classe
create or replace function public.apercu_qcm_liste(p bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  return (select coalesce(json_agg(json_build_object('session', q.id, 'titre', q.titre, 'consigne', q.consigne, 'matiere_id', q.matiere_id,
      'ouverture', s.ouverture, 'fermeture', s.fermeture, 'tentatives', 99, 'acces', s.acces_ouvert, 'libre', s.libre,
      'nb_questions', jsonb_array_length(q.questions), 'faites', 0, 'meilleur', null)
      order by s.fermeture desc), '[]')
    from qcm_sessions s join qcm q on q.id = s.qcm_id where s.promotion_id = p);
end $$;
grant execute on function public.apercu_qcm_liste(bigint) to authenticated;

-- la sauvegarde complète comprend les réglages d'accès par élève
create or replace function public.tables_sauvegarde() returns text[] language sql immutable as $$
  select array['activites', 'taches', 'competences', 'savoirs', 'durees', 'matieres', 'enseignants', 'promotions', 'eleves',
               'sequences', 'seances', 'progression_semaines', 'progression_jours', 'progression_cases', 'couverture',
               'fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'notes', 'commentaires', 'evaluations', 'resultats', 'appreciations',
               'cours', 'cours_partages', 'ressources_reglages', 'biblio_themes', 'biblio_livres', 'biblio_partages',
               'comptes_eleves', 'publications_eleves', 'qcm', 'qcm_partages', 'qcm_dossiers_partages', 'qcm_sessions', 'qcm_reponses',
               'qcm_acces_eleves', 'seances_realisees', 'competences_manuelles', 'epreuves', 'annonces'];
$$;
