-- Comptes syndic de toutes les organisations - demande d'Amir du 01/10/2026 (18:09) :
-- « Crée-moi tous les membres non créés de toutes les organisations, avec les adresses
-- mail et les noms-prénoms des personnes que tu trouveras dans la base « données de la
-- copropriété ». Crée également les accès sans envoyer de mails. »
--
-- Source : gestionnaire_nom / gestionnaire_email des dossiers non supprimés rattachés à
-- une organisation, dont l'adresse n'avait encore aucun compte (77 adresses, 74 comptes).
-- Même construction que seed_citya_comptes.sql (20/09) et
-- seed_christelle_clauss_compte_2026-09-29.sql : compte confirmé d'office, mot de passe
-- aléatoire inconnu de tous, marqueur mot_de_passe_provisoire, profil syndic, rôle
-- gestionnaire dans l'enseigne du dossier, aucun e-mail envoyé. Au moment de la diffusion,
-- chacun passe par « Mot de passe oublié » sur l'écran de connexion. Les accès aux dossiers
-- (copro_members 'syndic') sont posés par sync_rattachement_gestionnaire (gestionnaire_email
-- de la fiche + même enseigne). Idempotent : un e-mail déjà connu n'est pas recréé.
--
-- Laissés de côté sur consigne d'Amir (« ne crée rien du tout, ne change rien du tout ») :
--   - contact@bsimmobilier.net (B&S Immobilier, deux noms sur les fiches : BERNHEIM et
--     Gaëlle PICART) ;
--   - valbanese@lamy-immobilier.fr (Valentine ALBANESE, chez Ariane Benedic Immobilier et
--     chez Nexity HAGUENAU, alors qu'un compte n'appartient qu'à une enseigne) ;
--   - assistcopro1metz@rizzon.com (LES PLANTIERES, aucun nom sur la fiche).
--
-- CG IMMO : la fiche LE BALZAC portait « Kamail AZFAL » avec kamail.afzal@cgimmo.com ; le
-- bon nom est Kamail AFZAL, comme l'adresse (précision d'Amir du 01/10). En prod, le compte
-- avait d'abord été créé en kamail.azfal@ (premier arbitrage, retiré aussitôt) puis corrigé
-- en SQL (auth.users, auth.identities, profil, fiche) : un seul compte, kamail.afzal@.

update coproprietes
   set gestionnaire_nom = 'Kamail AFZAL', gestionnaire_email = 'kamail.afzal@cgimmo.com'
 where deleted_at is null
   and lower(btrim(gestionnaire_email)) in ('kamail.afzal@cgimmo.com', 'kamail.azfal@cgimmo.com');

with nouveaux (org_slug, full_name, email, initials) as (values
  ('agence-mercor', 'Melissa ZIMMER', 'melissa.zimmer@mercor.fr', 'MZ'),
  ('agence-mercor', 'Valérie SCHWENGLER', 'valerie.schwengler@mercor.fr', 'VS'),
  ('alsace-promotion-gestion', 'Ophélie MEYER', 'o.meyer@ap-gest.fr', 'OM'),
  ('alsace-residence', 'Olivier OSWALD', 'contact@alsaceresidence.fr', 'OO'),
  ('ariane-benedic-immobilier', 'Sylvie NAVARRO', 'snavarro@benedic.fr', 'SN'),
  ('asi-agence-strasbourg-immobiliere', 'Alexandre FLORES', 'alexandre.flores@asi67.com', 'AF'),
  ('asi-agence-strasbourg-immobiliere', 'Paul SCHILLINGER', 'paul.schillinger@asi67.com', 'PS'),
  ('asi-agence-strasbourg-immobiliere', 'Sébastien NORTH', 'sebastien.north@asi67.com', 'SN'),
  ('cabinet-univers', 'Manon GODARD', 'manon.godard@cabinetunivers.fr', 'MG'),
  ('cagim-sogedim', 'Elodie BECHARD', 'e.bechard@cagim-sogedim.fr', 'EB'),
  ('cagim-sogedim', 'Rébecca WIEDERKEHR', 'r.wiederkehr@cagim-sogedim.fr', 'RW'),
  ('cclv-immo', 'Virginie CAILLOL', 'cclvimmo@gmail.com', 'VC'),
  ('cg-immo', 'Kamail AFZAL', 'kamail.afzal@cgimmo.com', 'KA'),
  ('cg-immo', 'Nicolas LOMMELE', 'nicolas.lommele@cgimmo.com', 'NL'),
  ('citya-poirel', 'Fanny BACLET', 'fbaclet@citya.com', 'FB'),
  ('citya-poirel', 'Julien GARRIC', 'jgarric@citya.com', 'JG'),
  ('citya-poirel', 'Thomas BARTHELEMY', 'tbarthelemy@citya.com', 'TB'),
  ('claude-rizzon', 'Camille LAMY', 'gestcopro1nancy@rizzon.com', 'CL'),
  ('claude-rizzon', 'Caroline BONY', 'gestcopro2metz@rizzon.com', 'CB'),
  ('concept-immobilier-thionville', 'Victor BARBOSA', 'victor.barbosa@conceptimmobilier.fr', 'VB'),
  ('coop-de-l-ill', 'Chloé PATIN', 'contact@coopdelill.fr', 'CP'),
  ('coop-de-l-ill', 'Florent REHEL', 'f.rehel@coopdelill.fr', 'FR'),
  ('fil-a-l-immo', 'Marie-Françoise TOUSSAINT', 'agence@lefilalimmo.com', 'MT'),
  ('foncia-colmar', 'Adeline LORSON', 'adeline.lorson@foncia.com', 'AL'),
  ('foncia-colmar', 'Frederic BELTZUNG', 'frederic.beltzung@foncia.com', 'FB'),
  ('foncia-mulhouse', 'Camille KLEIN', 'camille.klein@foncia.com', 'CK'),
  ('foncia-mulhouse', 'Mathieu CHRISTEN', 'mathieu.christen@foncia.com', 'MC'),
  ('foncia-mulhouse', 'Olivier LARANJEIRA', 'olivier.laranjeira@foncia.com', 'OL'),
  ('foncia-sarrebourg', 'Jessica MUNOZ', 'jessica.munoz@foncia.fr', 'JM'),
  ('foncia-strasbourg', 'Elodie DOMINGOS', 'elodie.domingos@foncia.com', 'ED'),
  ('foncia-strasbourg', 'Fabien LIPMANN', 'fabien.lipmann@foncia.com', 'FL'),
  ('foncia-strasbourg', 'Laura WEIL', 'laura.weil@foncia.com', 'LW'),
  ('foncia-strasbourg', 'Lina KOENIG', 'lina.koenig@foncia.com', 'LK'),
  ('foncia-strasbourg', 'Manon HAROUDJ SCHMITT', 'manon.haroudj-schmitt@foncia.com', 'MH'),
  ('foncia-strasbourg', 'Matthieu ECK', 'matthieu.eck@foncia.com', 'ME'),
  ('foncia-strasbourg', 'Pierre BALTZ', 'pierre.baltz@foncia.com', 'PB'),
  ('foncia-strasbourg', 'Yasmine SCHNEIDER', 'yasmine.schneider@foncia.com', 'YS'),
  ('foncia-thionville', 'Geoffrey HEL', 'geoffrey.hel@foncia.com', 'GH'),
  ('foncia-thionville', 'Mathias BRETHENOUX', 'mathias.brethenoux@foncia.com', 'MB'),
  ('groupe-dumur', 'Catherine PRATURLON', 'catherine.praturlon@dumur.fr', 'CP'),
  ('groupe-dumur', 'Sandra DESUERT', 'sandra.desuert@dumur.fr', 'SD'),
  ('groupe-dumur', 'Yannick BAYEUL', 'yannick.bayeul@dumur.fr', 'YB'),
  ('gt-immo', 'Jean-Philippe LANG', 'gtimmo@hotmail.com', 'JL'),
  ('hebding-immobilier', 'Marie Aude HEBDING', 'ma.hebding@hebding-immobilier.fr', 'MH'),
  ('ica-gestion', 'Audrey BASS', 'audrey.bass@bassimmobilier.fr', 'AB'),
  ('immium-laemmel', 'Léa AMINI', 'lea.amini@immium.com', 'LA'),
  ('immium-laemmel', 'Nicolas KERN', 'nicolas.kern@immium.com', 'NK'),
  ('immobiliere-la-ravinelle', 'Elodie BOURA', 'elodie.boura@immodefrancelorraine.fr', 'EB'),
  ('immobiliere-la-ravinelle', 'Mathilde JUNG', 'mjung@immodefrancelorraine.fr', 'MJ'),
  ('immoval', 'Clémence THIESEN', 'clemence.thiesen@immoval.com', 'CT'),
  ('immoval', 'Lionel HALPHEN', 'lionel.halphen@immoval.com', 'LH'),
  ('immoval', 'Sylvie PFRIMMER', 'sylvie.pfrimmer@immoval.com', 'SP'),
  ('ita-67', 'Christophe FICHOT', 'monsyndic2@ita67.fr', 'CF'),
  ('la-maison-du-syndic', 'Thomas FRAPICCINI', 'thomas.frapiccini@lamaisondusyndic.fr', 'TF'),
  ('laforet', 'Clément BAYSSELIER', 'syndic.strasbourgcentre@laforet.com', 'CB'),
  ('lamy-metz', 'Morgane GERARD', 'morgane.gerard@lamy-immobilier.fr', 'MG'),
  ('lamy-strasbourg', 'Maxime HEINRICH', 'mheinrich@lamy-immobilier.fr', 'MH'),
  ('liehr', 'Nicolas UDOVICIC', 'nudovicic@liehr.fr', 'NU'),
  ('nexity-mulhouse', 'Camille WAECHTER', 'cwaechter@lamy-immobilier.fr', 'CW'),
  ('nexity-nancy', 'Lucas MUTELET', 'lmutelet@lamy-immobilier.fr', 'LM'),
  ('orpi-central-immobilier', 'Jean-Louis COLSON', 'jeanlouiscolson@centralimmobilier.fr', 'JC'),
  ('philippe-poncet-conseil', 'Philippe PONCET', 'philippe@poncet-syndic.fr', 'PP'),
  ('relais-immo-gestion', 'Laurent GANGLOFF', 'syndic@relais-immo-gestion.com', 'LG'),
  ('sogestra', 'Corinne EL HAIK', 'corinne.elhaik@immium.com', 'CE'),
  ('sogestra', 'Jérémy KIENTZ', 'jeremy.kientz@sogestra.fr', 'JK'),
  ('sogestra', 'Maxime GALLEZOT', 'maxime.gallezot@sogestra.fr', 'MG'),
  ('sogestra', 'Vincent RUCH', 'vincent.ruch@sogestra.fr', 'VR'),
  ('syndic-benevole-19-rue-saint-paul', 'Annie VIERLING', 'copro19stpaul@gmail.com', 'AV'),
  ('syndic-benevole-les-amandiers', 'Bernard Jacquemin', 'b-jacquemin@neuf.fr', 'BJ'),
  ('syndic-benevole-trois-figuiers', 'Pascal FROMEYER', 'fromale@hotmail.com', 'PF'),
  ('triplex-immobilier', 'Lionel SEGARD', 'l.segard@tripleximmobilier.fr', 'LS'),
  ('troyes-aubes-habitat', 'Aline COURQUET LEVERT', 'acourquetlevert@troyes-aube-habitat.fr', 'AC'),
  ('troyes-aubes-habitat', 'Marie AZZOPARDI', 'mazzopardi@troyes-aube-habitat.fr', 'MA'),
  ('wicker-immo', 'Christophe WICKER', 'c.wicker@wickerimmo.com', 'CW')
),
crees as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', n.full_name, 'mot_de_passe_provisoire', true), now(), now()
  from nouveaux n
  where not exists (select 1 from auth.users u where lower(u.email) = n.email)
    and exists (select 1 from organisations o where o.slug = n.org_slug)
  returning id, email
),
ident as (
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select c.id::text, c.id, jsonb_build_object('sub', c.id::text, 'email', c.email, 'email_verified', true), 'email', now(), now()
  from crees c
  returning user_id
),
prof as (
  insert into profiles (user_id, full_name, initials, role, job_title)
  select c.id, n.full_name, n.initials, 'syndic',
         case when n.org_slug like 'syndic-benevole-%' then 'Syndic bénévole' else 'Gestionnaire de copropriété' end
  from crees c join nouveaux n on n.email = c.email
  returning user_id
)
insert into organisation_membres (organisation_id, user_id, org_role)
select o.id, c.id, 'gestionnaire'::org_role
from crees c join nouveaux n on n.email = c.email join organisations o on o.slug = n.org_slug;

-- Rattrapage des accès aux dossiers (hors visibilité des CTE).
select sync_rattachement_gestionnaire(null);
