-- LA ROSERAIE (4 route d'Oberhausbergen, Strasbourg) - consigne d'Amir du
-- 29/09/2026 : le dossier est chez Christelle CLAUSS (organisation créée ici),
-- gestionnaire Mohamed BELKACEMI. Notion le classait à tort chez Foncia
-- Strasbourg (Elodie DOMINGOS). Organisation et nom du syndic changés ensemble ;
-- updated_at conservé (tri du kanban AMO).
begin;
insert into organisations (nom, slug)
select 'Christelle CLAUSS', 'christelle-clauss'
where not exists (select 1 from organisations where slug = 'christelle-clauss');

alter table coproprietes disable trigger trg_coproprietes_updated;
update coproprietes c
set organisation_id = o.id,
    syndic_name = o.nom,
    gestionnaire_nom = 'Mohamed BELKACEMI',
    gestionnaire_email = 'mbelkacemi@christelleclauss.com'
from organisations o
where o.slug = 'christelle-clauss'
  and c.id = '374477c9-8b69-4b00-ab79-018f86c7630b';
alter table coproprietes enable trigger trg_coproprietes_updated;
commit;
