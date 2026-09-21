-- 0083 - Suivi PPT : lever un bloquant remarque par remarque
--
-- Un contrôle bloquant se levait par son code. Or un code de la plateforme se
-- répète : C04 (ordre de grandeur) et P20 (taux de TVA) produisent une remarque
-- par poste. Cocher l'une des cases levait donc les autres du même code, et le
-- syndic les voyait toutes « traitées » avec un seul motif.
--
-- p_levees accepte désormais des objets {code, poste_code, libelle} : la clé
-- d'une remarque. Les tableaux de codes nus (bundle en retard) restent acceptés
-- et lèvent alors tout le code, comme avant.

/* Clé d'une remarque : code + poste + libellé (miroir de cleControle côté app). */
create or replace function ppt_cle_controle(c jsonb)
returns text language sql immutable as $$
  select coalesce(c ->> 'code', '') || '|' || coalesce(c ->> 'poste_code', '') || '|' || coalesce(c ->> 'libelle', '');
$$;

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
  v_map jsonb := '{}'::jsonb;  -- code_source -> poste id
  v_codes_lies text[];
  v_annee_base int;
begin
  if not is_dirigeant() then raise exception 'Validation réservée au dirigeant'; end if;
  select * into r from ppt_rapports where id = p_rapport_id;
  if r.id is null then raise exception 'Rapport introuvable'; end if;
  if r.statut = 'valide' then raise exception 'Rapport déjà validé'; end if;
  select json_corrige into j from ppt_analyses where rapport_id = p_rapport_id;
  if j is null then raise exception 'Aucune analyse importée pour ce rapport'; end if;

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
    insert into ppt_postes (
      ppt_copro_id, rapport_id, code_source, libelle, libelle_source, ouvrage, batiment, priorite, critere,
      annee_prevue, annee_origine, cout_ht_base, cout_origine, tva_pct, avec_moe, gain_energetique_pct,
      commentaire, position
    ) values (
      r.ppt_copro_id, p_rapport_id, t ->> 'id', coalesce(t ->> 'libelle', t ->> 'ouvrage', 'Poste'),
      (select s ->> 'libelle_source' from jsonb_array_elements(coalesce(j -> 'travaux_source', '[]'::jsonb)) s where s ->> 'id' = t ->> 'id' limit 1),
      t ->> 'ouvrage', t ->> 'batiment', ppt_code_priorite(t ->> 'priorite'), t ->> 'critere',
      nullif(t ->> 'annee_prevue', '')::int,
      case when t ->> 'annee_origine' in ('source', 'deduite', 'a_confirmer') then t ->> 'annee_origine' else null end,
      nullif(t ->> 'cout_ht_base_eur', '')::numeric,
      case when lower(t ->> 'cout_ht_origine') like 'converti%' then 'converti_depuis_ttc'
           when lower(t ->> 'cout_ht_origine') like 'estime%' then 'estime_strateco'
           when t ->> 'cout_ht_origine' is null then null else 'source' end,
      nullif(t ->> 'tva_pct', '')::numeric,
      coalesce((t ->> 'avec_moe')::boolean, ppt_code_priorite(t ->> 'priorite') = 'preservation'),
      case when nullif(t ->> 'gain_energetique_pct', '') is null then null
           else (t ->> 'gain_energetique_pct')::numeric end,
      t ->> 'commentaire', v_pos
    ) returning id into v_poste;
    v_map := v_map || jsonb_build_object(coalesce(t ->> 'id', v_pos::text), v_poste);
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

  -- la levée de bloquants (codes + motif) est journalisée par la revue avant l'appel
  -- (ppt_enregistrer_revue) ; le journal de la copro en garde aussi la trace ci-dessous
  perform ppt_journaliser(r.ppt_copro_id, p_rapport_id, 'validation',
    jsonb_build_object('postes', v_pos, 'annee_base', v_annee_base, 'remplace', v_prev, 'leves', coalesce(p_levees, '[]'::jsonb)));
end;
$$;
revoke execute on function ppt_valider_rapport(uuid, jsonb) from anon, public;
