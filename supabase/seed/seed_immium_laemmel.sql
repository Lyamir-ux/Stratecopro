-- Portefeuille IMMIUM Laemmel — extraction base AMO Copro du 15/08/2026
-- (fichier « Organisation Laemmel.xlsx », 22 copropriétés / 1 067 logements).
--
-- Correspondance état AG → phase du dossier :
--   « P2 voté » et « P3 programmé » → etudes   (P3 pas encore voté en AG)
--   « P3 voté »                     → travaux
--
-- Chaque copropriété est créée comme le ferait useCreateCopro() : un bâtiment
-- déclaré (code 01) + le plan de tâches gabarit positionné sur la phase.
-- Rejouable : tous les inserts sont idempotents (on conflict / not exists).

begin;

-- ========== L'organisation ==========
insert into organisations (nom, slug)
values ('IMMIUM Laemmel', 'immium-laemmel')
on conflict (slug) do nothing;

-- ========== Les 22 copropriétés ==========
with org as (select id from organisations where slug = 'immium-laemmel'),
src (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet, gestionnaire_nom, gestionnaire_email) as (values
  ('18 RUE FIX',                 '18-rue-fix',                 8,   '18 rue Fix',                                                                                                 '67100', 'Strasbourg',  'travaux', 'Radia',  null,                null),
  ('ANDROMEDE',                  'andromede',                  17,  '2 rue des Perdrix',                                                                                          '67100', 'Eckbolsheim', 'travaux', 'Zahra',  null,                null),
  ('NOUVELLE CITE DIALOGUE',     'nouvelle-cite-dialogue',     285, 'Rue de Barcelone, rue de Turin, Rue de Munich',                                                               '67380', 'Lingolsheim', 'travaux', 'Amir',   'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('ROND POINT DE L''ESPLANADE', 'rond-point-de-l-esplanade',  131, '7-8-9 Rond Point de l''Esplanade',                                                                            '67000', 'Strasbourg',  'travaux', 'Kawtar', 'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('10 RUE THANN',               '10-rue-thann',               10,  '10 rue Thann',                                                                                                '67100', 'Strasbourg',  'etudes',  'Wafaa',  null,                null),
  ('LE FORUM (OPAH RU)',         'le-forum-opah-ru',           23,  '96 route des Romains',                                                                                        '67200', 'Strasbourg',  'etudes',  'Kawtar', 'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('LE NEUVILLE',                'le-neuville',                14,  '29 avenue de Colmar',                                                                                         '67100', 'Strasbourg',  'etudes',  'Radia',  'Nicolas SCHMIEG',   'nicolas.schmieg@immium.com'),
  ('LE POLYGONE',                'le-polygone',                84,  '110-112-114-116 route du Polygone',                                                                           '67100', 'Strasbourg',  'etudes',  'Zahra',  'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('Les Renards',                'les-renards',                12,  '2 2/B rue du Renard',                                                                                         '67200', 'Strasbourg',  'etudes',  'Zahra',  'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('16 rue Geroldseck (OPAH RU)','16-rue-geroldseck-opah-ru',  10,  '16 rue Geroldseck',                                                                                           '67200', 'Strasbourg',  'etudes',  'Kawtar', 'Nicolas SCHMIEG',   'nicolas.schmieg@immium.com'),
  ('33 RUE DES MALTERIES',       '33-rue-des-malteries',       15,  '33 rue des Malteries',                                                                                        '67300', 'Schiltigheim','etudes',  'Wafaa',  'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('LES BATELIERS',              'les-bateliers',              15,  'rue des Bateliers',                                                                                           '67150', 'Erstein',     'etudes',  'Wafaa',  'Christine VAUTIER', 'christine.vautier@immium.com'),
  ('LES GEMEAUX',                'les-gemeaux',                22,  '2 avenue du Général de Gaulle',                                                                               '67000', 'Strasbourg',  'etudes',  'Wafaa',  'Claude LOBSTEIN',   'claude.lobstein@immium.com'),
  ('LES JARDINS DE MANNET',      'les-jardins-de-mannet',      54,  'Rue Jacob Mayer',                                                                                             '67200', 'Strasbourg',  'etudes',  'Wafaa',  'Nicolas SCHMIEG',   'nicolas.schmieg@immium.com'),
  ('Baldner',                    'baldner',                    33,  '21 rue Baldner - 2 rue Wieghaeusel',                                                                          '67100', 'Strasbourg',  'travaux', 'Radia',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('Grossau',                    'grossau',                    11,  '26 rue de la Grossau',                                                                                        '67100', 'Strasbourg',  'travaux', 'Kawtar', 'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('LAMARTINE',                  'lamartine',                  21,  '10 rue de Fréconrupt',                                                                                        '67100', 'Strasbourg',  'travaux', 'Kawtar', 'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('LE TASSIGNY',                'le-tassigny',                94,  '2/4 rue de Bienne - 1/2 Quai Koenig - 13/21 rue de la Brigade Alsace-Lorraine - 15/17 rue Jacques Peirotes',   '67000', 'Strasbourg',  'travaux', 'Louaa',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('OREADES',                    'oreades',                    42,  '11 rue de Châtenois',                                                                                         '67100', 'Strasbourg',  'travaux', 'Louaa',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('STOSSWIHR',                  'stosswihr',                  15,  '42 rue de Stosswihr',                                                                                         '67100', 'Strasbourg',  'travaux', 'Radia',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('TUILERIES',                  'tuileries',                  26,  '3 chemin Fried',                                                                                              '67000', 'Strasbourg',  'travaux', 'Radia',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com'),
  ('ANCIENNE GARE',              'ancienne-gare',              125, '24 rue Kageneck - 1 rue du Feu',                                                                              '67000', 'Strasbourg',  'etudes',  'Louaa',  'Lucie CHATTELEYN',  'lucie.chatteleyn@immium.com')
)
insert into coproprietes (
  name, slug, nb_logements, adresse, code_postal, city, phase,
  chef_projet, gestionnaire_nom, gestionnaire_email, syndic_name, organisation_id
)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro,
       s.chef_projet, s.gestionnaire_nom, s.gestionnaire_email, 'IMMIUM Laemmel', org.id
from src s cross join org
on conflict (slug) do nothing;

-- ========== Bâtiment déclaré (les lots ne sont pas encore importés) ==========
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id = (select id from organisations where slug = 'immium-laemmel')
  and not exists (select 1 from batiments b where b.copro_id = c.id);

-- ========== Plan de tâches gabarit (miroir de lib/taskTemplate.ts) ==========
with tpl (position, phase, title, statut_courant, tag, jalon, due_label) as (values
  (0,  'diagnostic', 'Recensement des copropriétaires & lots',                     'doing', null,      'P1a', null),
  (1,  'diagnostic', 'Saisie des tantièmes par bâtiment',                          'todo',  null,      null,  null),
  (2,  'diagnostic', 'Consultations diverses',                                     'todo',  null,      null,  null),
  (3,  'diagnostic', 'Vérif. audit énergétique',                                   'todo',  'DPE',     null,  null),
  (4,  'diagnostic', 'Enquête sociale — profils MaPrimeRénov'' · Fiche État',      'todo',  'MPR',     'P1b', null),
  (5,  'etudes',     'Scénarios de travaux & chiffrage',                           'doing', null,      null,  null),
  (6,  'etudes',     'Ingénierie financière (7 étapes)',                           'doing', 'Finance', null,  null),
  (7,  'etudes',     'Récupération des données essentielles — CEE / MPR Copro',    'todo',  'CEE',     null,  null),
  (8,  'etudes',     'Récupération des données des entreprises',                   'todo',  null,      null,  null),
  (9,  'etudes',     'Plans de financement généraux et individuels',               'todo',  null,      null,  null),
  (10, 'etudes',     'Liasse documentaire pour AG',                                'todo',  null,      'P1c', null),
  (11, 'travaux',    'Dépôt des dossiers des aides',                               'doing', 'CEE',     'P2a', null),
  (12, 'travaux',    'Mobilisation des prêts',                                     'doing', 'Éco-PTZ', 'P2b', null),
  (13, 'travaux',    'Suivi de chantier',                                          'doing', null,      null,  'En cours'),
  (14, 'travaux',    'Demandes d''acompte',                                        'todo',  null,      null,  null),
  (15, 'travaux',    'Réception des travaux & levée des réserves',                 'todo',  null,      null,  null),
  (16, 'travaux',    'Versement des aides & solde',                                'todo',  null,      'P2c', null)
),
rk (phase, rang) as (values ('diagnostic', 0), ('etudes', 1), ('travaux', 2))
insert into taches (copro_id, phase, title, status, tag, jalon, due_label, position)
select c.id, t.phase::phase_copro, t.title,
       (case
          when rt.rang < rc.rang then 'done'   -- phase déjà passée
          when rt.rang > rc.rang then 'todo'   -- phase à venir
          else t.statut_courant                -- phase courante du dossier
        end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.organisation_id = (select id from organisations where slug = 'immium-laemmel')
  and not exists (select 1 from taches x where x.copro_id = c.id);

-- ========== Comptes de l'organisation ==========
-- Mot de passe provisoire commun : à changer à la première connexion via
-- « Mot de passe oublié » (le flux de réinitialisation Supabase est en place).
with nouveaux (email, full_name, initials, job_title, avatar_color, org_role) as (values
  ('lucie.chatteleyn@immium.com',  'Lucie CHATTELEYN',  'LC', 'Directrice — IMMIUM Laemmel',   '#1F5C4A', 'directeur'),
  ('claude.lobstein@immium.com',   'Claude LOBSTEIN',   'CL', 'Gestionnaire de copropriété',   '#2E6F9E', 'gestionnaire'),
  ('nicolas.schmieg@immium.com',   'Nicolas SCHMIEG',   'NS', 'Gestionnaire de copropriété',   '#8A5A2B', 'gestionnaire'),
  ('christine.vautier@immium.com', 'Christine VAUTIER', 'CV', 'Gestionnaire de copropriété',   '#7A4F86', 'gestionnaire')
),
crees as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt('Laemmel-2026!', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  from nouveaux n
  where not exists (select 1 from auth.users u where lower(u.email) = n.email)
  returning id, email
),
ident as (
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select c.id::text, c.id,
         jsonb_build_object('sub', c.id::text, 'email', c.email, 'email_verified', true),
         'email', now(), now()
  from crees c
  returning user_id
)
insert into profiles (user_id, full_name, initials, role, job_title, avatar_color)
select c.id, n.full_name, n.initials, 'syndic', n.job_title, n.avatar_color
from crees c join nouveaux n on n.email = c.email
on conflict (user_id) do nothing;

-- ========== Rattachements ==========
-- Lucie Chatteleyn : directrice → tout le portefeuille de l'enseigne.
insert into organisation_membres (organisation_id, user_id, org_role)
select o.id, p.user_id,
       (case when lower(u.email) = 'lucie.chatteleyn@immium.com' then 'directeur' else 'gestionnaire' end)::org_role
from organisations o
cross join auth.users u
join profiles p on p.user_id = u.id
where o.slug = 'immium-laemmel'
  and lower(u.email) in (
    'lucie.chatteleyn@immium.com', 'claude.lobstein@immium.com',
    'nicolas.schmieg@immium.com', 'christine.vautier@immium.com'
  )
on conflict (organisation_id, user_id) do update set org_role = excluded.org_role;

-- Gestionnaires : périmètre = les copros dont ils sont le gestionnaire au fichier.
insert into copro_members (copro_id, user_id, member_role)
select c.id, p.user_id, 'syndic'
from coproprietes c
join auth.users u on lower(u.email) = lower(c.gestionnaire_email)
join profiles p on p.user_id = u.id
where c.organisation_id = (select id from organisations where slug = 'immium-laemmel')
on conflict (copro_id, user_id) do nothing;

commit;
