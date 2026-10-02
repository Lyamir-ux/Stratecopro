-- 0128 - Suite de 0127 (appliquée en prod sous le nom
-- 0127_rls_rapide_copros_moe_cite, juste après 0127).
--
-- copros_moe_designe(uuid) existe déjà (RPC « Mes projets » de l'espace
-- prestataire, 0119) : la liste sans argument créée par 0127 pour les policies
-- prend un autre nom, pour éviter une surcharge que PostgREST pourrait mal
-- résoudre. Les policies référencent la fonction par son identifiant et suivent
-- le renommage (batiments_moe_read, coproprietes_presta_read,
-- projet_docs_presta_all).
alter function public.copros_moe_designe() rename to copros_moe_cite;
