-- =====================================================================================================
-- 44 · Durées de séance : ajout de 1 h 30, 2 h 30 et 3 h 30 dans la liste proposée par le séquençage.
-- À exécuter une fois dans Supabase (SQL Editor → New query → Run). Relancer le script ne casse rien.
-- =====================================================================================================
insert into public.durees (heures) values (1.5), (2.5), (3.5) on conflict do nothing;
