-- 0098 - Suivi PPT : schéma pppt-verif/1.2 (requête du 24/09/2026)
--
-- Le skill pppt-verif produit désormais la 1.2 après validation des
-- propositions : révision du dossier, postes source exclus, réévaluation des
-- prix (cout_ht_source_eur × reevaluation_prix_coef = cout_ht_base_eur),
-- micro-postes regroupés (regroupe_ids), années lissées. Le JSON reste stocké
-- tel quel dans ppt_analyses (json_verif / json_corrige, révision comprise) ;
-- cette migration :
--   1. ajoute aux postes matérialisés le montant source, le coefficient et les
--      postes source regroupés, et élargit les origines d'année et de coût ;
--   2. n'accepte à l'import que les versions 1.1 et 1.2 (message du contrat),
--      et écarte `remarques_plateforme` (sortie de la plateforme, recalculée) ;
--   3. matérialise les nouveaux champs à la validation ; une remarque posée sur
--      un poste source regroupé est rattachée à la ligne qui le regroupe ;
--   4. convertit en points de pourcentage les gains de la démo « Les Tilleuls »,
--      seule analyse 1.0 stockée en fractions (0.25 = 25 %) : la règle est
--      désormais `_pct` = points, sans heuristique sur la valeur.
-- Sans perte : les postes existants reçoivent montant source = HT de base et
-- coefficient 1 (valeurs par défaut de la 1.2). Retour arrière en fin de fichier.

-- 1. Postes ----------------------------------------------------------------
alter table ppt_postes
  add column if not exists cout_ht_source numeric,
  add column if not exists reevaluation_prix_coef numeric not null default 1,
  add column if not exists regroupe_ids text[];

comment on column ppt_postes.cout_ht_source is 'Montant HT du document source, avant réévaluation des prix (pppt-verif 1.2 cout_ht_source_eur)';
comment on column ppt_postes.reevaluation_prix_coef is 'Coefficient de réévaluation appliqué : cout_ht_base = cout_ht_source × coef';
comment on column ppt_postes.regroupe_ids is 'Postes source fusionnés dans la ligne (micro-postes regroupés, pppt-verif 1.2)';

update ppt_postes set cout_ht_source = cout_ht_base
 where cout_ht_source is null and rapport_id is not null and cout_ht_base is not null;

alter table ppt_postes drop constraint if exists ppt_postes_annee_origine_check;
alter table ppt_postes add constraint ppt_postes_annee_origine_check
  check (annee_origine in ('source', 'deduite', 'a_confirmer', 'lissee'));
alter table ppt_postes drop constraint if exists ppt_postes_cout_origine_check;
alter table ppt_postes add constraint ppt_postes_cout_origine_check
  check (cout_origine in ('source', 'converti_depuis_ttc', 'estime_strateco', 'reevalue_prix_source', 'regroupement_micro_postes'));

-- 2. Import : versions 1.1 et 1.2 ----------------------------------------------
create or replace function ppt_importer_analyse(p_rapport_id uuid, p_json jsonb, p_mode text default 'manuel_skill')
returns void language plpgsql security definer set search_path = public as $$
declare
  r ppt_rapports%rowtype;
  v_version text := p_json ->> 'schema_version';
  v_json jsonb := p_json - 'remarques_plateforme';
begin
  if not (is_dirigeant() or auth.role() = 'service_role') then
    raise exception 'Import réservé au dirigeant';
  end if;
  select * into r from ppt_rapports where id = p_rapport_id;
  if r.id is null then raise exception 'Rapport introuvable'; end if;
  if r.statut = 'valide' then raise exception 'Rapport déjà validé : déposez une nouvelle version'; end if;
  if v_version is null or v_version not in ('pppt-verif/1.1', 'pppt-verif/1.2') then
    raise exception 'Version de schéma non prise en charge : % (versions acceptées : 1.1, 1.2)', coalesce(v_version, 'absente');
  end if;

  insert into ppt_analyses (rapport_id, json_verif, json_corrige, importe_par)
  values (p_rapport_id, v_json, v_json, auth.uid())
  on conflict (rapport_id) do update
    set json_verif = excluded.json_verif, json_corrige = excluded.json_corrige,
        importe_par = excluded.importe_par, importe_le = now();

  update ppt_rapports set
    statut = 'a_relire',
    schema_version = v_version,
    nature_detectee = v_json -> 'document_source' ->> 'nature_detectee',
    date_document = nullif(v_json -> 'document_source' ->> 'date_document', '')::date,
    prestataire = v_json -> 'document_source' -> 'auteur' ->> 'raison_sociale',
    prestataire_type = v_json -> 'document_source' -> 'auteur' ->> 'type',
    verdict = v_json -> 'synthese' ->> 'verdict',
    score_conformite_pct = nullif(v_json -> 'synthese' ->> 'score_conformite_pct', '')::numeric,
    score_coherence_pct = nullif(v_json -> 'synthese' ->> 'score_coherence_pct', '')::numeric
  where id = p_rapport_id;

  insert into ppt_traitements (rapport_id, mode, schema_version, statut, termine_le)
  values (p_rapport_id, p_mode, v_version, 'termine', now());

  perform ppt_journaliser(r.ppt_copro_id, p_rapport_id, 'analyse_importee',
    jsonb_build_object('verdict', v_json -> 'synthese' ->> 'verdict', 'mode', p_mode,
      'schema_version', v_version, 'revision', v_json -> 'revision' -> 'numero'));
end;
$$;
revoke execute on function ppt_importer_analyse(uuid, jsonb, text) from anon, public;

-- 3. Validation : nouveaux champs des postes ----------------------------------
create or replace function ppt_valider_rapport(p_rapport_id uuid, p_levees jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r ppt_rapports%rowtype;
  j jsonb;
  t jsonb;
  ctl jsonb;
  v_prev uuid;
  v_pos int := 0;
  v_poste uuid;
  -- levées : clés de remarque {code, poste_code, libelle} ; les codes nus des
  -- anciens clients restent acceptés et lèvent alors tout le code
  v_cles_levees text[] := array(
    select ppt_cle_controle(e) from jsonb_array_elements(coalesce(p_levees, '[]'::jsonb)) e
     where jsonb_typeof(e) = 'object');
  v_codes_leves text[] := array(
    select e #>> '{}' from jsonb_array_elements(coalesce(p_levees, '[]'::jsonb)) e
     where jsonb_typeof(e) = 'string');
  v_bloquants int;
  v_prop_attente int;
  v_prop_codes text;
  v_propositions jsonb;
  v_map jsonb := '{}'::jsonb;  -- code_source (ou poste source regroupé) -> poste id
  v_codes_lies text[];
  v_annee_base int;
  v_regroupe text[];
begin
  if not is_dirigeant() then raise exception 'Validation réservée au dirigeant'; end if;
  select * into r from ppt_rapports where id = p_rapport_id;
  if r.id is null then raise exception 'Rapport introuvable'; end if;
  if r.statut = 'valide' then raise exception 'Rapport déjà validé'; end if;
  select json_corrige into j from ppt_analyses where rapport_id = p_rapport_id;
  if j is null then raise exception 'Aucune analyse importée pour ce rapport'; end if;

  -- propositions du skill : toutes tranchées avant la création du tableau.
  -- Un statut absent vaut « à valider », comme à l'import côté app.
  v_propositions := case when jsonb_typeof(j -> 'propositions') = 'array' then j -> 'propositions' else '[]'::jsonb end;
  select count(*), string_agg(p ->> 'code', ', ' order by p ->> 'code')
    into v_prop_attente, v_prop_codes
  from jsonb_array_elements(v_propositions) p
  where upper(coalesce(p ->> 'statut_validation', 'A_VALIDER')) = 'A_VALIDER';
  if v_prop_attente > 0 then
    raise exception 'Validation impossible : % proposition(s) du skill encore à valider (%)', v_prop_attente, v_prop_codes;
  end if;

  -- bloquants non conformes non levés (grille du skill + remarques plateforme)
  select count(*) into v_bloquants
  from (
    select c from jsonb_array_elements(coalesce(j -> 'controles', '[]'::jsonb)) c
    union all
    select c from jsonb_array_elements(coalesce(j -> 'remarques_plateforme', '[]'::jsonb)) c
  ) x
  where upper(c ->> 'severite') = 'BLOQUANT' and upper(c ->> 'statut') = 'NON_CONFORME'
    and not ppt_cle_controle(c) = any (v_cles_levees)
    and not (c ->> 'code') = any (v_codes_leves);
  if v_bloquants > 0 then
    raise exception 'Validation impossible : % contrôle(s) bloquant(s) non levé(s)', v_bloquants;
  end if;

  v_annee_base := nullif(j -> 'parametres_ppt' ->> 'annee_base', '')::int;

  -- version précédente validée du même type : archivée, ses postes désactivés
  select id into v_prev from ppt_rapports
   where ppt_copro_id = r.ppt_copro_id and type = r.type and statut = 'valide' and id <> p_rapport_id
   order by valide_le desc limit 1;
  if v_prev is not null then
    update ppt_postes set actif = false where ppt_copro_id = r.ppt_copro_id and rapport_id = v_prev and actif;
  end if;

  -- postes
  for t in select * from jsonb_array_elements(coalesce(j -> 'travaux_normalises', '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    v_regroupe := case when jsonb_typeof(t -> 'regroupe_ids') = 'array'
                       then array(select jsonb_array_elements_text(t -> 'regroupe_ids')) end;
    if v_regroupe = '{}'::text[] then v_regroupe := null; end if;
    insert into ppt_postes (
      ppt_copro_id, rapport_id, code_source, libelle, libelle_source, ouvrage, batiment, priorite, critere,
      annee_prevue, annee_origine, cout_ht_base, cout_origine, cout_ht_source, reevaluation_prix_coef, regroupe_ids,
      tva_pct, avec_moe, gain_energetique_pct, commentaire, position
    ) values (
      r.ppt_copro_id, p_rapport_id, t ->> 'id', coalesce(t ->> 'libelle', t ->> 'ouvrage', 'Poste'),
      coalesce(
        (select s ->> 'libelle_source' from jsonb_array_elements(coalesce(j -> 'travaux_source', '[]'::jsonb)) s where s ->> 'id' = t ->> 'id' limit 1),
        (select string_agg(s ->> 'libelle_source', ' ; ' order by array_position(v_regroupe, s ->> 'id'))
           from jsonb_array_elements(coalesce(j -> 'travaux_source', '[]'::jsonb)) s where s ->> 'id' = any (v_regroupe))),
      t ->> 'ouvrage', t ->> 'batiment', ppt_code_priorite(t ->> 'priorite'), t ->> 'critere',
      nullif(t ->> 'annee_prevue', '')::int,
      case when t ->> 'annee_origine' in ('source', 'deduite', 'a_confirmer', 'lissee') then t ->> 'annee_origine' else null end,
      nullif(t ->> 'cout_ht_base_eur', '')::numeric,
      case when lower(t ->> 'cout_ht_origine') like 'converti%' then 'converti_depuis_ttc'
           when lower(t ->> 'cout_ht_origine') like 'estime%' then 'estime_strateco'
           when lower(t ->> 'cout_ht_origine') like 'reevalue%' then 'reevalue_prix_source'
           when lower(t ->> 'cout_ht_origine') like 'regroupement%' then 'regroupement_micro_postes'
           when t ->> 'cout_ht_origine' is null then null else 'source' end,
      coalesce(nullif(t ->> 'cout_ht_source_eur', '')::numeric, nullif(t ->> 'cout_ht_base_eur', '')::numeric),
      coalesce(nullif(t ->> 'reevaluation_prix_coef', '')::numeric, 1),
      v_regroupe,
      nullif(t ->> 'tva_pct', '')::numeric,
      -- avec_moe est porté par la ligne (1.2 : moe_sur_energetique l'explique) ; la priorité ne sert qu'à défaut
      coalesce((t ->> 'avec_moe')::boolean, ppt_code_priorite(t ->> 'priorite') = 'preservation'),
      -- points de pourcentage (0.5 = 0,5 %), stockés tels quels
      case when nullif(t ->> 'gain_energetique_pct', '') is null then null
           else (t ->> 'gain_energetique_pct')::numeric end,
      t ->> 'commentaire', v_pos
    ) returning id into v_poste;
    v_map := v_map || jsonb_build_object(coalesce(t ->> 'id', v_pos::text), v_poste);
    -- une remarque posée sur un poste source regroupé vise la ligne qui le regroupe
    if v_regroupe is not null then
      select v_map || coalesce(jsonb_object_agg(x, v_poste), '{}'::jsonb) into v_map from unnest(v_regroupe) x;
    end if;
  end loop;

  -- remarques : grille du skill (reglementaire / coherence) + remarques plateforme
  for ctl in
    select c from jsonb_array_elements(coalesce(j -> 'controles', '[]'::jsonb)) c
    union all
    select c from jsonb_array_elements(coalesce(j -> 'remarques_plateforme', '[]'::jsonb)) c
  loop
    -- un contrôle CONFORME ou SANS_OBJET n'est pas une remarque
    if upper(ctl ->> 'statut') in ('CONFORME', 'SANS_OBJET') then continue; end if;
    insert into ppt_remarques (
      ppt_copro_id, rapport_id, poste_id, code, famille, severite, statut, libelle, constat, attendu, observe, ecart, action, page,
      visible_syndic, traitee
    ) values (
      r.ppt_copro_id, p_rapport_id,
      (v_map ->> (ctl ->> 'poste_code'))::uuid,
      coalesce(ctl ->> 'code', '?'),
      case when ctl ->> 'famille' in ('reglementaire', 'coherence', 'plateforme') then ctl ->> 'famille' else 'plateforme' end,
      ppt_code_severite(ctl ->> 'severite'),
      ppt_code_statut_controle(ctl ->> 'statut'),
      coalesce(ctl ->> 'libelle', ctl ->> 'code', 'Remarque'),
      ctl ->> 'constat', ctl ->> 'attendu', ctl ->> 'observe', ctl ->> 'ecart', ctl ->> 'action',
      nullif(ctl ->> 'page', '')::int,
      coalesce((ctl ->> 'visible_syndic')::boolean, true),
      ppt_cle_controle(ctl) = any (v_cles_levees) or (ctl ->> 'code') = any (v_codes_leves)
    );
  end loop;

  -- lien postes ↔ contrôles (controles_lies des travaux normalisés)
  for t in select * from jsonb_array_elements(coalesce(j -> 'travaux_normalises', '[]'::jsonb)) loop
    v_codes_lies := array(select jsonb_array_elements_text(coalesce(t -> 'controles_lies', '[]'::jsonb)));
    if array_length(v_codes_lies, 1) > 0 then
      update ppt_remarques set poste_id = (v_map ->> (t ->> 'id'))::uuid
       where rapport_id = p_rapport_id and poste_id is null and code = any (v_codes_lies);
    end if;
  end loop;

  -- fiche copropriété : champs vides complétés depuis le document
  update ppt_coproprietes c set
    adresse = coalesce(c.adresse, j -> 'copropriete' ->> 'adresse'),
    code_postal = coalesce(c.code_postal, j -> 'copropriete' ->> 'code_postal'),
    commune = coalesce(c.commune, j -> 'copropriete' ->> 'commune'),
    immatriculation_rnc = coalesce(c.immatriculation_rnc, j -> 'copropriete' ->> 'immatriculation_rnc'),
    annee_construction = coalesce(c.annee_construction, nullif(j -> 'copropriete' ->> 'annee_construction', '')::int),
    nb_batiments = coalesce(c.nb_batiments, nullif(j -> 'copropriete' ->> 'nb_batiments', '')::int),
    nb_lots = coalesce(c.nb_lots, nullif(j -> 'copropriete' ->> 'nb_lots_total', '')::int),
    nb_logements = coalesce(c.nb_logements, nullif(j -> 'copropriete' ->> 'nb_logements', '')::int),
    surface_m2 = coalesce(c.surface_m2, nullif(j -> 'copropriete' ->> 'surface_m2', '')::numeric),
    surface_type = coalesce(c.surface_type, case when j -> 'copropriete' ->> 'surface_type' in ('SHAB','SHON','SDP','DPE') then j -> 'copropriete' ->> 'surface_type' end),
    chauffage = coalesce(c.chauffage, case when j -> 'copropriete' ->> 'chauffage' in ('collectif','individuel','mixte') then j -> 'copropriete' ->> 'chauffage' end),
    energie_chauffage = coalesce(c.energie_chauffage, j -> 'copropriete' ->> 'energie_chauffage'),
    etiquette_energie = coalesce(c.etiquette_energie, case when j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'etiquette_energie' in ('A','B','C','D','E','F','G') then j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'etiquette_energie' end),
    etiquette_ges = coalesce(c.etiquette_ges, case when j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'etiquette_ges' in ('A','B','C','D','E','F','G') then j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'etiquette_ges' end),
    cep_kwhep_m2_an = coalesce(c.cep_kwhep_m2_an, nullif(j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'cep_kwhep_m2_an', '')::numeric),
    date_dpe = coalesce(c.date_dpe, nullif(j -> 'diagnostics_sources' -> 'dpe_collectif' ->> 'date', '')::date)
  where c.id = r.ppt_copro_id;

  update ppt_rapports set statut = 'valide', valide_par = auth.uid(), valide_le = now(), remplace_rapport_id = v_prev
   where id = p_rapport_id;

  -- la levée de bloquants (codes + motif) et chaque décision sur une proposition
  -- sont journalisées par la revue avant l'appel (ppt_enregistrer_revue) ; le
  -- journal de la copro en garde aussi la trace ci-dessous, avec la révision
  perform ppt_journaliser(r.ppt_copro_id, p_rapport_id, 'validation',
    jsonb_build_object(
      'postes', v_pos, 'annee_base', v_annee_base, 'remplace', v_prev, 'leves', coalesce(p_levees, '[]'::jsonb),
      'revision', j -> 'revision' -> 'numero',
      'propositions', (
        select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (
          select upper(coalesce(p ->> 'statut_validation', 'A_VALIDER')) s, count(*) n
          from jsonb_array_elements(v_propositions) p group by 1
        ) x)));
end;
$$;
revoke execute on function ppt_valider_rapport(uuid, jsonb) from anon, public;

-- 4. Démo « Les Tilleuls » : gains en fractions → points ------------------------
-- Cible : analyses 1.0 dont tous les gains renseignés sont ≤ 1 (la démo seule ;
-- VERLAINE, 1.0 aussi, est déjà en points : 5 / 7.4 / 32.3).
do $$
declare
  v_cibles uuid[];
begin
  select coalesce(array_agg(a.rapport_id), '{}') into v_cibles
  from ppt_analyses a join ppt_rapports r on r.id = a.rapport_id
  where r.schema_version = 'pppt-verif/1.0'
    and exists (select 1 from jsonb_array_elements(a.json_corrige -> 'travaux_normalises') t where nullif(t ->> 'gain_energetique_pct', '') is not null)
    and not exists (select 1 from jsonb_array_elements(a.json_corrige -> 'travaux_normalises') t where (nullif(t ->> 'gain_energetique_pct', ''))::numeric > 1);

  update ppt_postes set gain_energetique_pct = round(gain_energetique_pct * 100, 4)
   where rapport_id = any (v_cibles) and gain_energetique_pct is not null;

  update ppt_analyses a set
    json_verif = jsonb_set(a.json_verif, '{travaux_normalises}', (
      select coalesce(jsonb_agg(case when nullif(t ->> 'gain_energetique_pct', '') is null then t
                                     else jsonb_set(t, '{gain_energetique_pct}', to_jsonb(round((t ->> 'gain_energetique_pct')::numeric * 100, 4))) end
                                order by o), '[]'::jsonb)
      from jsonb_array_elements(a.json_verif -> 'travaux_normalises') with ordinality e(t, o))),
    json_corrige = jsonb_set(a.json_corrige, '{travaux_normalises}', (
      select coalesce(jsonb_agg(case when nullif(t ->> 'gain_energetique_pct', '') is null then t
                                     else jsonb_set(t, '{gain_energetique_pct}', to_jsonb(round((t ->> 'gain_energetique_pct')::numeric * 100, 4))) end
                                order by o), '[]'::jsonb)
      from jsonb_array_elements(a.json_corrige -> 'travaux_normalises') with ordinality e(t, o)))
  where a.rapport_id = any (v_cibles);
end;
$$;

-- Retour arrière (à exécuter à la main si besoin) :
--   update ppt_postes set annee_origine = 'deduite' where annee_origine = 'lissee';
--   update ppt_postes set cout_origine = 'source' where cout_origine in ('reevalue_prix_source', 'regroupement_micro_postes');
--   alter table ppt_postes drop constraint ppt_postes_annee_origine_check;
--   alter table ppt_postes add constraint ppt_postes_annee_origine_check check (annee_origine in ('source', 'deduite', 'a_confirmer'));
--   alter table ppt_postes drop constraint ppt_postes_cout_origine_check;
--   alter table ppt_postes add constraint ppt_postes_cout_origine_check check (cout_origine in ('source', 'converti_depuis_ttc', 'estime_strateco'));
--   alter table ppt_postes drop column cout_ht_source, drop column reevaluation_prix_coef, drop column regroupe_ids;
--   puis rejouer ppt_importer_analyse de 0072 et ppt_valider_rapport de 0085 ;
--   démo : diviser par 100 les gains des postes et des JSON du rapport 1.0 « Résidence Les Tilleuls (démo PPT) ».
