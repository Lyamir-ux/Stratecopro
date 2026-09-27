-- 0110 - Offre d'un bureau d'études sur une consultation PPPT + DPE collectif :
--        prix et délais séparés
--
-- Demande d'Amir 27/09/2026 : « sépare le prix du PPPT et du DPE et ajoute les
-- délais pour chacun ». Le bureau d'études chiffre chaque prestation (€ HT) et
-- indique son délai de réalisation en semaines, à compter de la commande.
-- `montant` reste le total de l'offre (somme des deux prix) : comparatif,
-- listes et e-mails existants continuent de le lire.

alter table candidatures
  add column if not exists tarif_pppt numeric check (tarif_pppt is null or tarif_pppt >= 0),
  add column if not exists tarif_dpe numeric check (tarif_dpe is null or tarif_dpe >= 0),
  add column if not exists delai_pppt_semaines integer check (delai_pppt_semaines is null or delai_pppt_semaines between 1 and 104),
  add column if not exists delai_dpe_semaines integer check (delai_dpe_semaines is null or delai_dpe_semaines between 1 and 104);

comment on column candidatures.tarif_pppt is 'Consultation PPPT + DPE collectif : prix du PPPT, € HT (0110).';
comment on column candidatures.tarif_dpe is 'Consultation PPPT + DPE collectif : prix du DPE collectif, € HT (0110).';
comment on column candidatures.delai_pppt_semaines is 'Délai de réalisation du PPPT, en semaines à compter de la commande (0110).';
comment on column candidatures.delai_dpe_semaines is 'Délai de réalisation du DPE collectif, en semaines à compter de la commande (0110).';
