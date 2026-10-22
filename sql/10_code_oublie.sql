-- =====================================================================================================
-- PILOTAGE BTS SCBH  ·  mise à jour : CODE OUBLIÉ
--   - code de secours personnel (créé dans « Mon compte ») : permet de choisir soi-même un nouveau code ;
--   - « Prévenir l'administrateur » depuis l'écran de connexion : la demande apparaît dans Administration ;
--   - un code provisoire donné par l'administrateur doit être changé à la connexion suivante.
--
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller tout ce fichier → Run.
-- (Relancer le script ne casse rien et ne supprime aucune donnée.)
-- =====================================================================================================

alter table public.profils add column if not exists doit_changer boolean not null default false;   -- code provisoire

-- codes de secours (seule leur empreinte est gardée) et essais manqués (blocage après 5 erreurs pendant 1 heure)
create table if not exists public.codes_secours (
  profil_id  uuid primary key references public.profils (id) on delete cascade,
  empreinte  text not null,
  cree_le    timestamptz not null default now(),
  echecs     int not null default 0,
  dernier_echec timestamptz
);
alter table public.codes_secours enable row level security;
revoke all on public.codes_secours from anon, authenticated;

-- demandes « code oublié » envoyées à l'administrateur
create table if not exists public.demandes_code (
  email    text primary key,
  quand    timestamptz not null default now()
);
alter table public.demandes_code enable row level security;
revoke all on public.demandes_code from anon, authenticated;
grant select, delete on public.demandes_code to authenticated;
drop policy if exists admin on public.demandes_code;
create policy admin on public.demandes_code for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- profil de l'utilisateur connecté (+ code provisoire à changer, code de secours créé ou non)
create or replace function public.mon_profil() returns json
language sql stable security definer set search_path = public as $$
  select row_to_json(p) from (
    select pr.id, pr.email, pr.nom, pr.role, pr.actif, pr.doit_changer,
           exists (select 1 from codes_secours s where s.profil_id = pr.id) as a_secours,
           coalesce((select array_agg(m order by m) from enseignants e, unnest(e.matieres) m where e.profil_id = pr.id), '{}') as matieres
    from profils pr where pr.id = auth.uid()) p;
$$;

-- l'administrateur donne un code provisoire (à changer à la connexion suivante) ; la demande éventuelle est close
create or replace function public.admin_nouveau_code(compte uuid, code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  if length(code) < 6 then raise exception 'Le code doit faire au moins 6 caractères.'; end if;
  update auth.users set encrypted_password = extensions.crypt(code, extensions.gen_salt('bf')) where id = compte;
  update profils set doit_changer = true where id = compte and id <> auth.uid();
  delete from demandes_code where email = (select email from profils where id = compte);
end $$;

-- après avoir choisi son propre code
create or replace function public.code_change() returns void
language sql security definer set search_path = public as $$
  update profils set doit_changer = false where id = auth.uid();
$$;

-- crée (ou remplace) le code de secours de l'utilisateur connecté ; il n'est affiché qu'une fois
create or replace function public.creer_code_secours() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare h text := upper(encode(extensions.gen_random_bytes(6), 'hex')); c text;
begin
  if not public.est_actif() then raise exception 'Compte inactif.'; end if;
  c := substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
  insert into codes_secours (profil_id, empreinte) values (auth.uid(), extensions.crypt(c, extensions.gen_salt('bf')))
  on conflict (profil_id) do update set empreinte = excluded.empreinte, cree_le = now(), echecs = 0, dernier_echec = null;
  return c;
end $$;

-- sans être connecté : nouveau code grâce au code de secours (renvoie false si le code de secours est faux)
drop function if exists public.code_par_secours(text, text, text);
create or replace function public.code_par_secours(identifiant text, secours text, code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare p profils%rowtype; s codes_secours%rowtype; saisi text := upper(regexp_replace(coalesce(secours, ''), '[^0-9A-Fa-f]', '', 'g'));
begin
  if length(coalesce(code, '')) < 6 then raise exception 'Le nouveau code doit contenir au moins 6 caractères.'; end if;
  select * into p from profils where email = lower(trim(identifiant)) and actif;
  if p.id is not null then select * into s from codes_secours where profil_id = p.id; end if;
  if s.profil_id is null then return false; end if;
  if s.echecs >= 5 and s.dernier_echec > now() - interval '1 hour' then
    raise exception 'Trop d''essais : réessayez dans une heure, ou prévenez l''administrateur.';
  end if;
  saisi := substr(saisi, 1, 4) || '-' || substr(saisi, 5, 4) || '-' || substr(saisi, 9, 4);
  if s.empreinte <> extensions.crypt(saisi, s.empreinte) then
    update codes_secours set echecs = case when dernier_echec > now() - interval '1 hour' then echecs + 1 else 1 end, dernier_echec = now()
    where profil_id = p.id;
    return false;                             -- l'échec est enregistré (pas d'erreur : elle l'annulerait)
  end if;
  update auth.users set encrypted_password = extensions.crypt(code, extensions.gen_salt('bf')) where id = p.id;
  update codes_secours set echecs = 0, dernier_echec = null where profil_id = p.id;
  update profils set doit_changer = false where id = p.id;
  delete from demandes_code where email = p.email;
  return true;
end $$;

-- sans être connecté : prévenir l'administrateur (rien n'est révélé sur l'existence du compte)
create or replace function public.demander_code(identifiant text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profils where email = lower(trim(identifiant)) and actif) then
    insert into demandes_code (email) values (lower(trim(identifiant))) on conflict (email) do update set quand = now();
  end if;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
grant execute on function public.code_par_secours(text, text, text) to anon;
grant execute on function public.demander_code(text) to anon;
