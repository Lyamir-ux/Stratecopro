-- 0029 — Statut « validé » du plan de financement définitif.
-- Une fois le plan enregistré et vérifié, l'AMO le valide : le PF validé
-- alimente alors automatiquement les panneaux de l'onglet Plans de financement
-- (coût d'opération, aides, reste à charge, indicateurs). Un seul plan validé
-- par copropriété (géré côté application).
alter table plans_definitifs drop constraint plans_definitifs_statut_check;
alter table plans_definitifs add constraint plans_definitifs_statut_check
  check (statut in ('brouillon', 'partage', 'valide'));
