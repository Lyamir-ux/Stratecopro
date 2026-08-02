-- Compte syndic de démo pour l'espace syndic (phase 2).
-- Identifiants : syndic@demo.strateco.fr / Demo-Syndic-2026!  (à changer)
-- Rattache le compte (copro_members, member_role 'syndic') à 3 copropriétés :
-- Renaissance (scénario partagé + enquête + choix — la plus riche pour la démo),
-- Nouvelle Cité (travaux) et Cours Vauban (études).
-- Idempotent : ne fait rien si le compte existe déjà.

do $$
declare
  v_uid uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'syndic@demo.strateco.fr') then
    raise notice 'Compte démo syndic déjà présent — rien à faire.';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'syndic@demo.strateco.fr', crypt('Demo-Syndic-2026!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'syndic@demo.strateco.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );

  insert into profiles (user_id, full_name, initials, role, job_title)
  values (v_uid, 'Camille Aubry', 'CA', 'syndic', 'Gestionnaire de copropriété');

  insert into copro_members (copro_id, user_id, member_role)
  select c.id, v_uid, 'syndic'
  from coproprietes c
  where c.slug in ('renaissance', 'nouvelle-cite', 'cours-vauban');

  raise notice 'Compte démo syndic créé (% copros rattachées).',
    (select count(*) from copro_members where user_id = v_uid);
end $$;
