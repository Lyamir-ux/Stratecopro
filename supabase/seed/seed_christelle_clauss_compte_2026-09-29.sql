-- Accès syndic Christelle CLAUSS - demande d'Amir du 29/09/2026 : « crée le compte
-- syndic de Mohamed BELKACEMI sans diffusion ».
--
-- Même construction que seed_citya_comptes.sql (20/09/2026) : compte confirmé
-- d'office, mot de passe aléatoire inconnu de tous, marqueur mot_de_passe_provisoire,
-- fiche profil syndic, gestionnaire de l'enseigne, aucun e-mail envoyé. Au moment
-- de la diffusion, il passe par « Mot de passe oublié » sur l'écran de connexion.
-- Son accès à LA ROSERAIE (gestionnaire_email de la fiche) est posé par
-- sync_rattachement_gestionnaire. Idempotent : un e-mail déjà connu n'est pas recréé.

with nouveaux (org_slug, full_name, email, initials) as (values
  ('christelle-clauss', 'Mohamed BELKACEMI', 'mbelkacemi@christelleclauss.com', 'MB')
),
crees as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         n.email, extensions.crypt(gen_random_uuid()::text || gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', n.full_name, 'mot_de_passe_provisoire', true), now(), now(),
         '', '', '', ''
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

-- Rattrapage des accès aux dossiers (hors visibilité des CTE).
select sync_rattachement_gestionnaire(null);
