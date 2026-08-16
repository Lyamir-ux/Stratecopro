-- Comptes nominatifs de l'équipe Strat Eco pour la campagne de test.
-- Mot de passe aléatoire inconnu de tous : chaque membre passe par
-- « Mot de passe oublié » à sa première connexion.
-- Idempotent : les adresses déjà présentes sont ignorées.

do $$
declare
  v_uid uuid;
  v_membre jsonb;
  v_email text;
  v_nom text;
begin
  for v_membre in
    select * from jsonb_array_elements('[
      {"email": "louaa@strateco.fr",  "nom": "Louaa"},
      {"email": "radia@strateco.fr",  "nom": "Radia"},
      {"email": "kawtar@strateco.fr", "nom": "Kawtar"},
      {"email": "zahra@strateco.fr",  "nom": "Zahra"},
      {"email": "marius@strateco.fr", "nom": "Marius"},
      {"email": "ryan@strateco.fr",   "nom": "Ryan"},
      {"email": "pierre@strateco.fr", "nom": "Pierre"},
      {"email": "wafaa@strateco.fr",  "nom": "Wafaa"},
      {"email": "thea@strateco.fr",   "nom": "Théa"},
      {"email": "louis@strateco.fr",  "nom": "Louis"},
      {"email": "lakdar@strateco.fr", "nom": "Lakdar"}
    ]'::jsonb)
  loop
    v_email := v_membre->>'email';
    v_nom := v_membre->>'nom';

    if exists (select 1 from auth.users where email = v_email) then
      raise notice 'Compte % déjà présent — ignoré.', v_email;
      continue;
    end if;

    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email,
      crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', v_uid::text, now(), now(), now()
    );

    insert into profiles (user_id, full_name, initials, role)
    values (v_uid, v_nom, upper(left(v_nom, 2)), 'amo');

    raise notice 'Compte % créé.', v_email;
  end loop;
end $$;
