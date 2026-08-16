-- Feedbacks du 14/08/2026 :
-- 1. contacts des copropriétaires importables depuis le fichier des lots (email existait déjà) ;
-- 2. « quartier » remplacé par « code postal » sur la fiche copropriété ;
-- 3. gestionnaire du syndic (nom + email) sur la fiche copropriété.

alter table coproprietaires
  add column telephone text,
  add column adresse text;

alter table coproprietes rename column quartier to code_postal;

alter table coproprietes
  add column gestionnaire_nom text,
  add column gestionnaire_email text;
