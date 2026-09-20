-- 0077 - Import du portefeuille du gestionnaire dans la branche Suivi PPT
-- (demande Amir 20/09/2026). Le gestionnaire dépose un tableau : nom de la
-- copropriété, adresse, commune, nombre de logements, « copropriété de plus de
-- 15 ans ? » (oui / non), « PPPT présenté ? » (oui / non). Chaque ligne crée la
-- copropriété PPT ou complète la fiche existante (même nom, accents et
-- ponctuation ignorés), puis est rapprochée de la base d'assistance à maîtrise
-- d'ouvrage (coproprietes de la même enseigne, même nom ou même adresse) : la
-- passerelle copro_id est posée et le listing affiche « En rénovation » avec
-- la phase du dossier Strat Eco.

-- ========== 1. Colonnes déclaratives du portefeuille ==========
alter table ppt_coproprietes
  add column if not exists plus_de_15_ans boolean,
  add column if not exists pppt_presente boolean,
  add column if not exists importe_le timestamptz;
comment on column ppt_coproprietes.plus_de_15_ans is 'Déclaré par le syndic à l''import du portefeuille : immeuble de plus de 15 ans (PPPT obligatoire) (0077)';
comment on column ppt_coproprietes.pppt_presente is 'Déclaré par le syndic à l''import du portefeuille : un PPPT a déjà été présenté en AG (0077)';
comment on column ppt_coproprietes.importe_le is 'Dernier import du portefeuille ayant créé ou complété cette ligne (0077)';

-- ========== 2. Normalisation d'un libellé (sans extension unaccent) ==========
-- minuscules, accents retirés, tout ce qui n'est pas lettre ou chiffre devient
-- un espace, espaces de bord retirés ; préfixes « résidence » / « copropriété »
-- ignorés pour que « Résidence Les Tilleuls » retrouve « Les Tilleuls ».
create or replace function ppt_normaliser(s text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      btrim(regexp_replace(
        translate(lower(coalesce(s, '')),
          'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
          'aaaaaaceeeeiiiinooooouuuuyy'),
        '[^a-z0-9]+', ' ', 'g')),
      '^(residence|copropriete|copro|immeuble) ', ''),
    '');
$$;

-- ========== 3. Rapprochement avec la base AMO ==========
-- Un seul dossier de rénovation globale de la même enseigne, non archivé, dont
-- le nom (ou l'adresse, dans la même commune si connue) correspond.
create or replace function ppt_rapprocher_reno(p_id uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  c ppt_coproprietes;
  v_ids uuid[];
begin
  select * into c from ppt_coproprietes where id = p_id;
  if c.id is null or c.organisation_id is null then return null; end if;

  select coalesce(array_agg(r.id), '{}') into v_ids
    from coproprietes r
   where r.organisation_id = c.organisation_id and r.deleted_at is null
     and ppt_normaliser(r.name) is not null
     and ppt_normaliser(r.name) = ppt_normaliser(c.nom);
  if array_length(v_ids, 1) = 1 then return v_ids[1]; end if;

  if ppt_normaliser(c.adresse) is not null then
    select coalesce(array_agg(r.id), '{}') into v_ids
      from coproprietes r
     where r.organisation_id = c.organisation_id and r.deleted_at is null
       and ppt_normaliser(r.adresse) = ppt_normaliser(c.adresse)
       and (ppt_normaliser(c.commune) is null or ppt_normaliser(r.city) is null
            or ppt_normaliser(r.city) = ppt_normaliser(c.commune));
    if array_length(v_ids, 1) = 1 then return v_ids[1]; end if;
  end if;
  return null;
end;
$$;
revoke execute on function ppt_rapprocher_reno(uuid) from anon, public;

-- Phase du dossier de rénovation globale rapproché (null si aucun ou archivé) :
-- security definer pour que le syndic la voie sans droit de lecture sur coproprietes.
create or replace function ppt_phase_reno(p_copro uuid)
returns text language sql stable security definer set search_path = public as $$
  select phase::text from coproprietes where id = p_copro and deleted_at is null;
$$;
revoke execute on function ppt_phase_reno(uuid) from anon, public;

-- ========== 4. La passerelle copro_id reste réservée à Strat Eco… sauf pendant l'import ==========
create or replace function ppt_protege_copro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.role() is null or is_amo()
     or current_setting('app.ppt_import', true) = 'on' then
    return new;
  end if;
  if new.organisation_id is distinct from old.organisation_id
     or new.deleted_at is distinct from old.deleted_at
     or new.copro_id is distinct from old.copro_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Ces champs de la copropriété sont réservés à l''équipe Strat Eco';
  end if;
  return new;
end;
$$;

-- ========== 5. RPC d'import ==========
-- p_lignes : tableau JSON de { nom, adresse, code_postal, commune, nb_logements,
-- plus_de_15_ans, pppt_presente }. Le déposant devient gestionnaire des
-- copropriétés créées (sauf en aperçu AMO) ; les fiches existantes gardent leur
-- gestionnaire et leurs données, seuls les champs vides sont complétés, les deux
-- réponses oui / non sont mises à jour quand elles sont renseignées.
create or replace function ppt_importer_portefeuille(p_org uuid, p_lignes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_uid uuid := auth.uid();
  v_amo boolean;
  v_nom_gest text;
  v_email_gest text;
  v_id uuid;
  v_trouvee boolean;
  v_reno uuid;
  v_plus15 boolean;
  v_pppt boolean;
  v_logements int;
  v_creees int := 0;
  v_maj int := 0;
  v_ignorees int := 0;
  v_rapprochees int := 0;
  v_ids uuid[] := '{}';
begin
  if v_uid is null then raise exception 'Authentification requise'; end if;
  v_amo := is_amo();
  if p_org is null or not (v_amo or ppt_is_membre_org(p_org)) then
    raise exception 'Vous n''êtes pas membre de cette enseigne';
  end if;
  if not exists (select 1 from organisations where id = p_org and module_ppt) and not v_amo then
    raise exception 'Le module Suivi des PPT n''est pas activé pour cette enseigne';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Lignes attendues sous forme de tableau';
  end if;
  if jsonb_array_length(p_lignes) > 2000 then
    raise exception 'Import limité à 2000 lignes par fichier';
  end if;

  if not v_amo then
    select p.full_name, lower(u.email) into v_nom_gest, v_email_gest
      from profiles p join auth.users u on u.id = p.user_id
     where p.user_id = v_uid;
  end if;

  perform set_config('app.ppt_import', 'on', true);

  for l in select * from jsonb_array_elements(p_lignes) loop
    if ppt_normaliser(l ->> 'nom') is null then
      v_ignorees := v_ignorees + 1;
      continue;
    end if;
    v_plus15 := case when jsonb_typeof(l -> 'plus_de_15_ans') = 'boolean' then (l ->> 'plus_de_15_ans')::boolean end;
    v_pppt := case when jsonb_typeof(l -> 'pppt_presente') = 'boolean' then (l ->> 'pppt_presente')::boolean end;
    v_logements := case when (l ->> 'nb_logements') ~ '^\d{1,6}$' then (l ->> 'nb_logements')::int end;

    select c.id into v_id
      from ppt_coproprietes c
     where c.organisation_id = p_org and c.deleted_at is null
       and ppt_normaliser(c.nom) = ppt_normaliser(l ->> 'nom')
     order by c.created_at
     limit 1;
    v_trouvee := v_id is not null;

    if v_trouvee then
      update ppt_coproprietes set
        adresse = coalesce(adresse, nullif(btrim(l ->> 'adresse'), '')),
        code_postal = coalesce(code_postal, nullif(btrim(l ->> 'code_postal'), '')),
        commune = coalesce(commune, nullif(btrim(l ->> 'commune'), '')),
        nb_logements = coalesce(nb_logements, v_logements),
        plus_de_15_ans = coalesce(v_plus15, plus_de_15_ans),
        pppt_presente = coalesce(v_pppt, pppt_presente),
        importe_le = now()
      where id = v_id;
      v_maj := v_maj + 1;
    else
      insert into ppt_coproprietes
        (organisation_id, nom, adresse, code_postal, commune, nb_logements, plus_de_15_ans, pppt_presente,
         gestionnaire_nom, gestionnaire_email, created_by, importe_le)
      values
        (p_org, btrim(l ->> 'nom'), nullif(btrim(l ->> 'adresse'), ''), nullif(btrim(l ->> 'code_postal'), ''),
         nullif(btrim(l ->> 'commune'), ''), v_logements, v_plus15, v_pppt,
         v_nom_gest, v_email_gest, v_uid, now())
      returning id into v_id;
      v_creees := v_creees + 1;
    end if;

    -- rapprochement avec la base AMO : seulement si la passerelle n'est pas déjà posée
    v_reno := null;
    if (select copro_id from ppt_coproprietes where id = v_id) is null then
      v_reno := ppt_rapprocher_reno(v_id);
      if v_reno is not null then
        update ppt_coproprietes set copro_id = v_reno where id = v_id;
        v_rapprochees := v_rapprochees + 1;
      end if;
    end if;

    perform ppt_journaliser(v_id, null, 'import',
      jsonb_build_object('creee', not v_trouvee, 'rapprochee', v_reno is not null,
                         'plus_de_15_ans', v_plus15, 'pppt_presente', v_pppt));
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object(
    'creees', v_creees,
    'mises_a_jour', v_maj,
    'ignorees', v_ignorees,
    'rapprochees', v_rapprochees,
    'en_reno', (select count(*) from ppt_coproprietes c where c.id = any (v_ids) and ppt_phase_reno(c.copro_id) is not null),
    'ids', to_jsonb(v_ids)
  );
end;
$$;
revoke execute on function ppt_importer_portefeuille(uuid, jsonb) from anon, public;
grant execute on function ppt_importer_portefeuille(uuid, jsonb) to authenticated;

-- ========== 6. Vue de synthèse : phase du dossier de rénovation rapproché ==========
create or replace view ppt_copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from ppt_postes p where p.ppt_copro_id = c.id and p.actif)::int as postes,
  (select coalesce(sum(p.cout_ht_base), 0) from ppt_postes p where p.ppt_copro_id = c.id and p.actif)::numeric as montant_ht_base,
  (select count(*) from ppt_postes p where p.ppt_copro_id = c.id and p.actif and p.cout_ht_base is null)::int as postes_non_chiffres,
  (select min(coalesce(p.annee_prochaine_presentation, p.annee_prevue)) from ppt_postes p
     where p.ppt_copro_id = c.id and p.actif and p.statut in ('programme', 'presente', 'rejete', 'reporte'))::int as prochaine_annee,
  (select max(a.date_ag) from ppt_ag a where a.ppt_copro_id = c.id) as derniere_ag,
  (select count(*) from ppt_ag a where a.ppt_copro_id = c.id)::int as nb_ag,
  (select r.statut from ppt_rapports r where r.ppt_copro_id = c.id and r.type = 'pppt' order by r.depose_le desc limit 1) as statut_rapport,
  (select r.valide_le from ppt_rapports r where r.ppt_copro_id = c.id and r.type = 'pppt' and r.statut = 'valide' order by r.valide_le desc limit 1) as valide_le,
  (select count(*) from ppt_rapports r where r.ppt_copro_id = c.id and r.statut in ('depose', 'en_analyse', 'a_relire'))::int as rapports_en_attente,
  (select count(*) from ppt_remarques m where m.ppt_copro_id = c.id and m.visible_syndic and not m.traitee
     and m.rapport_id in (select id from ppt_rapports r where r.ppt_copro_id = c.id and r.statut = 'valide'))::int as remarques_ouvertes,
  ppt_phase_reno(c.copro_id) as reno_phase
from ppt_coproprietes c;
