-- Base prestataires de démo (reprend les organismes de la maquette) + compte
-- de connexion prestataire rattaché à Atelier Vernet (MOE).
-- Identifiants : presta@demo.strateco.fr / Demo-Presta-2026!  (à changer)
-- Idempotent : ne fait rien si le compte existe déjà.

insert into prestataires (raison_sociale, contact_nom, email, telephone, ville, types) values
  ('Atelier Vernet Architectes', 'Claire Vernet',   'presta@demo.strateco.fr',        '03 88 10 20 30', 'Strasbourg', '{moe}'),
  ('BET Rhin Énergie',           'Marc Hoffmann',   'contact@rhin-energie.demo',      '03 88 11 21 31', 'Schiltigheim', '{moe,autre}'),
  ('Diag''Est Contrôles',        'Sonia Weber',     'contact@diagest.demo',           '03 88 12 22 32', 'Strasbourg', '{diag}'),
  ('Préventis SPS',              'Karim Lakhdar',   'contact@preventis-sps.demo',     '03 88 13 23 33', 'Illkirch', '{sps}'),
  ('Coordo Grand Est',           'Julie Muller',    'contact@coordo-grandest.demo',   '03 88 14 24 34', 'Haguenau', '{ct,sps}')
on conflict (email) do nothing;

do $$
declare
  v_uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'presta@demo.strateco.fr') then
    raise notice 'Compte prestataire démo déjà présent — rien à faire.';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'presta@demo.strateco.fr', crypt('Demo-Presta-2026!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'presta@demo.strateco.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );

  insert into profiles (user_id, full_name, initials, role, job_title)
  values (v_uid, 'Claire Vernet', 'CV', 'presta', 'Architecte — Atelier Vernet');

  update prestataires set user_id = v_uid where email = 'presta@demo.strateco.fr';

  raise notice 'Compte prestataire démo créé (Atelier Vernet, MOE).';
end $$;
