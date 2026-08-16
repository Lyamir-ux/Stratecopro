-- Compte AMO de démo pour tester l'espace équipe (publication de
-- consultations, réponses aux questions, Paramètres…) sans utiliser un
-- compte nominatif.
-- Identifiants : amo@demo.strateco.fr / Demo-AMO-2026!  (à changer)
-- Idempotent : ne fait rien si le compte existe déjà.

do $$
declare
  v_uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'amo@demo.strateco.fr') then
    raise notice 'Compte démo AMO déjà présent — rien à faire.';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'amo@demo.strateco.fr', crypt('Demo-AMO-2026!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'amo@demo.strateco.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );

  insert into profiles (user_id, full_name, initials, role, job_title)
  values (v_uid, 'Démo AMO', 'DA', 'amo', 'Chef de projet AMO (démo)');

  raise notice 'Compte démo AMO créé.';
end $$;
