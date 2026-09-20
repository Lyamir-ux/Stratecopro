-- 0076 - Taux d'honoraires de suivi de travaux indiqué par le syndic au dépôt
-- d'un PPPT ou d'un PPT adopté (feedback Amir 20/09/2026). Transmis dans la
-- notification au dirigeant de Strat Eco, affiché sur la revue, pour être
-- appliqué au tableau PPT de sortie.
alter table ppt_rapports
  add column if not exists taux_honoraires_pct numeric check (taux_honoraires_pct >= 0 and taux_honoraires_pct <= 100);
comment on column ppt_rapports.taux_honoraires_pct is 'Taux d''honoraires de suivi de travaux (%) indiqué par le syndic au dépôt (0076)';
