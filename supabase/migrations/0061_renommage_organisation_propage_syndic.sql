-- 0061 - Feedback d'Amir du 08/09/2026 : l'enseigne « SYNDIC HORIZON GRAND EST »
-- renommée « SYNDIC 3000 GRAND EST » depuis Paramètres → Organisations, mais
-- ses copropriétés affichaient toujours l'ancien nom sous leur titre.
--
-- Le nom de syndic d'une copropriété (coproprietes.syndic_name, texte libre
-- saisi à la création ou dans l'onglet Données) vivait indépendamment du nom
-- de l'enseigne. Désormais, renommer une organisation met à jour le nom de
-- syndic de ses dossiers qui portaient l'ancien nom (ou n'en avaient pas) -
-- un dossier dont le syndic a été saisi différemment à la main n'est pas touché.

-- ========== 1. Propagation du renommage ==========
create or replace function organisations_propage_nom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nom is distinct from old.nom then
    update coproprietes
       set syndic_name = new.nom
     where organisation_id = new.id
       and (syndic_name is null
            or btrim(syndic_name) = ''
            or lower(btrim(syndic_name)) = lower(btrim(old.nom)));
  end if;
  return new;
end;
$$;

revoke execute on function organisations_propage_nom() from anon, authenticated, public;

drop trigger if exists trg_organisations_propage_nom on organisations;
create trigger trg_organisations_propage_nom after update of nom on organisations
  for each row execute function organisations_propage_nom();

-- ========== 2. Rattrapage de la démo commerciale ==========
-- Le renommage a aussi régénéré le slug technique de l'organisation (le front
-- le recalculait depuis le nom) : les scripts seed_demo_horizon.sql et
-- purge_demo_horizon.sql ne retrouvaient plus l'enseigne. On rétablit le slug
-- d'origine (le front ne le modifie plus au renommage), puis on aligne le nom
-- de syndic des 7 copropriétés et les libellés « Honoraires syndic » des plans
-- de financement définitifs générés pour la démo.
update organisations
   set slug = 'demo-syndic-horizon'
 where slug = 'syndic-3000-grand-est'
   and not exists (select 1 from organisations where slug = 'demo-syndic-horizon');

update coproprietes c
   set syndic_name = o.nom
  from organisations o
 where o.id = c.organisation_id
   and o.slug = 'demo-syndic-horizon'
   and lower(btrim(c.syndic_name)) = 'syndic horizon grand est';

update plans_definitifs p
   set data = replace(p.data::text, 'SYNDIC HORIZON GRAND EST', o.nom)::jsonb,
       resultat = replace(p.resultat::text, 'SYNDIC HORIZON GRAND EST', o.nom)::jsonb
  from coproprietes c
  join organisations o on o.id = c.organisation_id
 where c.id = p.copro_id
   and o.slug = 'demo-syndic-horizon'
   and (p.data::text like '%SYNDIC HORIZON GRAND EST%' or p.resultat::text like '%SYNDIC HORIZON GRAND EST%');
