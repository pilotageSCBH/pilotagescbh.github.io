-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : DROITS PAR MATIÈRE, MAINTENANCE, ADMINISTRATEURS
--   - séquençage et progression d'une matière : modifiables UNIQUEMENT par les enseignants de cette matière
--     (un administrateur aussi, seulement pour ses propres matières) ;
--   - mode « Maintenance » : l'administrateur ferme temporairement le site à tous les autres comptes ;
--   - plusieurs administrateurs possibles ; il en reste toujours au moins un.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune saisie.)
-- =====================================================================================================

-- ----------------------------------------------------------------------------------------------- maintenance
create table if not exists public.reglages (
  id          int primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  message     text not null default '',
  depuis      timestamptz,
  par         text not null default ''
);
insert into public.reglages (id) values (1) on conflict do nothing;
alter table public.reglages enable row level security;
revoke all on public.reglages from anon;
grant select, update on public.reglages to authenticated;
drop policy if exists lecture on public.reglages;
drop policy if exists ecriture on public.reglages;
create policy lecture on public.reglages for select to authenticated using (true);
create policy ecriture on public.reglages for update to authenticated using (public.est_admin()) with check (public.est_admin());

-- le site est-il ouvert (pas de maintenance en cours) ?
create or replace function public.site_ouvert() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not maintenance from reglages where id = 1), true);
$$;
-- état du site, lisible même avant la connexion (écran de connexion)
create or replace function public.etat_site() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('maintenance', maintenance, 'message', message, 'depuis', depuis) from reglages where id = 1;
$$;
-- l'administrateur ouvre ou ferme le site
create or replace function public.mode_maintenance(actif boolean, texte text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  update reglages set maintenance = actif, message = coalesce(texte, ''), depuis = case when actif then now() end,
         par = coalesce((select coalesce(nullif(nom, ''), email) from profils where id = auth.uid()), '')
  where id = 1;
end $$;

-- pendant une maintenance, seuls les administrateurs restent actifs
create or replace function public.est_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif and (role = 'admin' or public.site_ouvert()));
$$;
create or replace function public.est_redacteur() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif and role <> 'lecture' and (role = 'admin' or public.site_ouvert()));
$$;

-- ----------------------------------------------------------------------------------------------- droits par matière
-- enseignant de la matière m (le rôle administrateur ne suffit pas)
create or replace function public.enseigne_matiere(m bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enseignants e join profils p on p.id = e.profil_id
    where p.id = auth.uid() and p.actif and p.role <> 'lecture' and m = any (e.matieres) and (p.role = 'admin' or public.site_ouvert()));
$$;
create or replace function public.enseigne_sequence(s bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.enseigne_matiere((select matiere_id from sequences where id = s)), false);
$$;
-- autres contenus d'une matière (fiches, contrats, notes, résultats, couvertures) : enseignant de la matière ou administrateur
create or replace function public.peut_matiere(m bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin() or public.enseigne_matiere(m);
$$;

drop policy if exists ecriture on public.sequences;
drop policy if exists ecriture on public.seances;
drop policy if exists ecriture on public.progression_cases;
create policy ecriture on public.sequences for all to authenticated using (public.enseigne_matiere(matiere_id)) with check (public.enseigne_matiere(matiere_id));
create policy ecriture on public.seances for all to authenticated using (public.enseigne_sequence(sequence_id)) with check (public.enseigne_sequence(sequence_id));
create policy ecriture on public.progression_cases for all to authenticated using (public.enseigne_matiere(matiere_id)) with check (public.enseigne_matiere(matiere_id));

-- comptes pas encore reliés à leur fiche « enseignant » : reliés automatiquement quand l'identifiant correspond au nom
-- (ex. brice.claudel ↔ Brice Claudel) ; sinon, à faire dans Administration → colonne « Enseignant lié »
update public.enseignants e set profil_id = p.id
from public.profils p
where e.profil_id is null
  and not exists (select 1 from public.enseignants x where x.profil_id = p.id)
  and translate(lower(replace(replace(split_part(p.email, '@', 1), '.', ' '), '-', ' ')), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')
    = translate(lower(replace(e.nom, '-', ' ')), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc');

-- opérations du séquençage : enseignants de la matière seulement
create or replace function public.ajouter_sequence(m bigint, p bigint) returns bigint
language plpgsql as $$
declare n int; s bigint;
begin
  if not public.enseigne_matiere(m) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  select coalesce(max(numero), 0) + 1 into n from sequences where matiere_id = m and promotion_id = p;
  if n > 10 then raise exception '10 séquences au maximum par matière.'; end if;
  insert into sequences (promotion_id, matiere_id, numero) values (p, m, n) returning id into s;
  insert into seances (sequence_id, numero) values (s, 1);
  return s;
end $$;

create or replace function public.supprimer_sequence(s bigint) returns void
language plpgsql as $$
declare m bigint; p bigint; n int;
begin
  select matiere_id, promotion_id, numero into m, p, n from sequences where id = s;
  if m is null then raise exception 'Séquence introuvable.'; end if;
  if not public.enseigne_matiere(m) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  delete from sequences where id = s;
  update sequences set numero = numero - 1 where matiere_id = m and promotion_id = p and numero > n;
end $$;

create or replace function public.inserer_seance(s bigint, apres int) returns bigint
language plpgsql as $$
declare r bigint;
begin
  if not public.enseigne_sequence(s) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  update seances set numero = numero + 1 where sequence_id = s and numero > apres;
  insert into seances (sequence_id, numero) values (s, apres + 1) returning id into r;
  return r;
end $$;

create or replace function public.supprimer_seance(x bigint) returns void
language plpgsql as $$
declare s bigint; n int;
begin
  select sequence_id, numero into s, n from seances where id = x;
  if s is null then raise exception 'Séance introuvable.'; end if;
  if not public.enseigne_sequence(s) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  if (select count(*) from seances where sequence_id = s) <= 1 then
    raise exception 'Une séquence doit garder au moins une séance.';
  end if;
  delete from seances where id = x;
  update seances set numero = numero - 1 where sequence_id = s and numero > n;
end $$;

create or replace function public.deplacer_seance(x bigint, nouveau int) returns void
language plpgsql as $$
declare s bigint; n int; nb int;
begin
  select sequence_id, numero into s, n from seances where id = x;
  if s is null then raise exception 'Séance introuvable.'; end if;
  if not public.enseigne_sequence(s) then raise exception 'Seuls les enseignants de cette matière peuvent modifier son séquençage.'; end if;
  select count(*) into nb from seances where sequence_id = s;
  nouveau := greatest(1, least(nouveau, nb));
  if nouveau = n then return; end if;
  if nouveau < n then
    update seances set numero = numero + 1 where sequence_id = s and numero >= nouveau and numero < n;
  else
    update seances set numero = numero - 1 where sequence_id = s and numero > n and numero <= nouveau;
  end if;
  update seances set numero = nouveau where id = x;
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
    insert into seances (sequence_id, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte)
    select s, numero, titre, duree, objectif_inter, objectifs_ops, cours, competences, savoirs, prerequis_texte
    from seances where sequence_id = q.id;
    nb := nb + 1;
  end loop;
  if nb = 0 then raise exception 'La promotion choisie n''a aucune séquence dans cette matière.'; end if;
  perform public.remapper_prerequis(source, cible);
  return nb;
end $$;

-- la reprise d'une promotion (administrateur) recopie les séquençages de toutes les matières
alter function public.copier_promotion(bigint, bigint, boolean, boolean, boolean, boolean) security definer set search_path = public;

-- ----------------------------------------------------------------------------------------------- administrateurs
-- il reste toujours au moins un administrateur actif
create or replace function public.garder_un_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profils where role = 'admin' and actif) then
    raise exception 'Il faut garder au moins un administrateur actif : nommez-en d''abord un autre.';
  end if;
  return null;
end $$;
drop trigger if exists garder_un_admin on public.profils;
create trigger garder_un_admin after update or delete on public.profils for each statement execute function public.garder_un_admin();

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
grant execute on function public.etat_site() to anon;
