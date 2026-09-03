-- Purge complète de l'organisation de démo SYNDIC HORIZON GRAND EST.
-- Supprime les 7 copropriétés demo-*, tout ce qui s'y rattache (y compris ce
-- que les commerciaux ont créé pendant leurs démos : fichiers, checklists,
-- notes, bulletins…), les comptes @syndic-horizon-demo.fr et l'organisation.
-- Rejouer ensuite seed_demo_horizon.sql puis seed_demo_horizon_vitrine.sql
-- pour repartir d'un état propre.
--
-- Ne touche à RIEN d'autre : tout est filtré par le slug demo-syndic-horizon
-- et le domaine @syndic-horizon-demo.fr.

begin;

do $$
declare
  v_org uuid;
  v_copros uuid[];
  r record;
begin
  select id into v_org from organisations where slug = 'demo-syndic-horizon';
  if v_org is null then
    raise notice 'Organisation de démo absente - rien à purger.';
    return;
  end if;

  select coalesce(array_agg(id), '{}') into v_copros
  from coproprietes where organisation_id = v_org;

  -- Petits-enfants sans colonne copro_id : à vider avant leurs parents.
  delete from plans_individuels where scenario_id in
    (select id from scenarios_financiers where copro_id = any(v_copros));
  delete from lot_tantiemes where lot_id in
    (select id from lots where copro_id = any(v_copros));
  delete from signataires where bulletin_id in
    (select id from bulletins where copro_id = any(v_copros));
  delete from checklist_items where checklist_id in
    (select id from checklists where copro_id = any(v_copros));
  delete from consultation_docs where consultation_id in
    (select id from consultations where copro_id = any(v_copros));
  delete from consultation_questions where consultation_id in
    (select id from consultations where copro_id = any(v_copros));
  delete from consultation_acces where consultation_id in
    (select id from consultations where copro_id = any(v_copros));
  delete from candidatures where consultation_id in
    (select id from consultations where copro_id = any(v_copros));
  delete from enquete_reponses where enquete_id in
    (select id from enquetes where copro_id = any(v_copros));
  delete from message_lectures where message_id in
    (select id from messages_projet where copro_id = any(v_copros));

  -- Toutes les tables portant un copro_id, découvertes dynamiquement :
  -- la purge reste valable quand une nouvelle table de dossier apparaît.
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'copro_id'
      and t.table_type = 'BASE TABLE' and c.table_name <> 'coproprietes'
  loop
    execute format('delete from public.%I where copro_id = any($1)', r.table_name)
    using v_copros;
  end loop;

  delete from coproprietes where id = any(v_copros);
  delete from organisation_membres where organisation_id = v_org;
  delete from organisations where id = v_org;

  raise notice 'Organisation de démo purgée (% copropriétés).', coalesce(array_length(v_copros, 1), 0);
end $$;

-- Comptes fictifs (profiles/identities suivent par FK, on nettoie explicitement).
do $$
declare
  v_uids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_uids
  from auth.users where lower(email) like '%@syndic-horizon-demo.fr';
  if coalesce(array_length(v_uids, 1), 0) = 0 then return; end if;

  delete from copro_members where user_id = any(v_uids);
  delete from profiles where user_id = any(v_uids);
  delete from auth.identities where user_id = any(v_uids);
  delete from auth.users where id = any(v_uids);
end $$;

commit;
