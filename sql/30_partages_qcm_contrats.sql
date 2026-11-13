-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour 30 : PARTAGES, PUBLICATION AUTOMATIQUE DES COURS, QCM COUPLÉS AUX CONTRATS
-- 1. Les documents de « Ma bibliothèque » peuvent, comme ceux de « Mes cours », être publiés aux élèves d'une promotion
--    (un document ou un dossier entier).
-- 2. Les cours mobilisés d'une séance placée dans la progression sont publiés automatiquement aux élèves de la promotion
--    le lundi de la semaine prévue, à 6 h (heure de Paris). Si la progression ou le séquençage change, les cours déjà
--    publiés le restent. Chaque enseignant peut désactiver cette publication automatique (réglages de Mes cours).
-- 3. QCM : rangement en dossiers, partage d'un dossier entier avec des collègues ; un QCM peut être couplé à une fiche
--    contrat (une série de questions par critère) et remplir automatiquement les notes de cette fiche.
-- Nécessite les scripts 25 à 29.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune saisie.)
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------- 1 et 2 : publication aux élèves
alter table public.ressources_reglages add column if not exists partage_auto boolean not null default true;
alter table public.publications_eleves add column if not exists origine text not null default 'manuel';

-- publication manuelle : documents de Mes cours ou de Ma bibliothèque de l'enseignant
drop policy if exists ecriture on public.publications_eleves;
create policy ecriture on public.publications_eleves for all to authenticated
  using (proprietaire = auth.uid() and public.est_redacteur())
  with check (proprietaire = auth.uid() and public.est_redacteur()
    and (livre_id is null or exists (select 1 from public.biblio_livres l where l.id = livre_id and l.proprietaire = auth.uid()))
    and (theme_id is null or exists (select 1 from public.biblio_themes t where t.id = theme_id and t.proprietaire = auth.uid())));

-- lundi de la semaine w de la promotion qui commence l'année y (même calcul que le site) ; moment de publication : 6 h
create or replace function public.lundi_semaine(y int, w int) returns date language sql immutable as $$
  select make_date(y + w / 45, 9, 1) - (extract(isodow from make_date(y + w / 45, 9, 1))::int - 1) + 7 * (w % 45);
$$;
create or replace function public.moment_semaine(y int, w int) returns timestamptz language sql stable as $$
  select (public.lundi_semaine(y, w) + time '06:00') at time zone 'Europe/Paris';
$$;

-- cours mobilisés dans les séances placées dans la progression d'une promotion, avec leur moment de publication
create or replace function public.cours_auto(p bigint) returns table (livre_id bigint, le timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, min(public.moment_semaine(pr.annee_debut, c.semaine))
  from progression_cases c
  join promotions pr on pr.id = c.promotion_id
  join seances s on s.id = c.seance_id or s.id = c.seance2_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.cours_lies) = 'array' then s.cours_lies else '[]'::jsonb end) e
  join biblio_livres l on l.id = case when (e ->> 'id') ~ '^\d{1,15}$' then (e ->> 'id')::bigint end and l.espace = 'cours'
  where c.promotion_id = p
    and coalesce((select g.partage_auto from ressources_reglages g where g.proprietaire = l.proprietaire), true)
  group by l.id;
$$;

-- documents visibles des élèves d'une promotion : publiés à la main (Mes cours ou Ma bibliothèque, un document ou un
-- dossier et ses sous-dossiers) ou publiés automatiquement par la progression
create or replace function public.livres_publies(p bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  with recursive pub as (select * from publications_eleves where promotion_id = p and (a_partir_de is null or a_partir_de <= current_date)),
  arbre as (
    select t.id from biblio_themes t join pub on pub.theme_id = t.id
    union
    select t.id from biblio_themes t join arbre a on t.parent_id = a.id)
  select l.id from biblio_livres l where l.id in (select pub.livre_id from pub) or l.theme_id in (select id from arbre)
  union
  select a.livre_id from public.cours_auto(p) a where a.le <= now();
$$;

-- les cours déjà publiés restent publiés quand la progression ou le séquençage change
create or replace function public.figer_cours(p bigint, w int, cours jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p is null or w is null or cours is null or jsonb_typeof(cours) <> 'array' or jsonb_array_length(cours) = 0 then return; end if;
  if public.moment_semaine((select annee_debut from promotions where id = p), w) > now() then return; end if;
  insert into publications_eleves (proprietaire, livre_id, promotion_id, origine)
  select distinct l.proprietaire, l.id, p, 'auto'
  from jsonb_array_elements(cours) e
  join biblio_livres l on l.id = case when (e ->> 'id') ~ '^\d{1,15}$' then (e ->> 'id')::bigint end and l.espace = 'cours'
  where coalesce((select g.partage_auto from ressources_reglages g where g.proprietaire = l.proprietaire), true)
  on conflict (livre_id, promotion_id) where livre_id is not null do nothing;
end $$;
create or replace function public.figer_case() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.figer_cours(old.promotion_id, old.semaine, (select cours_lies from seances where id = old.seance_id));
    perform public.figer_cours(old.promotion_id, old.semaine, (select cours_lies from seances where id = old.seance2_id));
    return old;
  end if;
  if old.seance_id is distinct from new.seance_id or old.semaine <> new.semaine or old.promotion_id <> new.promotion_id then
    perform public.figer_cours(old.promotion_id, old.semaine, (select cours_lies from seances where id = old.seance_id));
  end if;
  if old.seance2_id is distinct from new.seance2_id or old.semaine <> new.semaine or old.promotion_id <> new.promotion_id then
    perform public.figer_cours(old.promotion_id, old.semaine, (select cours_lies from seances where id = old.seance2_id));
  end if;
  return new;
end $$;
drop trigger if exists figer_cours on public.progression_cases;
create trigger figer_cours before update or delete on public.progression_cases for each row execute function public.figer_case();
create or replace function public.figer_seance() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if tg_op = 'UPDATE' and new.cours_lies is not distinct from old.cours_lies then return new; end if;
  for c in select promotion_id, semaine from progression_cases where seance_id = old.id or seance2_id = old.id loop
    perform public.figer_cours(c.promotion_id, c.semaine, old.cours_lies);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists figer_cours on public.seances;
create trigger figer_cours before update or delete on public.seances for each row execute function public.figer_seance();

-- enseignant : ses cours publiés (ou à publier) automatiquement, par promotion
create or replace function public.cours_auto_miens() returns table (livre_id bigint, promotion_id bigint, le timestamptz)
language sql stable security definer set search_path = public as $$
  select a.livre_id, p.id, a.le from promotions p cross join lateral public.cours_auto(p.id) a
  join biblio_livres l on l.id = a.livre_id
  where public.est_redacteur() and l.proprietaire = auth.uid();
$$;

-- ouverture d'un document par un élève : lien du dossier Nuage de l'espace concerné
create or replace function public.eleve_document(jeton text, livre bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; l record; g record;
begin
  e := public.eleve_de_session(jeton);
  if livre not in (select livre_id from public.eleve_livres_visibles(e)) then raise exception 'Document non publié pour votre promotion.'; end if;
  select * into l from biblio_livres where id = livre;
  select * into g from ressources_reglages where proprietaire = l.proprietaire;
  insert into consultations_eleves (eleve_id, quoi, livre_id, titre) values (e, 'document', l.id, left(l.titre, 200));
  return json_build_object('lien', coalesce(case when l.espace = 'biblio' then g.lien_bibliotheque else g.lien_cours end, ''), 'chemin', l.chemin, 'lien_direct', l.lien, 'titre', l.titre);
end $$;

-- données de l'espace élève (documents : espace d'origine ; livres de la bibliothèque marqués « livre »)
create or replace function public.donnees_eleve(e bigint, c bigint, p bigint, apercu boolean) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json; ap json := '[]';
begin
  -- appréciations : seulement si la table existe (script 15)
  if e is not null and to_regclass('public.appreciations') is not null then
    execute 'select coalesce(json_agg(json_build_object(''matiere_id'', a.matiere_id, ''texte'', a.texte)), ''[]'') from public.appreciations a where a.eleve_id = $1' into ap using e;
  end if;
  with seqs as (select * from sequences where promotion_id = p),
  seas as (select x.* from seances x join seqs s on s.id = x.sequence_id),
  ctr as (select * from contrats where promotion_id = p or sequence_id in (select id from seqs) or seance_id in (select id from seas)),
  crit as (select k.id, k.contrat_id, k.groupe, k.groupe_ordre, k.ordre, k.texte, k.coefficient from criteres k where k.actif and k.contrat_id in (select id from ctr)),
  livres as (select l.* from biblio_livres l where l.id in (select livre_id from public.livres_publies(p))),
  themes as (
    with recursive t0 as (select t.* from biblio_themes t where t.id in (select theme_id from livres)
      union select t.* from biblio_themes t join t0 on t.id = t0.parent_id)
    select distinct id, parent_id, nom, ordre, proprietaire from t0)
  select json_build_object(
    'eleve', case when apercu then json_build_object('id', 0, 'nom', 'FICTIF', 'prenom', 'Élève', 'statut', 'Scolaire', 'promotion_id', p, 'redoublant', false)
      else (select json_build_object('id', x.id, 'nom', x.nom, 'prenom', x.prenom, 'statut', x.statut, 'promotion_id', x.promotion_id, 'redoublant', x.redoublant) from eleves x where x.id = e) end,
    'compte', case when apercu then json_build_object('identifiant', 'eleve.fictif', 'fin_acces', (select make_date(annee_debut + 2, 7, 31) from promotions where id = p))
      else (select json_build_object('identifiant', k.identifiant, 'fin_acces', public.eleve_fin_acces(k.eleve_id)) from comptes_eleves k where k.eleve_id = c) end,
    'promotions', (select json_agg(row_to_json(x)) from promotions x where x.id = p),
    'matieres', (select coalesce(json_agg(row_to_json(m) order by m.ordre), '[]') from matieres m),
    'enseignants', (select coalesce(json_agg(json_build_object('id', x.id, 'nom', x.nom, 'matieres', x.matieres, 'profil_id', x.profil_id) order by x.ordre), '[]') from enseignants x),
    'competences', (select coalesce(json_agg(json_build_object('code', x.code, 'libelle', x.libelle, 'libelle_court', x.libelle_court, 'ordre', x.ordre) order by x.ordre), '[]') from competences x),
    'savoirs', (select coalesce(json_agg(json_build_object('code', x.code, 'libelle', x.libelle, 'libelle_court', x.libelle_court, 'ordre', x.ordre) order by x.ordre), '[]') from savoirs x),
    'sequences', (select coalesce(json_agg(json_build_object('id', s.id, 'matiere_id', s.matiere_id, 'numero', s.numero, 'intitule', s.intitule, 'objectif', s.objectif, 'promotion_id', s.promotion_id) order by s.matiere_id, s.numero), '[]') from seqs s),
    'seances', (select coalesce(json_agg(json_build_object('id', x.id, 'sequence_id', x.sequence_id, 'numero', x.numero, 'titre', x.titre, 'duree', x.duree, 'objectif_inter', x.objectif_inter,
        'savoirs', x.savoirs, 'competences', x.competences, 'cours_lies', (select coalesce(json_agg(json_build_object('id', (cl ->> 'id')::bigint, 'titre', cl ->> 'titre')), '[]')
          from jsonb_array_elements(coalesce(x.cours_lies, '[]')) cl where (cl ->> 'id') ~ '^\d+$' and (cl ->> 'id')::bigint in (select id from livres)))
        order by x.sequence_id, x.numero), '[]') from seas x),
    'progression_semaines', (select coalesce(json_agg(row_to_json(x)), '[]') from progression_semaines x where x.promotion_id = p),
    'progression_jours', (select coalesce(json_agg(row_to_json(x)), '[]') from progression_jours x where x.promotion_id = p),
    'progression_cases', (select coalesce(json_agg(json_build_object('promotion_id', x.promotion_id, 'matiere_id', x.matiere_id, 'semaine', x.semaine, 'seance_id', x.seance_id, 'seance2_id', x.seance2_id, 'texte', x.texte)), '[]') from progression_cases x where x.promotion_id = p),
    'contrats', (select coalesce(json_agg(json_build_object('id', x.id, 'type', x.type, 'sequence_id', x.sequence_id, 'seance_id', x.seance_id, 'date_eval', x.date_eval, 'forme', x.forme,
        'lieu', x.lieu, 'duree', x.duree, 'titre', x.titre, 'matiere_id', x.matiere_id, 'promotion_id', x.promotion_id, 'coef_resultat', x.coef_resultat)), '[]') from ctr x),
    'criteres', (select coalesce(json_agg(row_to_json(k)), '[]') from crit k),
    'notes', (select coalesce(json_agg(json_build_object('critere_id', n.critere_id, 'eleve_id', n.eleve_id, 'valeur', n.valeur)), '[]') from notes n where n.eleve_id = e and n.critere_id in (select id from crit)),
    'evaluations', (select coalesce(json_agg(json_build_object('id', v.id, 'matiere_id', v.matiere_id, 'libelle', v.libelle, 'date_eval', v.date_eval, 'coefficient', v.coefficient, 'bareme', v.bareme, 'promotion_id', v.promotion_id)), '[]') from evaluations v where v.promotion_id = p),
    'resultats', (select coalesce(json_agg(row_to_json(x)), '[]') from resultats x where x.eleve_id = e),
    'appreciations', ap,
    'documents', (select coalesce(json_agg(json_build_object('id', l.id, 'titre', l.titre, 'genre', case when l.espace = 'biblio' then 'livre' else l.genre end, 'espace', l.espace, 'theme_id', l.theme_id, 'sommaire', l.sommaire, 'savoirs', l.savoirs,
        'pages', l.pages, 'vignette', l.vignette, 'ordre', l.ordre, 'extension', lower(substring(coalesce(nullif(l.chemin, ''), l.lien) from '\.([A-Za-z0-9]{1,5})$')),
        'fichier', (l.chemin <> '' or l.lien <> ''), 'auteur', (select nom from profils where id = l.proprietaire),
        'chemin', case when apercu then l.chemin end, 'lien', case when apercu then l.lien end, 'proprietaire', case when apercu then l.proprietaire end) order by l.ordre, l.titre), '[]') from livres l),
    'dossiers', (select coalesce(json_agg(json_build_object('id', t.id, 'parent_id', t.parent_id, 'nom', t.nom, 'ordre', t.ordre)), '[]') from themes t)
  ) into r;
  return r;
end $$;

revoke all on function public.cours_auto(bigint), public.figer_cours(bigint, int, jsonb), public.livres_publies(bigint),
  public.donnees_eleve(bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.cours_auto_miens() to authenticated;
grant execute on function public.lundi_semaine(int, int), public.moment_semaine(int, int) to authenticated;

-- ------------------------------------------------------------------------------------------- 3 : QCM
alter table public.qcm add column if not exists dossier text not null default '';
alter table public.qcm add column if not exists contrat_id bigint references public.contrats (id) on delete set null;
alter table public.qcm_sessions add column if not exists vers_contrat boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qcm_dossier_taille') then
    alter table public.qcm add constraint qcm_dossier_taille check (length(dossier) <= 200) not valid;
  end if;
end $$;

-- partage d'un dossier entier de QCM (destinataire vide = toute l'équipe) : vaut aussi pour les QCM ajoutés plus tard
create table if not exists public.qcm_dossiers_partages (
  id            bigint generated by default as identity primary key,
  proprietaire  uuid not null default auth.uid() references public.profils (id) on delete cascade,
  dossier       text not null check (length(dossier) between 1 and 200),
  destinataire  uuid references public.profils (id) on delete cascade
);
create unique index if not exists qcm_dossiers_partages_u on public.qcm_dossiers_partages (proprietaire, dossier, coalesce(destinataire, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.qcm_dossiers_partages enable row level security;
revoke all on public.qcm_dossiers_partages from anon;
grant select, insert, update, delete on public.qcm_dossiers_partages to authenticated;
drop policy if exists lecture on public.qcm_dossiers_partages;
drop policy if exists ecriture on public.qcm_dossiers_partages;
create policy lecture on public.qcm_dossiers_partages for select to authenticated using (proprietaire = auth.uid() or destinataire = auth.uid() or destinataire is null);
create policy ecriture on public.qcm_dossiers_partages for all to authenticated
  using (proprietaire = auth.uid() and public.est_redacteur()) with check (proprietaire = auth.uid() and public.est_redacteur());

create or replace function public.qcm_visible(q bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_redacteur() and exists (select 1 from qcm x where x.id = q and (x.proprietaire = auth.uid() or x.partage_tous
    or exists (select 1 from qcm_partages p where p.qcm_id = x.id and p.destinataire = auth.uid())
    or (x.dossier <> '' and exists (select 1 from qcm_dossiers_partages d where d.proprietaire = x.proprietaire and d.dossier = x.dossier
          and (d.destinataire = auth.uid() or d.destinataire is null)))));
$$;

-- promotion et matière d'une fiche contrat (séquence, séance ou hors séquence)
create or replace function public.contrat_promotion(c bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(k.promotion_id, s1.promotion_id, s2.promotion_id) from contrats k
  left join sequences s1 on s1.id = k.sequence_id
  left join seances x on x.id = k.seance_id left join sequences s2 on s2.id = x.sequence_id
  where k.id = c;
$$;
create or replace function public.contrat_matiere(c bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(k.matiere_id, s1.matiere_id, s2.matiere_id) from contrats k
  left join sequences s1 on s1.id = k.sequence_id
  left join seances x on x.id = k.seance_id left join sequences s2 on s2.id = x.sequence_id
  where k.id = c;
$$;
grant execute on function public.contrat_promotion(bigint), public.contrat_matiere(bigint) to authenticated;

-- une question est juste si les réponses cochées sont exactement les bonnes
create or replace function public.qcm_juste(x jsonb, reponses jsonb) returns boolean language sql immutable as $$
  select (select coalesce(array_agg(c ->> 'id' order by c ->> 'id'), '{}') from jsonb_array_elements(x -> 'choix') c where (c ->> 'bon')::boolean)
       = (select coalesce(array_agg(v order by v), '{}') from jsonb_array_elements_text(coalesce(reponses -> (x ->> 'id'), '[]')) v);
$$;

-- notes de la fiche contrat couplée pour un élève (meilleure tentative) : pour chaque critère, la part de questions
-- justes de sa série, ramenée de 0 à 5 ; renvoie le nombre de notes écrites
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
  return n;
end $$;
revoke all on function public.qcm_vers_contrat(bigint, bigint) from public, anon, authenticated;

-- enseignant : remplir (ou mettre à jour) la fiche contrat couplée avec les résultats d'une passation
create or replace function public.qcm_remplir_contrat(session bigint) returns int
language plpgsql security definer set search_path = public as $$
declare s record; q record; e bigint; n int := 0;
begin
  select * into s from qcm_sessions where id = session;
  if not found then raise exception 'Passation introuvable.'; end if;
  select * into q from qcm where id = s.qcm_id;
  if q.contrat_id is null then raise exception 'Ce QCM n''est couplé à aucune fiche contrat.'; end if;
  if public.contrat_promotion(q.contrat_id) is distinct from s.promotion_id then raise exception 'La fiche contrat couplée n''est pas celle de cette promotion.'; end if;
  if not public.peut_matiere(public.contrat_matiere(q.contrat_id)) then raise exception 'Vous ne pouvez pas noter cette fiche contrat (matière d''un autre enseignant).'; end if;
  for e in select distinct eleve_id from qcm_reponses where session_id = s.id loop
    n := n + public.qcm_vers_contrat(s.id, e);
  end loop;
  return n;
end $$;
grant execute on function public.qcm_remplir_contrat(bigint) to authenticated;

-- une passation qui remplit une fiche contrat : réservée à un enseignant de la matière du contrat
create or replace function public.qcm_session_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  if new.vers_contrat then
    select contrat_id into c from qcm where id = new.qcm_id;
    if c is null then new.vers_contrat := false;
    elsif public.contrat_promotion(c) is distinct from new.promotion_id then raise exception 'La fiche contrat couplée appartient à une autre promotion.';
    elsif not public.peut_matiere(public.contrat_matiere(c)) then raise exception 'Seul un enseignant de la matière peut remplir cette fiche contrat.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists qcm_session_controle on public.qcm_sessions;
create trigger qcm_session_controle before insert or update on public.qcm_sessions for each row execute function public.qcm_session_controle();

-- l'élève rend ses réponses : correction, et notes de la fiche contrat couplée si la passation le prévoit
create or replace function public.eleve_qcm_rendre(jeton text, session bigint, reponses jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; s record; q record; n int; pts numeric;
begin
  e := public.eleve_de_session(jeton);
  select * into s from qcm_sessions where id = session and promotion_id = (select promotion_id from eleves where id = e);
  if not found then raise exception 'QCM introuvable.'; end if;
  if now() > s.fermeture + interval '10 minutes' then raise exception 'Ce QCM est fermé : vos réponses n’ont pas été enregistrées.'; end if;
  select count(*) into n from qcm_reponses where session_id = s.id and eleve_id = e;
  if n >= s.tentatives then raise exception 'Vous avez déjà fait ce QCM.'; end if;
  if jsonb_typeof(reponses) <> 'object' or length(reponses::text) > 50000 then raise exception 'Réponses illisibles.'; end if;
  select * into q from qcm where id = s.qcm_id;
  pts := public.qcm_noter(q.questions, reponses);
  insert into qcm_reponses (session_id, eleve_id, tentative, reponses, points, total) values (s.id, e, n + 1, reponses, pts, jsonb_array_length(q.questions));
  insert into consultations_eleves (eleve_id, quoi, titre) values (e, 'qcm', left(q.titre, 200));
  if s.vers_contrat then perform public.qcm_vers_contrat(s.id, e); end if;
  return public.eleve_qcm_correction(jeton, session);
end $$;
grant execute on function public.eleve_qcm_rendre(text, bigint, jsonb) to anon, authenticated;

-- la sauvegarde complète comprend les partages de dossiers de QCM
create or replace function public.tables_sauvegarde() returns text[] language sql immutable as $$
  select array['activites', 'taches', 'competences', 'savoirs', 'durees', 'matieres', 'enseignants', 'promotions', 'eleves',
               'sequences', 'seances', 'progression_semaines', 'progression_jours', 'progression_cases', 'couverture',
               'fiches_sequence', 'fiches_seance', 'contrats', 'criteres', 'notes', 'commentaires', 'evaluations', 'resultats', 'appreciations',
               'cours', 'cours_partages', 'ressources_reglages', 'biblio_themes', 'biblio_livres', 'biblio_partages',
               'comptes_eleves', 'publications_eleves', 'qcm', 'qcm_partages', 'qcm_dossiers_partages', 'qcm_sessions', 'qcm_reponses'];
$$;
