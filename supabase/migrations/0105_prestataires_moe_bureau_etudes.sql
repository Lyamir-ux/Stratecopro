-- Espaces prestataires des maîtres d'œuvre du portefeuille (demande d'Amir, 27/09/2026).
--
-- 1. Nouveau métier « Bureau d'études » (be) : Ingedair et Atelier G5 sont
--    référencés maître d'œuvre ET bureau d'études. Le métier sert aussi de type
--    de consultation, comme les autres.
-- 2. L'e-mail d'un prestataire devient facultatif : les MOE sont connus par leur
--    nom (coproprietes.maitre_oeuvre, 0104), pas par une adresse. Une fiche sans
--    e-mail n'est alertée de rien et ne peut pas recevoir de compte tant que
--    l'adresse n'est pas saisie (Base prestataires). L'unicité reste (plusieurs
--    NULL sont permis).
--
-- La création des fiches est une donnée : supabase/seed/seed_prestataires_moe_portefeuille.sql
-- (à jouer après cette migration - la nouvelle valeur d'enum doit être validée
-- avant d'être utilisée).

alter type type_consultation add value if not exists 'be' after 'moe';

alter table prestataires alter column email drop not null;

comment on column prestataires.email is
  'Destinataire des alertes (consultations, décisions, messages, agréments) et identifiant du futur compte. Facultatif depuis 0105 : sans e-mail, aucune alerte.';
