-- Feedback Amir 31/08/2026 : checklists de pièces = CEE, MaPrimeRénov',
-- Climaxion, Eurométropole, Autre, Éco-PTZ.
-- Appliquée en prod le 31/08/2026 (MCP, nom : fusion_checklists_cee_et_nouveaux_libelles).
-- 1. Copros ayant « CEE - Après travaux » sans « CEE - Avant travaux » :
--    la liste « après » devient la liste CEE.
update checklists ca
set dispositif = 'cee_avant'
where ca.dispositif = 'cee_apres'
  and not exists (
    select 1 from checklists cv
    where cv.copro_id = ca.copro_id and cv.dispositif = 'cee_avant'
  );

-- 2. Déplacement des items « après travaux » à la suite des items « avant
--    travaux » de la même copro (état coché conservé).
update checklist_items i
set checklist_id = cv.id,
    position = i.position + coalesce(
      (select max(position) + 1 from checklist_items where checklist_id = cv.id), 0)
from checklists ca
join checklists cv on cv.copro_id = ca.copro_id and cv.dispositif = 'cee_avant'
where i.checklist_id = ca.id and ca.dispositif = 'cee_apres';

-- 3. Suppression des checklists « CEE - Après travaux » vidées.
delete from checklists where dispositif = 'cee_apres';

-- 4. Nouveaux libellés (les items des nouveaux gabarits Climaxion /
--    Eurométropole / Autre sont créés côté app au premier accès).
update checklists set label = 'CEE' where dispositif = 'cee_avant';
update checklists set label = 'MaPrimeRénov''' where dispositif = 'mpr_copro_2024';
update checklists set label = 'Éco-PTZ' where dispositif = 'eco_ptz_2024';
