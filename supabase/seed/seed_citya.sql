-- Portefeuille CITYA Strasbourg - extraction du 16/09/2026
-- (fichiers « Copros_Citya_Strasbourg_Immo4.csv » et « _1.csv », 28 copropriétés / 1 536 logements).
--
-- Deux enseignes DISTINCTES : Citya Immo 4 (10 dossiers) et Citya Ruhl Segesca
-- (18 dossiers, dont ANEMONES Illkirch ajouté par Amir le 17/09). LES ANEMONES (Reichstett) est chez Citya Immo 4 avec Eric LEROUX,
-- qui n'exerce que dans cette enseigne (le fichier source la classait à tort chez
-- Ruhl Segesca - corrigé par Amir le 17/09/2026).
--
-- La phase du dossier est celle de la colonne « Etape » du fichier (DIAGNOSTIC /
-- ETUDES / TRAVAUX). La colonne « Etat base » (P2 voté, P3 prog, P3 voté, Done,
-- PASSATION) sert seulement à lire le fichier et n'est jamais stockée.
-- Deux adresses embarquaient une ville différente de la colonne « Ville » du
-- fichier : on retient la ville de l'adresse (6/8 rue d'Obernai → Schiltigheim
-- 67300 ; Porte Dauphine, 13 route du Polygone → Strasbourg 67100).
--
-- Chaque copropriété est créée comme le ferait useCreateCopro() : un bâtiment
-- déclaré (code 01) + le plan de tâches gabarit positionné sur la phase (le
-- trigger taches_recalcule_phase confirme ensuite la phase depuis les tâches).
-- Chefs de projet : colonne « Suivi de projet » de la seconde extraction (17/09/2026) ;
-- deux dossiers en passation (6/8 rue d'Obernai, Porte Dauphine) restent sans chef.
-- Le bloc « Attribution des chefs de projet » plus bas les applique aussi aux dossiers
-- déjà créés par la première version du seed.
-- Aucun compte syndic créé par ce seed.
-- Rejouable : tous les inserts sont idempotents (on conflict / not exists).

begin;

insert into organisations (nom, slug) values
  ('Citya Immo 4', 'citya-immo-4'),
  ('Citya Ruhl Segesca', 'citya-ruhl-segesca')
on conflict (slug) do nothing;

-- ========== Les 28 copropriétés ==========
with src (org_slug, name, slug, nb_logements, adresse, code_postal, city, phase, gestionnaire_nom, gestionnaire_email, chef_projet) as (values
  -- Citya Immo 4
  ('citya-immo-4', '144 route des romains / 13 rue des brasseurs (OPAH RU)', '144-route-des-romains-13-rue-des-brasseurs-opah-ru', 6,  '144 route des Romains / 13 rue des Brasseurs', '67200', 'Strasbourg',             'etudes',     'Sybille BAERENZUNG', 'sbaerenzung@citya.com', 'Kawtar'),
  ('citya-immo-4', '6/8 RUE D''OBERNAI - SCHILTIGHEIM',                       '6-8-rue-d-obernai-schiltigheim',                     16, '6/8 rue d''Obernai',                          '67300', 'Schiltigheim',           'diagnostic', 'Eric LEROUX',        'erleroux@citya.com', null),
  ('citya-immo-4', '82 RUE DE LA ZIEGELAU',                                   '82-rue-de-la-ziegelau',                              6,  '82 rue de la Ziegelau',                       '67100', 'Strasbourg',             'diagnostic', 'Sybille BAERENZUNG', 'sbaerenzung@citya.com', 'Wafaa'),
  ('citya-immo-4', 'LE CATALPA',                                              'le-catalpa',                                         5,  '19A rue de Molsheim',                         '67000', 'Strasbourg',             'etudes',     'Sybille BAERENZUNG', 'sbaerenzung@citya.com', 'Louaa'),
  ('citya-immo-4', 'LILLA',                                                   'lilla',                                              6,  '1 rue du Donon',                              '67640', 'Fegersheim',             'diagnostic', 'Sybille BAERENZUNG', 'sbaerenzung@citya.com', 'Zahra'),
  ('citya-immo-4', 'MELEZES',                                                 'melezes',                                            36, '13-15-17-19 rue du Rivage',                   '67540', 'Ostwald',                'etudes',     'Eric LEROUX',        'erleroux@citya.com', 'Radia'),
  ('citya-immo-4', 'PORTE DAUPHINE',                                          'porte-dauphine',                                     31, '13 route du Polygone',                        '67100', 'Strasbourg',             'diagnostic', 'Eric LEROUX',        'erleroux@citya.com', null),
  ('citya-immo-4', 'PRÉS VERT',                                               'pres-vert',                                          25, '2a rue des Dahlias',                          '67400', 'Illkirch-Graffenstaden', 'diagnostic', 'Eric LEROUX',        'erleroux@citya.com', 'Kawtar'),
  ('citya-immo-4', 'QUAI MATHISS',                                            'quai-mathiss',                                       32, '6-7 quai Mathiss',                            '67000', 'Strasbourg',             'travaux',    'Marine MAISSE',      'mmaisse@citya.com', 'Radia'),
  -- Citya Ruhl Segesca
  ('citya-ruhl-segesca', '11 RUE DE ROSHEIM',                                    '11-rue-de-rosheim',                                22,  '11 rue de Rosheim',                                                                                '67000', 'Strasbourg',             'etudes',     'Thomas DECKER',         'tdecker@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', '147 route des romains / 12 rue de capucins (OPAH RU)', '147-route-des-romains-12-rue-de-capucins-opah-ru', 21,  '147 route des Romains / 12 rue des Capucins',                                                      '67200', 'Strasbourg',             'etudes',     'Gabrielle OLLAND',      'golland@citya.com', 'Kawtar'),
  ('citya-ruhl-segesca', '172-174 ROUTE DU POLYGONE',                            '172-174-route-du-polygone',                        24,  '172/174 route du Polygone',                                                                        '67000', 'Strasbourg',             'etudes',     'Gabrielle OLLAND',      'golland@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', '53 RUE DE LA COURSE',                                  '53-rue-de-la-course',                              13,  '53 rue de la Course',                                                                              '67000', 'Strasbourg',             'travaux',    'Thomas DECKER',         'tdecker@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'BVD ANVERS',                                           'bvd-anvers',                                       16,  '52 boulevard d''Anvers',                                                                           '67000', 'Strasbourg',             'travaux',    'Thomas DECKER',         'tdecker@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', 'DEPOT',                                                'depot',                                            9,   '12 rue du Dépôt',                                                                                  '67450', 'Mundolsheim',            'etudes',     'Thuy NGUYEN',           'tnguyen@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'GLIESBERG 2',                                          'gliesberg-2',                                      61,  '15 rue de Gresswiller',                                                                            '67200', 'Strasbourg',             'etudes',     'Thuy NGUYEN',           'tnguyen@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'LA CITADELLE',                                         'la-citadelle',                                     226, '1, 2, 3, 4, 6 rue de Boston - 21, 23, 26 place de l''Esplanade - 31, 35 rue du Général de Gaulle', '67000', 'Strasbourg',             'travaux',    'Jean-François ROUSSET', 'jfrousset@citya.com', 'Amir'),
  ('citya-ruhl-segesca', 'LE COLISEE',                                           'le-colisee',                                       223, '6 rue de Rome',                                                                                    '67000', 'Strasbourg',             'travaux',    'Thuy NGUYEN',           'tnguyen@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', 'LE LOUVOIS',                                           'le-louvois',                                       96,  '4-6-8 rue Paul Reiss / 20 rue de la 1ère Armée',                                                   '67000', 'Strasbourg',             'travaux',    'Edgar RATEVOSSIAN',     'eratevossian@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', 'LE MURANO',                                            'le-murano',                                        34,  '82-84 rue des Jésuites',                                                                           '67100', 'Strasbourg',             'etudes',     'Gabrielle OLLAND',      'golland@citya.com', 'Louaa'),
  ('citya-immo-4',       'LES ANEMONES',                                         'les-anemones',                                     20,  '5 et 7 rue des Anémones',                                                                          '67116', 'Reichstett',             'diagnostic', 'Eric LEROUX',           'erleroux@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'LILAS',                                                'lilas',                                            45,  '1-3-5 rue des Lilas',                                                                              '67400', 'Illkirch-Graffenstaden', 'travaux',    'Jean-François ROUSSET', 'jfrousset@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'Le Renaissance',                                       'le-renaissance',                                   101, '3 et 5 rue Saint-Pierre-le-Jeune',                                                                 '67000', 'Strasbourg',             'etudes',     'Jean-François ROUSSET', 'jfrousset@citya.com', 'Louaa'),
  ('citya-ruhl-segesca', 'MEINAU',                                               'meinau',                                           262, 'Cour de Bretagne, rue Prosper Mérimée',                                                            '67100', 'Strasbourg',             'travaux',    'Jean-Claude REHM',      'jcrehm@citya.com', 'Amir'),
  ('citya-ruhl-segesca', 'PLATANES',                                             'platanes',                                         113, '8 à 14 rue du Canal',                                                                              '67400', 'Illkirch-Graffenstaden', 'etudes',     'Serge STOECKEL',        'sstoeckel@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'SLEIDAN',                                              'sleidan',                                          35,  '1 rue Sleidan',                                                                                    '67000', 'Strasbourg',             'etudes',     'Serge STOECKEL',        'sstoeckel@citya.com', 'Radia'),
  -- Ajout Amir 17/09/2026 (absent de l'extraction) : homonyme des ANEMONES de Reichstett
  ('citya-ruhl-segesca', 'ANEMONES',                                             'anemones',                                         11,  '1 impasse des Anémones',                                                                           '67400', 'Illkirch-Graffenstaden', 'travaux',    'Jean-François ROUSSET', 'jfrousset@citya.com', 'Radia'),
  ('citya-ruhl-segesca', 'VERT GALANT 2',                                        'vert-galant-2',                                    41,  '44-46 rue d''Altkirch',                                                                            '67100', 'Strasbourg',             'travaux',    'Serge STOECKEL',        'sstoeckel@citya.com', 'Louaa')
)
insert into coproprietes (
  name, slug, nb_logements, adresse, code_postal, city, phase,
  gestionnaire_nom, gestionnaire_email, chef_projet, syndic_name, organisation_id
)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro,
       s.gestionnaire_nom, s.gestionnaire_email, s.chef_projet, o.nom, o.id
from src s
join organisations o on o.slug = s.org_slug
on conflict (slug) do nothing;

-- ========== Correction du 17/09/2026 : LES ANEMONES chez Citya Immo 4 ==========
update coproprietes c
   set organisation_id = (select id from organisations where slug = 'citya-immo-4'),
       syndic_name = 'Citya Immo 4'
 where c.slug = 'les-anemones'
   and c.organisation_id = (select id from organisations where slug = 'citya-ruhl-segesca');

-- ========== Attribution des chefs de projet (dossiers déjà créés) ==========
update coproprietes c set chef_projet = cp.chef
from (values
  ('144-route-des-romains-13-rue-des-brasseurs-opah-ru', 'Kawtar'), ('82-rue-de-la-ziegelau', 'Wafaa'),
  ('le-catalpa', 'Louaa'), ('lilla', 'Zahra'), ('melezes', 'Radia'), ('pres-vert', 'Kawtar'),
  ('quai-mathiss', 'Radia'), ('11-rue-de-rosheim', 'Louaa'),
  ('147-route-des-romains-12-rue-de-capucins-opah-ru', 'Kawtar'), ('172-174-route-du-polygone', 'Louaa'),
  ('53-rue-de-la-course', 'Radia'), ('bvd-anvers', 'Louaa'), ('depot', 'Radia'), ('gliesberg-2', 'Radia'),
  ('la-citadelle', 'Amir'), ('le-colisee', 'Louaa'), ('le-louvois', 'Louaa'), ('le-murano', 'Louaa'),
  ('les-anemones', 'Radia'), ('lilas', 'Radia'), ('le-renaissance', 'Louaa'), ('meinau', 'Amir'),
  ('platanes', 'Radia'), ('sleidan', 'Radia'), ('vert-galant-2', 'Louaa')
) as cp (slug, chef)
where c.slug = cp.slug
  and c.chef_projet is distinct from cp.chef
  and c.organisation_id in (select id from organisations where slug in ('citya-immo-4', 'citya-ruhl-segesca'));

-- ========== Bâtiment déclaré (les lots ne sont pas encore importés) ==========
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id in (select id from organisations where slug in ('citya-immo-4', 'citya-ruhl-segesca'))
  and not exists (select 1 from batiments b where b.copro_id = c.id);

-- ========== Plan de tâches gabarit (miroir de src/lib/taskTemplate.ts) ==========
with tpl (position, phase, title, statut_courant, tag, jalon, due_label) as (values
  (0,  'diagnostic', 'Recensement des copropriétaires & lots',                     'doing', null,                  'P1a', null),
  (1,  'diagnostic', 'Saisie des tantièmes par bâtiment',                          'todo',  null,                  null,  null),
  (2,  'diagnostic', 'Consultations diverses',                                     'todo',  null,                  null,  null),
  (3,  'diagnostic', 'Vérif. audit énergétique',                                   'todo',  'Audit réglementaire', null,  null),
  (4,  'diagnostic', 'Enquête sociale - profils MaPrimeRénov'' · Fiche État',      'todo',  'MPR',                 'P1b', null),
  (5,  'etudes',     'Scénarios de travaux & chiffrage',                           'doing', null,                  null,  null),
  (6,  'etudes',     'Ingénierie financière (7 étapes)',                           'doing', 'Finance',             null,  null),
  (7,  'etudes',     'Récupération des données essentielles - CEE / MPR Copro',    'todo',  'CEE',                 null,  null),
  (8,  'etudes',     'Récupération des données des entreprises',                   'todo',  null,                  null,  null),
  (9,  'etudes',     'Plans de financement généraux et individuels',               'todo',  null,                  null,  null),
  (10, 'etudes',     'Liasse documentaire pour AG',                                'todo',  null,                  'P1c', null),
  (11, 'travaux',    'Dépôt des dossiers des aides',                               'doing', 'CEE',                 'P2a', null),
  (12, 'travaux',    'Mobilisation des prêts',                                     'doing', 'Éco-PTZ',             'P2b', null),
  (13, 'travaux',    'Suivi de chantier',                                          'doing', null,                  null,  'En cours'),
  (14, 'travaux',    'Demandes d''acompte',                                        'todo',  null,                  null,  null),
  (15, 'travaux',    'Réception des travaux & levée des réserves',                 'todo',  null,                  null,  null),
  (16, 'travaux',    'Versement des aides & solde',                                'todo',  null,                  'P2c', null)
),
rk (phase, rang) as (values ('diagnostic', 0), ('etudes', 1), ('travaux', 2))
insert into taches (copro_id, phase, title, status, tag, jalon, due_label, position)
select c.id, t.phase::phase_copro, t.title,
       (case
          when rt.rang < rc.rang then 'done'
          when rt.rang > rc.rang then 'todo'
          else t.statut_courant
        end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.organisation_id in (select id from organisations where slug in ('citya-immo-4', 'citya-ruhl-segesca'))
  and not exists (select 1 from taches x where x.copro_id = c.id);

commit;
