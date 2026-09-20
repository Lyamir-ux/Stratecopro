-- Accès syndic Citya - feedback Amir du 20/09/2026 (20:09, page /parametres) :
-- « Crée les accès pour Citya Immo Cat [= Citya Immo 4] et Citya Ruhl Segesca sans
-- diffusion aux personnes intéressées. »
--
-- Joué en prod le 20/09/2026. Un compte gestionnaire par gestionnaire désigné sur
-- les dossiers des deux enseignes (coproprietes.gestionnaire_nom / _email, seed_citya.sql) :
--   Citya Immo 4        : Eric LEROUX, Marine MAISSE, Sybille BAERENZUNG
--   Citya Ruhl Segesca  : Edgar RATEVOSSIAN, Gabrielle OLLAND, Jean-Claude REHM,
--                         Jean-François ROUSSET, Serge STOECKEL, Thomas DECKER, Thuy NGUYEN
-- Même construction que l'edge function creer-collaborateur (compte confirmé d'office,
-- marqueur mot_de_passe_provisoire, fiche profil syndic, membre de l'enseigne) mais
-- SANS mot de passe transmissible : le mot de passe est aléatoire et inconnu de tous,
-- aucun e-mail n'est envoyé. Au moment de la diffusion, chaque gestionnaire passe par
-- « Mot de passe oublié » sur l'écran de connexion ; /reinitialisation efface le marqueur.
-- Les accès aux dossiers (copro_members) sont posés par le trigger 0063 à partir de
-- l'e-mail du gestionnaire ; un rattrapage explicite suit (les CTE d'une même
-- instruction ne voient pas les lignes des autres CTE).
-- Idempotent : un e-mail déjà connu d'auth.users n'est pas recréé.

with nouveaux (org_slug, full_name, email, initials) as (values
  ('citya-immo-4', 'Eric LEROUX', 'erleroux@citya.com', 'EL'),
  ('citya-immo-4', 'Marine MAISSE', 'mmaisse@citya.com', 'MM'),
  ('citya-immo-4', 'Sybille BAERENZUNG', 'sbaerenzung@citya.com', 'SB'),
  ('citya-ruhl-segesca', 'Edgar RATEVOSSIAN', 'eratevossian@citya.com', 'ER'),
  ('citya-ruhl-segesca', 'Gabrielle OLLAND', 'golland@citya.com', 'GO'),
  ('citya-ruhl-segesca', 'Jean-Claude REHM', 'jcrehm@citya.com', 'JR'),
  ('citya-ruhl-segesca', 'Jean-François ROUSSET', 'jfrousset@citya.com', 'JR'),
  ('citya-ruhl-segesca', 'Serge STOECKEL', 'sstoeckel@citya.com', 'SS'),
  ('citya-ruhl-segesca', 'Thomas DECKER', 'tdecker@citya.com', 'TD'),
  ('citya-ruhl-segesca', 'Thuy NGUYEN', 'tnguyen@citya.com', 'TN')
),
crees as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', n.full_name, 'mot_de_passe_provisoire', true), now(), now()
  from nouveaux n
  where not exists (select 1 from auth.users u where lower(u.email) = n.email)
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
  select c.id, n.full_name, n.initials, 'syndic', 'Gestionnaire de copropriété'
  from crees c join nouveaux n on n.email = c.email
  returning user_id
)
insert into organisation_membres (organisation_id, user_id, org_role)
select o.id, c.id, 'gestionnaire'::org_role
from crees c join nouveaux n on n.email = c.email join organisations o on o.slug = n.org_slug;

-- Rattrapage des accès aux dossiers (trigger 0063, hors visibilité des CTE).
select sync_rattachement_gestionnaire(null);
