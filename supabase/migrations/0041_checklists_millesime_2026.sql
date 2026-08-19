-- 0041 — Feedback du 19/08 : millésime 2026 des checklists (et non 2024).
-- Éco-PTZ : simple renommage du libellé — la clé `dispositif` (identifiant
-- stocké en base) reste inchangée. Le libellé est désormais resynchronisé
-- automatiquement depuis le gabarit à chaque ouverture de l'onglet Fichiers.
update checklists
  set label = 'Éco-PTZ collectif 2026'
  where dispositif = 'eco_ptz_2024' and label <> 'Éco-PTZ collectif 2026';

-- MPR : des checklists à l'ancien gabarit (7 pièces, libellé « MPR
-- Copropriété 2024 ») ont été recréées par l'ancien bundle déployé après la
-- migration 0037. Aucune case cochée (vérifié) : on les supprime à nouveau,
-- elles se régénèrent au nouveau gabarit (15 pièces) à l'ouverture de
-- l'onglet Fichiers.
delete from checklists
  where dispositif = 'mpr_copro_2024'
    and label = 'MPR Copropriété 2024'
    and not exists (
      select 1 from checklist_items i where i.checklist_id = checklists.id and i.done
    );
