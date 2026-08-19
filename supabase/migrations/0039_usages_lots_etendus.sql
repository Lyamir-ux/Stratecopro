-- 0039 — Feedback du 19/08 : la répartition des lots ne se limite plus à
-- « autres » pour les locaux non résidentiels : commerces et bureaux
-- deviennent des usages à part entière (cas des copros avec des commerces).
-- L'usage d'un lot se corrige aussi à la main depuis l'onglet Données
-- (tableau « Copropriétaires & lots »).
alter type usage_lot add value if not exists 'commerces';
alter type usage_lot add value if not exists 'bureaux';
