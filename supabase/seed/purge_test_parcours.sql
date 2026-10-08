-- Purge complète de l'organisation de test SYNDIC TEST PARCOURS (slug test-parcours).
-- Supprime les 4 copropriétés test-* (Metz, Nancy, Strasbourg, Colmar), tout ce qui
-- s'y rattache (y compris ce que les testeurs y ont créé : réponses d'enquête, choix,
-- adhésions, fichiers, messages, bulletins...), les éventuels dossiers PPT / demandes
-- d'AMO de l'organisation, puis l'organisation elle-même.
-- Rejouer ensuite seed_test_parcours.sql (bloc par bloc, dans l'ordre) pour repartir
-- d'un état propre.
--
-- Ne touche à RIEN d'autre : tout est filtré par le slug test-parcours. En particulier
-- les COMPTES des testeurs (Marius ONBUS, Pierre MAXTAFF, Cyrielle ONTHEMIC) sont
-- conservés : ce sont de vraies personnes. Seule leur fiche de copropriétaire disparaît
-- avec la copropriété. Le Storage n'est jamais touché (jamais de DELETE sur
-- storage.objects) : d'éventuels fichiers déposés par les testeurs restent à retirer
-- depuis l'application.
--
-- Supabase est en plan Free, sans sauvegarde : la suppression est irréversible.
-- Pas de psql sur le poste : jouer le contenu du bloc DO via le MCP execute_sql.

begin;

do $$
declare
  v_org uuid;
  v_copros uuid[];
  r record;
begin
  select id into v_org from organisations where slug = 'test-parcours';
  if v_org is null then
    raise notice 'Organisation de test absente - rien à purger.';
    return;
  end if;

  select coalesce(array_agg(id), '{}') into v_copros
  from coproprietes where organisation_id = v_org;

  -- ppt_coproprietes.organisation_id est en RESTRICT : à supprimer avant l'organisation.
  delete from ppt_coproprietes where organisation_id = v_org;
  delete from demandes_amo where organisation_id = v_org;

  -- Petits-enfants sans colonne copro_id : à vider avant leurs parents.
  delete from plans_individuels where scenario_id in
    (select id from scenarios_financiers where copro_id = any(v_copros));
  delete from lot_tantiemes where lot_id in
    (select id from lots where copro_id = any(v_copros));
  delete from enquete_reponses where enquete_id in
    (select id from enquetes where copro_id = any(v_copros));

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

  raise notice 'Organisation de test purgée (% copropriétés).', coalesce(array_length(v_copros, 1), 0);
end $$;

commit;
