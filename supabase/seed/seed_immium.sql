-- Portefeuille IMMIUM — extraction base AMO Copro du 15/08/2026
-- (fichier « Affaires immium.xlsx », 18 copropriétés / 995 logements).
-- BOUDHORS était déjà en base et rattaché à l'enseigne : elle porte le total à 19.
--
-- IMMIUM et IMMIUM Laemmel sont deux enseignes DISTINCTES malgré la proximité
-- des noms : ne pas fusionner, la direction de l'une ne voit pas l'autre.
--
-- Correspondance état AG → phase du dossier (voir seed_immium_laemmel.sql) :
--   « P2 voté » et « P3 programmé » → etudes ; « P3 voté » → travaux.
--
-- Chaque copropriété est créée comme le ferait useCreateCopro() : un bâtiment
-- déclaré (code 01) + le plan de tâches gabarit positionné sur la phase.
-- Rejouable : tous les inserts sont idempotents (on conflict / not exists).

begin;

insert into organisations (nom, slug) values ('IMMIUM', 'immium')
on conflict (slug) do nothing;

-- ========== Les 18 copropriétés ==========
with org as (select id from organisations where slug = 'immium'),
src (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet, gestionnaire_nom, gestionnaire_email) as (values
  ('L''HIPPOCRATE',              'l-hippocrate',              17,  '2 rue Stenger Bachman',                                 '67100', 'Strasbourg',    'etudes',  'Kawtar', 'Etienne SPENATO',    'etienne.spenato@immium.com'),
  ('RESIDENCE ECO',              'residence-eco',             218, null,                                                    '67200', 'Strasbourg',    'travaux', 'Louaa',  'Gwennaelle AUBRY',   'gwen.aubry@immium.com'),
  ('19-21 Faubourg National',    '19-21-faubourg-national',   98,  '19-21 Faubourg National',                               '67000', 'Strasbourg',    'etudes',  'Radia',  'Isabelle GEBEL',     'isabelle.gebel@immium.com'),
  ('3 rue Mariano',              '3-rue-mariano',             9,   '3 rue Mariano',                                         '67000', 'Strasbourg',    'etudes',  'Wafaa',  'Isabelle GEBEL',     'isabelle.gebel@immium.com'),
  ('DORNACH III',                'dornach-iii',               11,  '119 avenue de Colmar',                                  '67100', 'Strasbourg',    'etudes',  'Kawtar', 'Isabelle GEBEL',     'isabelle.gebel@immium.com'),
  ('Le Churchill',               'le-churchill',              76,  '14 A/B, 16 rue du Ballon',                              '67000', 'Strasbourg',    'etudes',  'Kawtar', 'Marie MALARD',       'marie.malard@immium.com'),
  ('GALILEE',                    'galilee',                   70,  null,                                                    '67400', null,            'travaux', 'Wafaa',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('LES URBAINES',               'les-urbaines',              201, '228 avenue de Colmar',                                  '67000', 'Strasbourg',    'travaux', 'Louaa',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('RUE DE BARR - OBERNAI',      'rue-de-barr-obernai',       77,  '7 rue de Barr',                                         '67000', 'Strasbourg',    'etudes',  'Radia',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('LE BELLINI',                 'le-bellini',                31,  '3 rue de Thann - 4 rue de Bourtzwiller',                '67100', 'Strasbourg',    'etudes',  'Radia',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('2-4-6 RUE DE TOURAINE',      '2-4-6-rue-de-touraine',     30,  '2-4-6 rue de Touraine',                                 '67300', 'Schiltigheim',  'travaux', 'Wafaa',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('LA VIOLETTE',                'la-violette',               24,  '213/215 route de Mittelhausbergen - 2 rue de Reitwiller','67200', 'Strasbourg',    'etudes',  'Kawtar', 'Olivier PLAT',       'olivier.plat@immium.com'),
  ('LE KURVAU',                  'le-kurvau',                 36,  '11 rue Fréconrupt',                                     '67100', 'Strasbourg',    'etudes',  'Radia',  'Olivier PLAT',       'olivier.plat@immium.com'),
  ('LE SCHIMPER',                'le-schimper',               31,  '5 rue Schimper',                                        '67000', 'Strasbourg',    'etudes',  'Kawtar', 'Olivier PLAT',       'olivier.plat@immium.com'),
  ('9 RUE DE LA GARE (67300)',   '9-rue-de-la-gare-67300',    6,   '9 rue de la Gare',                                      '67300', 'Schiltigheim',  'etudes',  'Kawtar', 'Sofia DIDOU',        'sofia.didou@immium.com'),
  ('ST MICHEL - STE MARGUERITE', 'st-michel-ste-marguerite',  36,  '9 rue Saint-Michel - 12 rue Sainte-Marguerite',          '67000', 'Strasbourg',    'etudes',  'Wafaa',  null,                 null),
  ('14-16 rue de Limoges',       '14-16-rue-de-limoges',      12,  '14-16 rue de Limoges',                                  '67610', 'La Wantzenau',  'etudes',  'Zahra',  null,                 null),
  ('8-10 RUE SAINT YRIEIX',      '8-10-rue-saint-yrieix',     12,  '8-10 rue de Saint-Yrieix',                              '67610', 'La Wantzenau',  'etudes',  'Zahra',  null,                 null)
)
insert into coproprietes (
  name, slug, nb_logements, adresse, code_postal, city, phase,
  chef_projet, gestionnaire_nom, gestionnaire_email, syndic_name, organisation_id
)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro,
       s.chef_projet, s.gestionnaire_nom, s.gestionnaire_email, 'IMMIUM', org.id
from src s cross join org
on conflict (slug) do nothing;

-- ========== Bâtiment déclaré (les lots ne sont pas encore importés) ==========
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id = (select id from organisations where slug = 'immium')
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
  (8,  'etudes',     'Consultation & sélection des entreprises',                   'todo',  null,      null,  null),
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
          when rt.rang < rc.rang then 'done'
          when rt.rang > rc.rang then 'todo'
          else t.statut_courant
        end)::statut_tache,
       t.tag, t.jalon, t.due_label, t.position
from coproprietes c
cross join tpl t
join rk rt on rt.phase = t.phase
join rk rc on rc.phase = c.phase::text
where c.organisation_id = (select id from organisations where slug = 'immium')
  and not exists (select 1 from taches x where x.copro_id = c.id);

-- ========== Comptes des gestionnaires ==========
-- Mot de passe provisoire commun : à changer à la première connexion via
-- « Mot de passe oublié ».
-- ATTENTION : l'adresse de Marie Malard était marquée « (déduit) » dans le
-- fichier source — à confirmer avant de lui communiquer ses accès.
with nouveaux (email, full_name, initials, avatar_color) as (values
  ('etienne.spenato@immium.com', 'Etienne SPENATO',   'ES', '#2E6F9E'),
  ('gwen.aubry@immium.com',      'Gwennaelle AUBRY',  'GA', '#7A4F86'),
  ('isabelle.gebel@immium.com',  'Isabelle GEBEL',    'IG', '#8A5A2B'),
  ('marie.malard@immium.com',    'Marie MALARD',      'MM', '#1F5C4A'),
  ('olivier.plat@immium.com',    'Olivier PLAT',      'OP', '#B8562F'),
  ('sofia.didou@immium.com',     'Sofia DIDOU',       'SD', '#3E6B57')
),
crees as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt('Immium-2026!', extensions.gen_salt('bf')), now(),
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
select c.id, n.full_name, n.initials, 'syndic', 'Gestionnaire de copropriété', n.avatar_color
from crees c join nouveaux n on n.email = c.email
on conflict (user_id) do nothing;

-- ========== Rattachements ==========
-- Aucun directeur désigné pour IMMIUM à ce stade : tous gestionnaires.
insert into organisation_membres (organisation_id, user_id, org_role)
select o.id, p.user_id, 'gestionnaire'::org_role
from organisations o
cross join auth.users u
join profiles p on p.user_id = u.id
where o.slug = 'immium'
  and lower(u.email) in (
    'etienne.spenato@immium.com', 'gwen.aubry@immium.com', 'isabelle.gebel@immium.com',
    'marie.malard@immium.com', 'olivier.plat@immium.com', 'sofia.didou@immium.com'
  )
on conflict (organisation_id, user_id) do nothing;

-- Périmètre = les copros dont ils sont le gestionnaire au fichier (BOUDHORS
-- incluse pour Olivier Plat, elle porte déjà son adresse).
insert into copro_members (copro_id, user_id, member_role)
select c.id, p.user_id, 'syndic'
from coproprietes c
join auth.users u on lower(u.email) = lower(c.gestionnaire_email)
join profiles p on p.user_id = u.id
where c.organisation_id = (select id from organisations where slug = 'immium')
on conflict (copro_id, user_id) do nothing;

commit;
