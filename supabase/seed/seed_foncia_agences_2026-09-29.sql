-- Agences Foncia - demande d'Amir du 29/09/2026 : supprimer Foncia ABFC et
-- répartir ses dossiers sur les autres agences par rapprochement d'adresse ;
-- les dossiers de Foncia Alsace sont en fait chez Foncia Strasbourg.
-- Organisation et nom du syndic changés ensemble (cf. syndic_name /
-- organisation_id). Codes postaux et e-mail du gestionnaire des ERABLES
-- corrigés au passage. updated_at conservé : le tableau de bord AMO trie le
-- kanban sur la dernière modification.
begin;
alter table coproprietes disable trigger trg_coproprietes_updated;

update coproprietes c
set organisation_id = o.id,
    syndic_name = o.nom
from (values
  -- Foncia ABFC
  ('04d06a50-47ed-4146-837b-36a4f5f74593', 'Foncia Strasbourg'), -- LE PETIT PRINCE, 176 route du Polygone
  ('94d90231-8e65-40fa-9872-59ca4d71deff', 'Foncia Strasbourg'), -- 29 boulevard d'Anvers
  ('94fba275-a4e7-45d5-b054-3a9bc8409d02', 'Foncia Strasbourg'), -- 12 rue de Schurmfeld
  ('baa5f525-a496-4cc3-852a-ffa6932f34c4', 'Foncia Strasbourg'), -- 27 RUE DU GRAND COURONNE
  ('db422286-8dd4-4ac5-a4f6-aa76c9b4174e', 'Foncia Strasbourg'), -- 317 AVENUE DE COLMAR
  ('1016eff1-5bfd-48da-b142-2845d6ba2853', 'Foncia Colmar'),     -- LES ERABLES (COLMAR)
  ('d7986da6-5828-418f-a6fe-6171ceae857e', 'Foncia Mulhouse'),   -- CORBIERES IF, Rixheim
  -- Foncia Alsace
  ('b4488c7e-3810-44b1-8bcb-3e68af6bcb9f', 'Foncia Strasbourg'), -- BUCER 30 rue Sainte-Marguerite
  ('8eb73f83-0e25-4a03-82fe-0a7778e11b4d', 'Foncia Strasbourg'), -- BUCER 11A rue Martin Bucer
  ('acc52022-8849-40de-b0ff-b96429bc0af5', 'Foncia Strasbourg')  -- BUCER 11 rue Martin Bucer
) as v(copro_id, agence)
join organisations o on o.nom = v.agence
where c.id = v.copro_id::uuid;

update coproprietes
set code_postal = '67100'
where id in (
  '94fba275-a4e7-45d5-b054-3a9bc8409d02', -- 12 rue de Schurmfeld (vide)
  'db422286-8dd4-4ac5-a4f6-aa76c9b4174e'  -- 317 Avenue de Colmar (67000)
);

-- Gestionnaire Frederic BELTZUNG : l'adresse importée de Notion était celle
-- de Fanny NOYER.
update coproprietes
set gestionnaire_email = 'frederic.beltzung@foncia.com'
where id = '1016eff1-5bfd-48da-b142-2845d6ba2853'
  and gestionnaire_email = 'fanny.noyer@foncia.com';

alter table coproprietes enable trigger trg_coproprietes_updated;

-- Aucun compte, PPT, demande d'AMO ni facture ne référence ces deux enseignes.
delete from organisations o
where o.nom in ('Foncia ABFC', 'Foncia Alsace')
  and not exists (select 1 from coproprietes c where c.organisation_id = o.id)
  and not exists (select 1 from organisation_membres m where m.organisation_id = o.id);
commit;
