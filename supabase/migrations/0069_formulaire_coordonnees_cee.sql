-- 0069 - Feedback d'Amir du 13/09/2026 : dossier CEE en trois étapes sur la
-- page Documents à produire du syndic (demande de cotation, validation des
-- aides, demande de solde - catalogue CEE_ETAPES dans src/api/montage.ts).
-- L'étape 1 s'ouvre sur un formulaire en ligne pré-rempli, « Récapitulatif des
-- coordonnées du syndic et de la copropriété », stocké comme les deux
-- formulaires CEGEE dans montage_formulaires : la contrainte sur `type` admet
-- la nouvelle valeur.
alter table montage_formulaires drop constraint if exists montage_formulaires_type_check;
alter table montage_formulaires
  add constraint montage_formulaires_type_check
  check (type in ('fiche_avant_ag', 'demande_pret', 'coordonnees_cee'));
