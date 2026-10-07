-- 0142 - Suite de 0141 (accès en lecture seule de l'équipe, 06/10/2026).
--
-- Une connexion directe à Postgres (même avec un rôle sans droit sur les tables)
-- peut forger l'identité d'un utilisateur : auth.uid() lit le paramètre de session
-- request.jwt.claim.sub, que n'importe quelle session peut positionner. Tout ce
-- qu'une fonction SECURITY DEFINER laisse faire à « public » (EXECUTE accordé par
-- défaut à tout le monde) est donc faisable en se faisant passer pour l'AMO.
--
-- Deux fonctions de public écrivent en base et ne se protègent que par is_amo() :
--   rattacher_lot(uuid, uuid)   - modifie lots.rattache_a
--   seed_syndic_taches(uuid[])  - insère des syndic_taches
-- Elles ont déjà un EXECUTE explicite pour authenticated et service_role (et anon
-- pour la première) : retirer celui de PUBLIC ne change rien pour l'application,
-- et empêche un rôle de lecture d'écrire. Les autres fonctions encore exécutables
-- par PUBLIC sont des prédicats de lecture (is_copro_of, my_lot_ids...) ou des
-- fonctions de déclencheur, non appelables directement.
--
-- À refaire pour toute NOUVELLE fonction SECURITY DEFINER qui écrit : revoke
-- execute ... from public (le défaut de Postgres l'accorde à tous).

revoke execute on function public.rattacher_lot(uuid, uuid) from public;
revoke execute on function public.seed_syndic_taches(uuid[]) from public;
