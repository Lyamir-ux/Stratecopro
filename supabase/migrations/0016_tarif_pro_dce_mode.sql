-- 0016 — Offre MOE : le PRO/DCE se chiffre aussi au forfait (€ HT) ou en
-- pourcentage du montant des travaux, comme le suivi de chantier (0015).
alter table candidatures add column tarif_pro_dce_mode text not null default 'forfait'
  check (tarif_pro_dce_mode in ('forfait', 'pourcentage'));
