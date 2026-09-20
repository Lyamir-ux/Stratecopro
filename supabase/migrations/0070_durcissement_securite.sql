-- Durcissement sécurité avant mise en production (audit du 2026-09-14).
-- Défense en profondeur : la RLS bloque déjà tout accès anon aux données, ces
-- révocations suppriment la surface d'attaque résiduelle signalée par les
-- advisors Supabase (0028 fonctions SECURITY DEFINER exécutables par anon,
-- droits superflus sur la vue copro_stats, search_path mutable).
--
-- Sans risque fonctionnel : les policies RLS évaluent ces fonctions avec les
-- droits de l'appelant `authenticated`, qui conserve EXECUTE. Aucune policy ne
-- s'adresse au rôle `anon`, qui n'a donc jamais besoin de ces fonctions.

-- 1) Vue copro_stats : retirer tous les droits au rôle anon (grants superflus).
revoke all on table public.copro_stats from anon;

-- 2) Fonctions SECURITY DEFINER : retirer EXECUTE à anon (les prédicats
--    renvoient de toute façon faux/vide pour un anon, mais on coupe l'accès).
revoke execute on function public.a_postule(uuid) from anon;
revoke execute on function public.copro_visible_presta(uuid) from anon;
revoke execute on function public.is_copro_of(uuid) from anon;
revoke execute on function public.is_moe_retenu_of(uuid) from anon;
revoke execute on function public.is_presta_retenu_of(uuid) from anon;
revoke execute on function public.is_scenario_partage(uuid) from anon;
revoke execute on function public.my_coproprietaire_ids() from anon;
revoke execute on function public.my_lot_ids() from anon;
revoke execute on function public.my_presta_types() from anon;
revoke execute on function public.my_prestataire_id() from anon;
revoke execute on function public.peut_postuler(uuid) from anon;
revoke execute on function public.peut_voir_consultation(uuid) from anon;

-- Fonctions mutantes SECURITY DEFINER : le contrôle interne suffit, mais anon
-- n'a aucune raison de les appeler.
revoke execute on function public.rattacher_lot(uuid, uuid) from anon;
revoke execute on function public.seed_syndic_taches(uuid[]) from anon;

-- Fonctions trigger exposées comme RPC (aucun usage légitime en direct).
revoke execute on function public.protege_candidature_presta() from anon, authenticated;
revoke execute on function public.protege_prestataire_own() from anon, authenticated;
revoke execute on function public.protege_syndic_tache() from anon, authenticated;

-- 3) search_path mutable (advisor 0011) : le figer.
alter function public.check_lot_rattachement() set search_path = public;
