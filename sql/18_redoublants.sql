-- 18 · Élèves redoublants : un élève d'une promotion précédente rejoint la promotion en cours (en général au début
-- de sa 2e année). Sa fiche est recopiée dans la nouvelle promotion, reliée à sa fiche d'origine (qui reste intacte,
-- avec ses notes et ses compétences), et marquée « redoublant » avec sa date d'arrivée.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Sans effet sur les données existantes.

alter table public.eleves add column if not exists redoublant           boolean not null default false;
alter table public.eleves add column if not exists date_arrivee         date;
alter table public.eleves add column if not exists origine_eleve_id     bigint references public.eleves (id) on delete set null;
alter table public.eleves add column if not exists origine_promotion_id bigint references public.promotions (id) on delete set null;
alter table public.eleves add column if not exists devenir              text not null default '';

comment on column public.eleves.redoublant is 'Élève qui redouble (vient d''une promotion précédente ou d''un autre établissement)';
comment on column public.eleves.date_arrivee is 'Date d''arrivée dans la promotion : les évaluations antérieures ne le concernent pas';
comment on column public.eleves.origine_eleve_id is 'Fiche de l''élève dans sa promotion d''origine (notes et compétences antérieures)';
comment on column public.eleves.devenir is 'Suite du parcours, renseignée sur la fiche d''origine (ex. « Redouble avec la promotion 2026-2028 »)';

-- un élève d'origine ne peut être accueilli qu'une fois dans une même promotion
create unique index if not exists eleves_origine_unique on public.eleves (promotion_id, origine_eleve_id) where origine_eleve_id is not null;
create index if not exists eleves_origine on public.eleves (origine_eleve_id);

-- accueillir des redoublants : recopie les fiches choisies dans la promotion cible (administrateur)
-- choix : [{ "id": 12, "statut": "Scolaire" }, …]   (statut facultatif : sinon celui d'origine)
create or replace function public.accueillir_redoublants(p_cible bigint, choix jsonb, p_date date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c jsonb; o eleves; cible promotions; n integer := 0; st text;
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur'; end if;
  select * into cible from promotions where id = p_cible;
  if cible.id is null then raise exception 'Promotion introuvable'; end if;
  for c in select * from jsonb_array_elements(coalesce(choix, '[]'::jsonb)) loop
    select * into o from eleves where id = (c->>'id')::bigint;
    if o.id is null then continue; end if;
    if o.promotion_id = p_cible then raise exception '% % est déjà dans cette promotion', o.nom, o.prenom; end if;
    if exists (select 1 from eleves where promotion_id = p_cible and origine_eleve_id = o.id) then continue; end if;
    st := coalesce(nullif(c->>'statut', ''), o.statut);
    if st not in ('Scolaire', 'Apprenti') then st := o.statut; end if;
    insert into eleves (promotion_id, nom, prenom, naissance, statut, telephone, mail, commune, code_postal, departement,
                        entreprise, entreprise_commune, entreprise_cp, etudes, etablissement, projet, arret,
                        redoublant, date_arrivee, origine_eleve_id, origine_promotion_id)
    values (p_cible, o.nom, o.prenom, o.naissance, st, o.telephone, o.mail, o.commune, o.code_postal, o.departement,
            o.entreprise, o.entreprise_commune, o.entreprise_cp, o.etudes, o.etablissement, o.projet, '',
            true, coalesce(p_date, make_date(cible.annee_debut + 1, 9, 1)), o.id, o.promotion_id);
    update eleves set devenir = 'Redouble avec la promotion ' || cible.libelle where id = o.id and devenir = '';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.accueillir_redoublants(bigint, jsonb, date) from public, anon;
grant execute on function public.accueillir_redoublants(bigint, jsonb, date) to authenticated;

-- si la fiche du redoublant est supprimée, la mention « Redouble avec… » de sa fiche d'origine est effacée
create or replace function public.eleve_redoublant_supprime() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.origine_eleve_id is not null then
    update eleves set devenir = '' where id = old.origine_eleve_id and devenir like 'Redouble avec la promotion%'
      and not exists (select 1 from eleves where origine_eleve_id = old.origine_eleve_id and id <> old.id);
  end if;
  return old;
end $$;
drop trigger if exists redoublant_supprime on public.eleves;
create trigger redoublant_supprime after delete on public.eleves for each row execute function public.eleve_redoublant_supprime();
