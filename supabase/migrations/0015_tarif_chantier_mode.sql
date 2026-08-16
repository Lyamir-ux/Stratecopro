-- 0015 — Offre MOE : le suivi de chantier se chiffre au forfait (€ HT)
-- ou en pourcentage du montant des travaux. `tarif_chantier` porte la valeur
-- (euros ou pourcents selon le mode).
alter table candidatures add column tarif_chantier_mode text not null default 'forfait'
  check (tarif_chantier_mode in ('forfait', 'pourcentage'));
