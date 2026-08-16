-- 0018 — Détail tarifaire des offres selon la mission consultée.
-- Diagnostiqueur « test d'étanchéité à l'air » : un montant avant travaux et
-- un montant après travaux. Contrôleur technique et coordonnateur SPS : un
-- montant phase conception et un montant phase réalisation.
-- (Diagnostiqueur « amiante et plomb avant travaux » : pas de montant — l'offre,
-- complexe, se dépose en pièce jointe ; aucune colonne nécessaire.)
alter table candidatures add column tarif_etancheite_avant numeric;  -- € HT
alter table candidatures add column tarif_etancheite_apres numeric;  -- € HT
alter table candidatures add column tarif_conception numeric;        -- € HT
alter table candidatures add column tarif_realisation numeric;       -- € HT
