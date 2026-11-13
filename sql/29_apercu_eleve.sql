-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour 29 : APERÇU ÉLÈVE POUR LES ENSEIGNANTS
-- Un enseignant peut voir l'espace élève d'une promotion « comme un élève fictif » (semaine, formation, documents
-- publiés, QCM) et faire un QCM pour le tester : rien n'est enregistré, aucune donnée d'élève réel n'est montrée.
-- Nécessite les scripts 27 et 28.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien.)
-- =====================================================================================================

-- documents publiés pour une promotion (un document, ou tout un dossier et ses sous-dossiers)
create or replace function public.livres_publies(p bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  with recursive pub as (select * from publications_eleves where promotion_id = p and (a_partir_de is null or a_partir_de <= current_date)),
  arbre as (
    select t.id from biblio_themes t join pub on pub.theme_id = t.id where t.espace = 'cours'
    union
    select t.id from biblio_themes t join arbre a on t.parent_id = a.id)
  select l.id from biblio_livres l where l.espace = 'cours' and (l.id in (select pub.livre_id from pub) or l.theme_id in (select id from arbre));
$$;
create or replace function public.eleve_livres_visibles(e bigint) returns table (livre_id bigint)
language sql stable security definer set search_path = public as $$
  select livre_id from public.livres_publies((select promotion_id from eleves where id = e));
$$;

-- données de l'espace élève : un élève (ses données) ou un élève fictif (aperçu enseignant : aucune note)
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
    'documents', (select coalesce(json_agg(json_build_object('id', l.id, 'titre', l.titre, 'genre', l.genre, 'theme_id', l.theme_id, 'sommaire', l.sommaire, 'savoirs', l.savoirs,
        'pages', l.pages, 'vignette', l.vignette, 'ordre', l.ordre, 'extension', lower(substring(coalesce(nullif(l.chemin, ''), l.lien) from '\.([A-Za-z0-9]{1,5})$')),
        'fichier', (l.chemin <> '' or l.lien <> ''), 'auteur', (select nom from profils where id = l.proprietaire),
        'chemin', case when apercu then l.chemin end, 'lien', case when apercu then l.lien end, 'proprietaire', case when apercu then l.proprietaire end) order by l.ordre, l.titre), '[]') from livres l),
    'dossiers', (select coalesce(json_agg(json_build_object('id', t.id, 'parent_id', t.parent_id, 'nom', t.nom, 'ordre', t.ordre)), '[]') from themes t)
  ) into r;
  return r;
end $$;

create or replace function public.eleve_donnees(jeton text) returns json
language plpgsql security definer set search_path = public as $$
declare e bigint; c bigint; p bigint;
begin
  e := public.eleve_de_session(jeton);
  select s.eleve_id into c from sessions_eleves s where s.jeton_hash = encode(extensions.digest(jeton, 'sha256'), 'hex');
  select promotion_id into p from eleves where id = e;
  return public.donnees_eleve(e, c, p, false);
end $$;

-- ------------------------------------------------------------------------------------------- aperçu (enseignants)
create or replace function public.apercu_eleve_donnees(p bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  return public.donnees_eleve(null, null, p, true);
end $$;
-- QCM ouverts (ou prévus, ou passés) pour la promotion ; l'aperçu travaille sur le QCM lui-même (session = numéro du QCM)
create or replace function public.apercu_qcm_liste(p bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  return (select coalesce(json_agg(json_build_object('session', q.id, 'titre', q.titre, 'consigne', q.consigne, 'matiere_id', q.matiere_id,
      'ouverture', s.ouverture, 'fermeture', s.fermeture, 'tentatives', 99, 'nb_questions', jsonb_array_length(q.questions), 'faites', 0, 'meilleur', null)
      order by s.fermeture desc), '[]')
    from qcm_sessions s join qcm q on q.id = s.qcm_id where s.promotion_id = p);
end $$;
create or replace function public.apercu_qcm_ouvrir(q bigint) returns json
language plpgsql stable security definer set search_path = public as $$
declare x record;
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  select * into x from qcm where id = q;
  if not found or not public.qcm_visible(q) then raise exception 'QCM introuvable.'; end if;
  return json_build_object('session', x.id, 'titre', x.titre, 'consigne', x.consigne, 'melanger', true, 'fermeture', now() + interval '1 day',
    'questions', (select coalesce(json_agg(json_build_object('id', y ->> 'id', 'type', y ->> 'type', 'texte', y ->> 'texte',
      'choix', (select coalesce(json_agg(json_build_object('id', c ->> 'id', 'texte', c ->> 'texte')), '[]') from jsonb_array_elements(y -> 'choix') c))), '[]')
      from jsonb_array_elements(x.questions) y));
end $$;
-- correction de l'aperçu : rien n'est enregistré
create or replace function public.apercu_qcm_rendre(q bigint, reponses jsonb) returns json
language plpgsql stable security definer set search_path = public as $$
declare x record;
begin
  if not public.est_redacteur() then raise exception 'Réservé aux enseignants.'; end if;
  select * into x from qcm where id = q;
  if not found or not public.qcm_visible(q) then raise exception 'QCM introuvable.'; end if;
  return json_build_object('session', x.id, 'titre', x.titre, 'points', public.qcm_noter(x.questions, coalesce(reponses, '{}')), 'total', jsonb_array_length(x.questions),
    'reponses', coalesce(reponses, '{}'), 'tentative', 1, 'tentatives', 99,
    'questions', (select coalesce(json_agg(json_build_object('id', y ->> 'id', 'type', y ->> 'type', 'texte', y ->> 'texte', 'explication', y ->> 'explication', 'savoir', y ->> 'savoir',
      'choix', (select coalesce(json_agg(json_build_object('id', c ->> 'id', 'texte', c ->> 'texte', 'bon', coalesce((c ->> 'bon')::boolean, false))), '[]') from jsonb_array_elements(y -> 'choix') c))), '[]')
      from jsonb_array_elements(x.questions) y));
end $$;

revoke all on function public.donnees_eleve(bigint, bigint, bigint, boolean), public.livres_publies(bigint) from public, anon, authenticated;
grant execute on function public.apercu_eleve_donnees(bigint), public.apercu_qcm_liste(bigint), public.apercu_qcm_ouvrir(bigint), public.apercu_qcm_rendre(bigint, jsonb) to authenticated;
