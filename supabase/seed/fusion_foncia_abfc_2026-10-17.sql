-- Fusion des agences Foncia en « Foncia ABFC » - demande d'Amir du 17/10/2026
--
-- « Il va falloir fusionner les 4 organisations FONCIA (toutes sauf FONCIA
-- Thionville) en une seule organisation : FONCIA ABFC, les gestionnaires
-- restent les mêmes. » Joué en prod le 17/10/2026 (bloc unique, tout ou rien).
--
-- - Foncia Strasbourg (14 dossiers, 9 membres dont le directeur Francesco
--   MOTTA CALDERONE, gardé directeur de toute l'enseigne sur consigne d'Amir)
--   est renommée « Foncia ABFC » : même identifiant ; le trigger
--   organisations_propage_nom (0061) reporte le nom sur ses dossiers.
-- - Colmar (2 dossiers, 2 gestionnaires), Mulhouse (3, 3) et Sarrebourg (2, 1)
--   la rejoignent : membres d'abord (le trigger d'accès des dossiers cherche le
--   gestionnaire parmi les membres de l'enseigne), puis dossiers, nom du syndic
--   compris. Gestionnaire désigné et accès copro_members inchangés.
-- - Facturation (0168) : « demander, lors de la facturation, la bonne adresse
--   en proposant l'une des quatre adresses » : l'enseigne passe « au choix »
--   avec les adresses des 4 agences, et n'a plus d'adresse unique.
-- - Rapport mensuel : les envois d'octobre des 4 agences sont regroupés sur la
--   ligne de l'enseigne (unique par période), pour garder les 14 destinataires.
-- - Les 3 organisations vidées sont supprimées (aucun tampon, PPT ni demande
--   d'AMO). Aucun e-mail.
do $$
declare
  v_abfc constant uuid := 'e2072638-6b89-4cb1-818f-11b662a5826c';  -- Foncia Strasbourg
  v_autres constant uuid[] := array[
    'a13e284e-470d-4ac9-8ca2-7e1a90d26a87',  -- Foncia Colmar
    '777a6060-9310-4e55-958a-ac4ec2d9a0aa',  -- Foncia Mulhouse
    'adc1444f-2367-4d74-84e4-c6405f4b84b9'   -- Foncia Sarrebourg
  ]::uuid[];
  v_noms text[];
  v_adresses text[];
  n int;
begin
  select array_agg(lower(btrim(nom))) into v_noms from organisations where id = any(v_autres);
  if cardinality(v_noms) <> 3 or not exists (select 1 from organisations where id = v_abfc and nom = 'Foncia Strasbourg') then
    raise exception 'Organisations Foncia introuvables ou déjà fusionnées';
  end if;

  -- adresses des 4 agences, par ville : Colmar, Mulhouse, Sarrebourg, Strasbourg
  select array_agg(adresse_facturation order by nom) into v_adresses
  from organisations
  where (id = any(v_autres) or id = v_abfc) and nullif(btrim(adresse_facturation), '') is not null;
  if cardinality(v_adresses) <> 4 then
    raise exception 'Adresses de facturation incomplètes : %', v_adresses;
  end if;

  -- 1. Foncia Strasbourg devient Foncia ABFC
  update organisations
     set nom = 'Foncia ABFC', slug = 'foncia-abfc',
         adresse_facturation = null, adresse_facturation_au_choix = true, adresses_facturation = v_adresses
   where id = v_abfc;

  -- 2. membres des 3 agences
  update organisation_membres set organisation_id = v_abfc where organisation_id = any(v_autres);

  -- 3. dossiers des 3 agences ; le nom du syndic suit s'il était celui de l'agence
  update coproprietes
     set organisation_id = v_abfc,
         syndic_name = case
           when nullif(btrim(syndic_name), '') is null or lower(btrim(syndic_name)) = any(v_noms) then 'Foncia ABFC'
           else syndic_name end
   where organisation_id = any(v_autres);

  -- 4. rapport mensuel : envois regroupés par période
  if exists (select 1 from rapport_syndic_envois r
             where r.organisation_id = any(v_autres)
               and not exists (select 1 from rapport_syndic_envois k where k.organisation_id = v_abfc and k.periode = r.periode)) then
    raise exception 'Envoi du rapport sans équivalent chez Foncia Strasbourg : à traiter à la main';
  end if;
  update rapport_syndic_envois k
     set destinataires = coalesce(k.destinataires, '[]'::jsonb) || a.dest,
         envoyes = coalesce(k.envoyes, 0) + a.env,
         erreurs = coalesce(k.erreurs, 0) + a.err
    from (select r.periode,
                 (select coalesce(jsonb_agg(e.v), '[]'::jsonb)
                    from rapport_syndic_envois r2, jsonb_array_elements(coalesce(r2.destinataires, '[]'::jsonb)) as e(v)
                   where r2.organisation_id = any(v_autres) and r2.periode = r.periode) as dest,
                 sum(coalesce(r.envoyes, 0))::int as env,
                 sum(coalesce(r.erreurs, 0))::int as err
            from rapport_syndic_envois r
           where r.organisation_id = any(v_autres)
           group by r.periode) a
   where k.organisation_id = v_abfc and k.periode = a.periode;

  -- 5. organisations vidées
  delete from organisations where id = any(v_autres);

  -- contrôles
  select count(*) into n from coproprietes where organisation_id = v_abfc;
  if n <> 21 then raise exception 'Foncia ABFC : % dossiers au lieu de 21', n; end if;
  select count(*) into n from organisation_membres where organisation_id = v_abfc;
  if n <> 15 then raise exception 'Foncia ABFC : % membres au lieu de 15', n; end if;
  select count(*) into n from coproprietes where organisation_id = v_abfc and syndic_name is distinct from 'Foncia ABFC';
  if n <> 0 then raise exception '% dossiers gardent un autre nom de syndic', n; end if;
end;
$$;
