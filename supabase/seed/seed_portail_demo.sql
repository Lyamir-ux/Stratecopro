-- Compte copropriétaire de démo pour le portail (phase 2).
-- Identifiants : copro@demo.strateco.fr / Demo-Copro-2026!  (à changer)
-- Rattache le compte au copropriétaire Renaissance possédant le plus de lots.
-- Idempotent : ne fait rien si le compte existe déjà.

do $$
declare
  v_uid uuid := gen_random_uuid();
  v_cp uuid;
  v_nom text;
begin
  if exists (select 1 from auth.users where email = 'copro@demo.strateco.fr') then
    raise notice 'Compte démo déjà présent — rien à faire.';
    return;
  end if;

  -- copropriétaire Renaissance avec le plus de lots (démo multi-lots), sans compte
  select cp.id, cp.nom into v_cp, v_nom
  from coproprietaires cp
  join coproprietes c on c.id = cp.copro_id and c.slug = 'renaissance'
  join lots l on l.coproprietaire_id = cp.id
  where cp.user_id is null
  group by cp.id, cp.nom
  order by count(l.id) desc, cp.nom
  limit 1;

  if v_cp is null then
    raise exception 'Aucun copropriétaire Renaissance disponible pour la démo.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'copro@demo.strateco.fr', crypt('Demo-Copro-2026!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'copro@demo.strateco.fr', 'email_verified', true),
    'email', v_uid::text, now(), now(), now()
  );

  insert into profiles (user_id, full_name, initials, role, job_title)
  values (
    v_uid, v_nom,
    upper(left(split_part(v_nom, ' ', 1), 1) || coalesce(left(split_part(v_nom, ' ', 2), 1), '')),
    'copro', null
  );

  update coproprietaires
  set user_id = v_uid, email = 'copro@demo.strateco.fr'
  where id = v_cp;

  raise notice 'Compte démo créé pour % (coproprietaire %).', v_nom, v_cp;
end $$;
