-- Organisation de démo commerciale SYNDIC HORIZON GRAND EST (100 % fictive).
-- Sert aux commerciaux pour présenter le logiciel aux syndics et copropriétaires :
-- 1 directrice + 3 gestionnaires fictifs, 7 copropriétés fictives réparties sur
-- le Grand Est (2 diagnostic / 3 études / 2 travaux) pour raconter tout le cycle.
--
-- Isolation : slugs préfixés demo-, tag « Démo commerciale », e-mails sur le
-- domaine non routable @syndic-horizon-demo.fr. Purge : purge_demo_horizon.sql.
-- La copro vitrine (LE PARC DES CIGOGNES) est peuplée par
-- seed_demo_horizon_vitrine.sql (généré) - à jouer APRÈS ce fichier.
--
-- Comptes (mot de passe commun Horizon-2026!, à changer si diffusé) :
--   helene.marchal@syndic-horizon-demo.fr  directrice (voit les 7 dossiers)
--   thomas.keller@syndic-horizon-demo.fr   gestionnaire Alsace (4 dossiers)
--   nadia.benali@syndic-horizon-demo.fr    gestionnaire Lorraine (2 dossiers)
--   claire.vasseur@syndic-horizon-demo.fr  gestionnaire Champagne (1 dossier)
--
-- Rejouable : tous les inserts sont idempotents (on conflict / not exists).

begin;

insert into organisations (nom, slug) values ('SYNDIC HORIZON GRAND EST', 'demo-syndic-horizon')
on conflict (slug) do nothing;

-- ========== Les 7 copropriétés ==========
with org as (select id from organisations where slug = 'demo-syndic-horizon'),
src (name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet,
     gestionnaire_nom, gestionnaire_email, energy_before, energy_after, gain_pct, progress) as (values
  ('LE PARC DES CIGOGNES',       'demo-parc-des-cigognes',       28,  '12-14 rue des Cigognes',   '67000', 'Strasbourg',            'travaux',    'Sarah', 'Thomas Keller', 'thomas.keller@syndic-horizon-demo.fr', 'F', 'C', 72,   55),
  ('RESIDENCE GRAFFENSTADEN',    'demo-residence-graffenstaden', 45,  '8 rue des Vignes',         '67400', 'Illkirch-Graffenstaden','etudes',     'Sarah', 'Thomas Keller', 'thomas.keller@syndic-horizon-demo.fr', 'E', 'C', 48,   35),
  ('LE KOENIGSBOURG',            'demo-le-koenigsbourg',         30,  '5 rue des Remparts',       '68000', 'Colmar',                'diagnostic', 'Mehdi', 'Thomas Keller', 'thomas.keller@syndic-horizon-demo.fr', 'E', null, null, 10),
  ('RESIDENCE DES TROIS TOURS',  'demo-trois-tours',             120, '47 avenue d''Altkirch',    '68100', 'Mulhouse',              'etudes',     'Mehdi', 'Thomas Keller', 'thomas.keller@syndic-horizon-demo.fr', 'F', 'C', 55,   30),
  ('LE SAINT-LIVIER',            'demo-le-saint-livier',         48,  '21 rue des Tanneurs',      '57000', 'Metz',                  'etudes',     'Sarah', 'Nadia Benali',  'nadia.benali@syndic-horizon-demo.fr',  'E', 'C', 45,   40),
  ('RESIDENCE STANISLAS',        'demo-residence-stanislas',     72,  '15 rue de la Commanderie', '54000', 'Nancy',                 'travaux',    'Mehdi', 'Nadia Benali',  'nadia.benali@syndic-horizon-demo.fr',  'F', 'B', 68,   65),
  ('LES COTEAUX DE CHAMPAGNE',   'demo-coteaux-de-champagne',    36,  '18 rue de Cernay',         '51100', 'Reims',                 'diagnostic', 'Sarah', 'Claire Vasseur','claire.vasseur@syndic-horizon-demo.fr','G', null, null, 5)
)
insert into coproprietes (
  name, slug, nb_logements, adresse, code_postal, city, phase, chef_projet,
  gestionnaire_nom, gestionnaire_email, energy_before, energy_after, gain_pct,
  progress, fragile, syndic_name, tag, organisation_id
)
select s.name, s.slug, s.nb_logements, s.adresse, s.code_postal, s.city, s.phase::phase_copro,
       s.chef_projet, s.gestionnaire_nom, s.gestionnaire_email, s.energy_before, s.energy_after,
       s.gain_pct, s.progress, false, 'SYNDIC HORIZON GRAND EST', 'Démo commerciale', org.id
from src s cross join org
on conflict (slug) do nothing;

-- ========== Bâtiment déclaré (code 01, comme useCreateCopro) ==========
insert into batiments (copro_id, code, position, declare_creation)
select c.id, '01', 0, true
from coproprietes c
where c.organisation_id = (select id from organisations where slug = 'demo-syndic-horizon')
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
where c.organisation_id = (select id from organisations where slug = 'demo-syndic-horizon')
  and not exists (select 1 from taches x where x.copro_id = c.id);

-- ========== Comptes des gestionnaires fictifs ==========
with nouveaux (email, full_name, initials, job_title, avatar_color) as (values
  ('helene.marchal@syndic-horizon-demo.fr', 'Hélène Marchal', 'HM', 'Directrice de copropriété',    '#2E6F9E'),
  ('thomas.keller@syndic-horizon-demo.fr',  'Thomas Keller',  'TK', 'Gestionnaire de copropriété',  '#1F5C4A'),
  ('nadia.benali@syndic-horizon-demo.fr',   'Nadia Benali',   'NB', 'Gestionnaire de copropriété',  '#7A4F86'),
  ('claire.vasseur@syndic-horizon-demo.fr', 'Claire Vasseur', 'CV', 'Gestionnaire de copropriété',  '#B8562F')
),
crees as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt('Horizon-2026!', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', ''
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

-- ========== Rattachements à l'organisation ==========
-- Hélène Marchal est directrice : elle voit les 7 dossiers via son rôle d'organisation.
insert into organisation_membres (organisation_id, user_id, org_role)
select o.id, u.id,
       (case when lower(u.email) = 'helene.marchal@syndic-horizon-demo.fr'
             then 'directeur' else 'gestionnaire' end)::org_role
from organisations o
cross join auth.users u
where o.slug = 'demo-syndic-horizon'
  and lower(u.email) in (
    'helene.marchal@syndic-horizon-demo.fr', 'thomas.keller@syndic-horizon-demo.fr',
    'nadia.benali@syndic-horizon-demo.fr', 'claire.vasseur@syndic-horizon-demo.fr'
  )
on conflict (organisation_id, user_id) do nothing;

-- Périmètre des gestionnaires = les copros dont ils portent l'adresse au fichier.
insert into copro_members (copro_id, user_id, member_role)
select c.id, u.id, 'syndic'
from coproprietes c
join auth.users u on lower(u.email) = lower(c.gestionnaire_email)
where c.organisation_id = (select id from organisations where slug = 'demo-syndic-horizon')
on conflict (copro_id, user_id) do nothing;

commit;
