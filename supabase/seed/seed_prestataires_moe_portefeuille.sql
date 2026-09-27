-- Espaces prestataires des maîtres d'œuvre du portefeuille (demande d'Amir, 27/09/2026).
-- Une fiche de la Base prestataires par maître d'œuvre saisi sur les
-- copropriétés (coproprietes.maitre_oeuvre, 0104) : raison sociale = nom tel
-- que saisi, métier « Maîtrise d'œuvre ». Ingedair et Atelier G5 sont aussi
-- « Bureau d'études » ; Ingedair aussi « Autre intervenant ».
-- Sans e-mail (inconnus) : aucune alerte ni compte tant que l'adresse n'est pas
-- saisie dans la Base prestataires (0105). Rejouable : un nom déjà référencé
-- (casse et espaces ignorés) n'est pas recréé.
-- Prérequis : migration 0105 (métier « be », e-mail facultatif).

insert into prestataires (raison_sociale, types, actif, notes)
select m.nom,
       case lower(m.nom)
         when 'ingedair' then array['moe', 'be', 'autre']::type_consultation[]
         when 'atelier g5' then array['moe', 'be']::type_consultation[]
         else array['moe']::type_consultation[]
       end,
       true,
       'Référencé le 27/09/2026 depuis les maîtres d''œuvre des copropriétés - e-mail à renseigner pour les alertes et l''ouverture du compte.'
from (
  select distinct on (lower(trim(maitre_oeuvre))) trim(maitre_oeuvre) as nom
  from coproprietes
  where deleted_at is null and coalesce(trim(maitre_oeuvre), '') <> ''
  order by lower(trim(maitre_oeuvre)), trim(maitre_oeuvre)
) m
where not exists (
  select 1 from prestataires p where lower(trim(p.raison_sociale)) = lower(m.nom)
);
