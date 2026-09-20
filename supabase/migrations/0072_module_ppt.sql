-- 0072 - Module « Suivi PPT » (brief du 20/09/2026, plan validé par Amir).
--
-- Second métier de l'espace syndic : rendre pilotables les PPPT (projets de
-- plan pluriannuel de travaux) reçus en PDF par les cabinets. Branche
-- volontairement ISOLÉE de la rénovation globale (décision d'Amir) : toutes
-- les tables portent le préfixe ppt_, rien n'est ajouté aux tables existantes
-- sauf le drapeau d'activation par enseigne (organisations.module_ppt).
--
-- Principes :
--   • le cabinet = organisations ; le gestionnaire = e-mail sur la fiche,
--     synchronisé vers ppt_affectations (historisé, modèle 0063) ;
--   • le JSON du skill pppt-verif (schéma pppt-verif/1.0) est la frontière :
--     importé à la main par le dirigeant en phase 1, produit par une edge
--     function plus tard - même import, même revue, même validation ;
--   • le syndic ne voit que du validé : postes et remarques ne sont
--     matérialisés qu'à la validation (RPC réservée au dirigeant) ; le JSON
--     de travail vit dans ppt_analyses, lisible par la seule équipe AMO ;
--   • rien n'est écrasé : nouveau PPPT = nouveau rapport, corrections
--     journalisées, affectations datées, journal en ajout seul.

-- ========== 0. Activation par enseigne ==========
alter table organisations add column if not exists module_ppt boolean not null default false;

-- ========== 1. Tables ==========

-- Hypothèses financières et taux d'honoraires de suivi de travaux du cabinet
create table ppt_parametres_org (
  organisation_id uuid primary key references organisations (id) on delete cascade,
  taux_honoraires_pct numeric not null default 3.0,
  base_honoraires text not null default 'ttc' check (base_honoraires in ('ht', 'ttc')),
  inflation_pct numeric not null default 3.5,
  moe_pct numeric not null default 6.0,
  syndic_pct numeric not null default 3.0,
  tva_facades_pct numeric not null default 10,
  tva_energetique_pct numeric not null default 5.5,
  updated_at timestamptz not null default now()
);

create table ppt_coproprietes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete restrict,
  nom text not null,
  adresse text,
  code_postal text,
  commune text,
  immatriculation_rnc text,
  annee_construction int,
  nb_batiments int,
  nb_lots int,
  nb_logements int,
  surface_m2 numeric,
  surface_type text check (surface_type in ('SHAB', 'SHON', 'SDP', 'DPE')),
  chauffage text check (chauffage in ('collectif', 'individuel', 'mixte')),
  energie_chauffage text,
  etiquette_energie char(1) check (etiquette_energie in ('A','B','C','D','E','F','G')),
  etiquette_ges char(1) check (etiquette_ges in ('A','B','C','D','E','F','G')),
  cep_kwhep_m2_an numeric,
  date_dpe date,
  fonds_travaux_solde numeric,
  fonds_travaux_cotisation_annuelle numeric,
  fonds_travaux_maj date,
  budget_previsionnel_annuel numeric,
  -- gestionnaire en clair (même parti pris que coproprietes 0023/0063)
  gestionnaire_nom text,
  gestionnaire_email text,
  -- passerelle facultative vers un dossier de rénovation globale
  copro_id uuid references coproprietes (id) on delete set null,
  created_by uuid references profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_ppt_copros_org on ppt_coproprietes (organisation_id);

-- Historique des gestionnaires (au is null = affectation courante)
create table ppt_affectations (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  user_id uuid references profiles (user_id) on delete set null,
  email text,
  nom text,
  du timestamptz not null default now(),
  au timestamptz
);
create index idx_ppt_affectations_copro on ppt_affectations (ppt_copro_id, au);
create index idx_ppt_affectations_user on ppt_affectations (user_id) where au is null;

create table ppt_rapports (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  type text not null default 'pppt'
    check (type in ('pppt', 'dpe_collectif', 'ppt_adopte', 'tableau_ppt', 'pv_ag', 'autre')),
  name text not null,
  storage_path text not null,
  size bigint,
  mime text,
  depose_par uuid references profiles (user_id) on delete set null,
  depose_le timestamptz not null default now(),
  statut text not null default 'depose'
    check (statut in ('depose', 'en_analyse', 'a_relire', 'valide', 'rejete', 'echec')),
  -- résumé issu du JSON importé
  schema_version text,
  nature_detectee text,
  date_document date,
  prestataire text,
  prestataire_type text,
  verdict text,
  score_conformite_pct numeric,
  score_coherence_pct numeric,
  remplace_rapport_id uuid references ppt_rapports (id) on delete set null,
  valide_par uuid references profiles (user_id) on delete set null,
  valide_le timestamptz,
  motif_rejet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ppt_rapports_copro on ppt_rapports (ppt_copro_id, type, statut);

-- JSON de l'analyse : sortie brute (immuable) et version de travail de la revue.
-- Table séparée : lisible par la seule équipe AMO, écrite par les RPC.
create table ppt_analyses (
  rapport_id uuid primary key references ppt_rapports (id) on delete cascade,
  json_verif jsonb not null,
  json_corrige jsonb not null,
  importe_par uuid references profiles (user_id) on delete set null,
  importe_le timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compteur de coût par dossier (brief § 7) - mode manuel en phase 1
create table ppt_traitements (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references ppt_rapports (id) on delete cascade,
  mode text not null check (mode in ('manuel_skill', 'api')),
  modele text,
  prompt_version text,
  schema_version text,
  tokens_entree int,
  tokens_cache_lecture int,
  tokens_cache_ecriture int,
  tokens_sortie int,
  cout_usd numeric,
  duree_ms int,
  statut text not null default 'termine' check (statut in ('en_cours', 'termine', 'echec')),
  erreur text,
  demarre_le timestamptz not null default now(),
  termine_le timestamptz
);
create index idx_ppt_traitements_rapport on ppt_traitements (rapport_id);

create table ppt_postes (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  rapport_id uuid references ppt_rapports (id) on delete set null,
  code_source text,
  libelle text not null,
  libelle_source text,
  ouvrage text,
  batiment text,
  priorite text not null check (priorite in ('preservation', 'energetique', 'amelioration')),
  critere text,
  annee_prevue int,
  annee_origine text check (annee_origine in ('source', 'deduite', 'a_confirmer')),
  cout_ht_base numeric,
  cout_origine text check (cout_origine in ('source', 'converti_depuis_ttc', 'estime_strateco')),
  tva_pct numeric,
  avec_moe boolean not null default false,
  gain_energetique_pct numeric,
  statut text not null default 'programme'
    check (statut in ('programme', 'presente', 'vote', 'rejete', 'reporte', 'realise', 'abandonne')),
  annee_prochaine_presentation int,
  montant_vote numeric,
  commentaire text,
  position int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ppt_postes_copro on ppt_postes (ppt_copro_id, actif, annee_prevue);
create index idx_ppt_postes_rapport on ppt_postes (rapport_id);

create table ppt_ag (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  date_ag date not null,
  type text not null default 'ordinaire' check (type in ('ordinaire', 'extraordinaire')),
  pv_rapport_id uuid references ppt_rapports (id) on delete set null,
  saisi_par uuid references profiles (user_id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_ppt_ag_copro on ppt_ag (ppt_copro_id, date_ag desc);

create table ppt_resolutions (
  id uuid primary key default gen_random_uuid(),
  ag_id uuid not null references ppt_ag (id) on delete cascade,
  poste_id uuid references ppt_postes (id) on delete set null,
  intitule text not null,
  article text check (article in ('24', '25', '25-1', '26')),
  montant_vote numeric,
  issue text not null check (issue in ('adopte', 'rejete', 'reporte', 'non_presente')),
  voix_pour int,
  voix_contre int,
  abstentions int,
  created_at timestamptz not null default now()
);
create index idx_ppt_resolutions_ag on ppt_resolutions (ag_id);
create index idx_ppt_resolutions_poste on ppt_resolutions (poste_id);

create table ppt_remarques (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  rapport_id uuid not null references ppt_rapports (id) on delete cascade,
  poste_id uuid references ppt_postes (id) on delete set null,
  code text not null,
  famille text not null check (famille in ('reglementaire', 'coherence', 'plateforme')),
  severite text not null check (severite in ('bloquant', 'majeur', 'mineur', 'info')),
  statut text not null check (statut in ('conforme', 'non_conforme', 'partiel', 'non_verifiable', 'sans_objet')),
  libelle text not null,
  constat text,
  attendu text,
  observe text,
  ecart text,
  action text,
  page int,
  visible_syndic boolean not null default true,
  traitee boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_ppt_remarques_rapport on ppt_remarques (rapport_id);
create index idx_ppt_remarques_copro on ppt_remarques (ppt_copro_id);

create table ppt_corrections (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references ppt_rapports (id) on delete cascade,
  poste_code text,
  chemin_json text not null,
  valeur_avant jsonb,
  valeur_apres jsonb,
  motif text,
  par uuid references profiles (user_id) on delete set null,
  le timestamptz not null default now()
);
create index idx_ppt_corrections_rapport on ppt_corrections (rapport_id);

create table ppt_journal (
  id uuid primary key default gen_random_uuid(),
  ppt_copro_id uuid not null references ppt_coproprietes (id) on delete cascade,
  rapport_id uuid references ppt_rapports (id) on delete set null,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  par uuid references profiles (user_id) on delete set null,
  le timestamptz not null default now()
);
create index idx_ppt_journal_copro on ppt_journal (ppt_copro_id, le desc);

-- updated_at
create trigger trg_ppt_copros_updated before update on ppt_coproprietes
  for each row execute function set_updated_at();
create trigger trg_ppt_rapports_updated before update on ppt_rapports
  for each row execute function set_updated_at();
create trigger trg_ppt_postes_updated before update on ppt_postes
  for each row execute function set_updated_at();
create trigger trg_ppt_analyses_updated before update on ppt_analyses
  for each row execute function set_updated_at();
create trigger trg_ppt_parametres_updated before update on ppt_parametres_org
  for each row execute function set_updated_at();

-- ========== 2. Helpers (security definer : pas de récursion RLS) ==========

create or replace function ppt_is_membre_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organisation_membres where organisation_id = p_org and user_id = auth.uid());
$$;
revoke execute on function ppt_is_membre_org(uuid) from anon, public;

create or replace function ppt_is_directeur_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organisation_membres
    where organisation_id = p_org and user_id = auth.uid() and org_role = 'directeur'
  );
$$;
revoke execute on function ppt_is_directeur_org(uuid) from anon, public;

create or replace function ppt_is_gestionnaire_of(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ppt_affectations a
    where a.ppt_copro_id = p_id and a.user_id = auth.uid() and a.au is null
  );
$$;
revoke execute on function ppt_is_gestionnaire_of(uuid) from anon, public;

/* Enseigne d'une copro PPT (pour les policies de stockage et de dépôt). */
create or replace function ppt_org_de(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organisation_id from ppt_coproprietes where id = p_id;
$$;
revoke execute on function ppt_org_de(uuid) from anon, public;

/* Peut ouvrir le dossier : AMO, direction de l'enseigne ou gestionnaire affecté. */
create or replace function ppt_ouvre(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_amo() or exists (
    select 1 from ppt_coproprietes c
    where c.id = p_id and c.deleted_at is null
      and (ppt_is_directeur_org(c.organisation_id) or ppt_is_gestionnaire_of(c.id))
  );
$$;
revoke execute on function ppt_ouvre(uuid) from anon, public;

/* Peut déposer un document sur la copro : AMO ou tout membre de l'enseigne. */
create or replace function ppt_depose(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_amo() or exists (
    select 1 from ppt_coproprietes c
    where c.id = p_id and c.deleted_at is null and ppt_is_membre_org(c.organisation_id)
  );
$$;
revoke execute on function ppt_depose(uuid) from anon, public;

create or replace function ppt_ag_ouvre(p_ag uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ppt_ag a where a.id = p_ag and ppt_ouvre(a.ppt_copro_id));
$$;
revoke execute on function ppt_ag_ouvre(uuid) from anon, public;

/* Journalisation depuis les triggers et les RPC. */
create or replace function ppt_journaliser(p_copro uuid, p_rapport uuid, p_type text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into ppt_journal (ppt_copro_id, rapport_id, type, detail, par)
  values (p_copro, p_rapport, p_type, coalesce(p_detail, '{}'::jsonb), auth.uid());
$$;
revoke execute on function ppt_journaliser(uuid, uuid, text, jsonb) from anon, authenticated, public;

-- ========== 3. Affectation du gestionnaire (historisée) ==========

create or replace function ppt_sync_affectation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(new.gestionnaire_email, '')));
  v_user uuid;
begin
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(old.gestionnaire_email, ''))) = v_email
     and old.organisation_id = new.organisation_id then
    -- seul le nom a changé : on le reporte sur l'affectation courante
    update ppt_affectations set nom = new.gestionnaire_nom where ppt_copro_id = new.id and au is null;
    return new;
  end if;
  -- clôture de l'affectation courante
  update ppt_affectations set au = now() where ppt_copro_id = new.id and au is null;
  if v_email = '' then
    if tg_op = 'UPDATE' then perform ppt_journaliser(new.id, null, 'changement_gestionnaire', jsonb_build_object('email', null)); end if;
    return new;
  end if;
  -- compte syndic de la même enseigne portant cet e-mail (sinon affectation nominative sans compte)
  select p.user_id into v_user
  from auth.users u
  join profiles p on p.user_id = u.id and p.role = 'syndic' and p.active
  join organisation_membres m on m.user_id = p.user_id and m.organisation_id = new.organisation_id
  where lower(u.email) = v_email
  limit 1;
  insert into ppt_affectations (ppt_copro_id, user_id, email, nom)
  values (new.id, v_user, v_email, new.gestionnaire_nom);
  perform ppt_journaliser(new.id, null, 'changement_gestionnaire',
    jsonb_build_object('email', v_email, 'nom', new.gestionnaire_nom, 'compte', v_user is not null));
  return new;
end;
$$;
revoke execute on function ppt_sync_affectation() from anon, authenticated, public;

create trigger trg_ppt_copros_affectation
  after insert or update of gestionnaire_email, gestionnaire_nom, organisation_id on ppt_coproprietes
  for each row execute function ppt_sync_affectation();

-- Membre ajouté à une enseigne : il récupère les affectations nominatives qui l'attendaient.
create or replace function ppt_rattraper_affectations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update ppt_affectations a
     set user_id = new.user_id
    from ppt_coproprietes c, auth.users u, profiles p
   where a.ppt_copro_id = c.id and a.au is null and a.user_id is null
     and c.organisation_id = new.organisation_id
     and u.id = new.user_id and p.user_id = new.user_id and p.role = 'syndic'
     and lower(u.email) = a.email;
  return new;
end;
$$;
revoke execute on function ppt_rattraper_affectations() from anon, authenticated, public;

create trigger trg_ppt_org_membres_affectations
  after insert on organisation_membres
  for each row execute function ppt_rattraper_affectations();

-- ========== 4. Protections d'écriture ==========

-- Le syndic modifie la fiche (fonds travaux, données) mais ni l'enseigne, ni la
-- corbeille, ni la passerelle.
create or replace function ppt_protege_copro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.role() is null or is_amo() then return new; end if;
  if new.organisation_id is distinct from old.organisation_id
     or new.deleted_at is distinct from old.deleted_at
     or new.copro_id is distinct from old.copro_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Ces champs de la copropriété sont réservés à l''équipe Strat Eco';
  end if;
  return new;
end;
$$;
revoke execute on function ppt_protege_copro() from anon, authenticated, public;
create trigger trg_ppt_copros_protege before update on ppt_coproprietes
  for each row execute function ppt_protege_copro();

-- Le statut d'un rapport et sa validation ne changent que par les RPC (dirigeant).
create or replace function ppt_protege_rapport()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or auth.role() is null or is_dirigeant() then return new; end if;
  if new.statut is distinct from old.statut
     or new.valide_par is distinct from old.valide_par
     or new.valide_le is distinct from old.valide_le
     or new.verdict is distinct from old.verdict
     or new.remplace_rapport_id is distinct from old.remplace_rapport_id then
    raise exception 'Le statut d''un rapport ne se modifie que par la revue du dirigeant';
  end if;
  return new;
end;
$$;
revoke execute on function ppt_protege_rapport() from anon, authenticated, public;
create trigger trg_ppt_rapports_protege before update on ppt_rapports
  for each row execute function ppt_protege_rapport();

-- Journal du dépôt
create or replace function ppt_journal_depot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ppt_journaliser(new.ppt_copro_id, new.id, 'depot', jsonb_build_object('type', new.type, 'name', new.name));
  return new;
end;
$$;
revoke execute on function ppt_journal_depot() from anon, authenticated, public;
create trigger trg_ppt_rapports_journal after insert on ppt_rapports
  for each row execute function ppt_journal_depot();

-- ========== 5. Vote en AG → statut du poste ==========
-- Un poste rejeté ou reporté reste vivant : il ressort l'année suivante
-- (annee_prochaine_presentation), jamais supprimé.
create or replace function ppt_appliquer_resolution()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_annee int;
  v_copro uuid;
begin
  if new.poste_id is null then return new; end if;
  select extract(year from a.date_ag)::int, a.ppt_copro_id into v_annee, v_copro from ppt_ag a where a.id = new.ag_id;
  if new.issue = 'adopte' then
    update ppt_postes set statut = 'vote', montant_vote = new.montant_vote, annee_prochaine_presentation = null
     where id = new.poste_id;
  elsif new.issue = 'rejete' then
    update ppt_postes set statut = 'rejete', annee_prochaine_presentation = coalesce(annee_prochaine_presentation, v_annee + 1)
     where id = new.poste_id and statut not in ('vote', 'realise');
  elsif new.issue = 'reporte' then
    update ppt_postes set statut = 'reporte', annee_prochaine_presentation = coalesce(annee_prochaine_presentation, v_annee + 1)
     where id = new.poste_id and statut not in ('vote', 'realise');
  else
    update ppt_postes set statut = 'presente' where id = new.poste_id and statut = 'programme';
  end if;
  perform ppt_journaliser(v_copro, null, 'resolution',
    jsonb_build_object('poste_id', new.poste_id, 'issue', new.issue, 'article', new.article, 'montant', new.montant_vote, 'annee', v_annee));
  return new;
end;
$$;
revoke execute on function ppt_appliquer_resolution() from anon, authenticated, public;
create trigger trg_ppt_resolutions_appliquer after insert or update of issue, montant_vote, poste_id on ppt_resolutions
  for each row execute function ppt_appliquer_resolution();

create or replace function ppt_journal_ag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ppt_journaliser(new.ppt_copro_id, null, 'ag_saisie', jsonb_build_object('date_ag', new.date_ag, 'type', new.type));
  return new;
end;
$$;
revoke execute on function ppt_journal_ag() from anon, authenticated, public;
create trigger trg_ppt_ag_journal after insert on ppt_ag
  for each row execute function ppt_journal_ag();

-- ========== 6. RPC de la chaîne de traitement (dirigeant) ==========

/* [6a] Import du JSON pppt-verif/1.0 (phase 1 : téléversé après analyse locale ;
   plus tard : écrit par l'edge function ppt-analyser en mode api). */
create or replace function ppt_importer_analyse(p_rapport_id uuid, p_json jsonb, p_mode text default 'manuel_skill')
returns void language plpgsql security definer set search_path = public as $$
declare
  r ppt_rapports%rowtype;
  v_version text := p_json ->> 'schema_version';
begin
  if not (is_dirigeant() or auth.role() = 'service_role') then
    raise exception 'Import réservé au dirigeant';
  end if;
  select * into r from ppt_rapports where id = p_rapport_id;
  if r.id is null then raise exception 'Rapport introuvable'; end if;
  if r.statut = 'valide' then raise exception 'Rapport déjà validé : déposez une nouvelle version'; end if;
  if v_version is null or v_version not like 'pppt-verif/1.%' then
    raise exception 'Schéma JSON non reconnu (% attendu pppt-verif/1.x)', coalesce(v_version, 'absent');
  end if;

  insert into ppt_analyses (rapport_id, json_verif, json_corrige, importe_par)
  values (p_rapport_id, p_json, p_json, auth.uid())
  on conflict (rapport_id) do update
    set json_verif = excluded.json_verif, json_corrige = excluded.json_corrige,
        importe_par = excluded.importe_par, importe_le = now();

  update ppt_rapports set
    statut = 'a_relire',
    schema_version = v_version,
    nature_detectee = p_json -> 'document_source' ->> 'nature_detectee',
    date_document = nullif(p_json -> 'document_source' ->> 'date_document', '')::date,
    prestataire = p_json -> 'document_source' -> 'auteur' ->> 'raison_sociale',
    prestataire_type = p_json -> 'document_source' -> 'auteur' ->> 'type',
    verdict = p_json -> 'synthese' ->> 'verdict',
    score_conformite_pct = nullif(p_json -> 'synthese' ->> 'score_conformite_pct', '')::numeric,
    score_coherence_pct = nullif(p_json -> 'synthese' ->> 'score_coherence_pct', '')::numeric
  where id = p_rapport_id;

  insert into ppt_traitements (rapport_id, mode, schema_version, statut, termine_le)
  values (p_rapport_id, p_mode, v_version, 'termine', now());

  perform ppt_journaliser(r.ppt_copro_id, p_rapport_id, 'analyse_importee',
    jsonb_build_object('verdict', p_json -> 'synthese' ->> 'verdict', 'mode', p_mode));
end;
$$;
revoke execute on function ppt_importer_analyse(uuid, jsonb, text) from anon, public;

/* [5] Enregistrement de la revue : JSON de travail + journal des corrections
   (tableau d'objets {chemin_json, poste_code, valeur_avant, valeur_apres, motif}). */
create or replace function ppt_enregistrer_revue(p_rapport_id uuid, p_json_corrige jsonb, p_corrections jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
begin
  if not is_dirigeant() then raise exception 'Revue réservée au dirigeant'; end if;
  update ppt_analyses set json_corrige = p_json_corrige where rapport_id = p_rapport_id;
  if not found then raise exception 'Aucune analyse importée pour ce rapport'; end if;
  for c in select * from jsonb_array_elements(coalesce(p_corrections, '[]'::jsonb)) loop
    insert into ppt_corrections (rapport_id, poste_code, chemin_json, valeur_avant, valeur_apres, motif, par)
    values (p_rapport_id, c ->> 'poste_code', coalesce(c ->> 'chemin_json', '?'), c -> 'valeur_avant', c -> 'valeur_apres', c ->> 'motif', auth.uid());
  end loop;
end;
$$;
revoke execute on function ppt_enregistrer_revue(uuid, jsonb, jsonb) from anon, public;

/* Libellé de priorité du skill → code plateforme. */
create or replace function ppt_code_priorite(p text)
returns text language sql immutable as $$
  select case
    when p is null then 'preservation'
    when lower(p) like 'pr%' then 'preservation'
    when lower(p) like '%nerg%' then 'energetique'
    when lower(p) like 'am%' then 'amelioration'
    else 'preservation' end;
$$;

create or replace function ppt_code_severite(p text)
returns text language sql immutable as $$
  select case upper(coalesce(p, ''))
    when 'BLOQUANT' then 'bloquant' when 'MAJEUR' then 'majeur' when 'MINEUR' then 'mineur' else 'info' end;
$$;

create or replace function ppt_code_statut_controle(p text)
returns text language sql immutable as $$
  select case upper(coalesce(p, ''))
    when 'CONFORME' then 'conforme' when 'NON_CONFORME' then 'non_conforme' when 'PARTIEL' then 'partiel'
    when 'SANS_OBJET' then 'sans_objet' else 'non_verifiable' end;
$$;

/* [6b] Validation : matérialise le JSON corrigé en postes et remarques, met à
   jour la fiche (champs vides seulement), archive les postes de la version
   précédente (actif=false, jamais supprimés), notifie par le journal.
   p_levees : codes des contrôles bloquants levés par le dirigeant (motif exigé). */
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
  v_codes_leves text[] := array(select jsonb_array_elements_text(coalesce(p_levees, '[]'::jsonb)));
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
      (ctl ->> 'code') = any (v_codes_leves)
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
    jsonb_build_object('postes', v_pos, 'annee_base', v_annee_base, 'remplace', v_prev, 'leves', to_jsonb(v_codes_leves)));
end;
$$;
revoke execute on function ppt_valider_rapport(uuid, jsonb) from anon, public;

create or replace function ppt_rejeter_rapport(p_rapport_id uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
declare v_copro uuid;
begin
  if not is_dirigeant() then raise exception 'Rejet réservé au dirigeant'; end if;
  update ppt_rapports set statut = 'rejete', motif_rejet = p_motif where id = p_rapport_id and statut <> 'valide'
    returning ppt_copro_id into v_copro;
  if v_copro is null then raise exception 'Rapport introuvable ou déjà validé'; end if;
  perform ppt_journaliser(v_copro, p_rapport_id, 'rejet', jsonb_build_object('motif', p_motif));
end;
$$;
revoke execute on function ppt_rejeter_rapport(uuid, text) from anon, public;

/* Membres de l'enseigne pour la vue direction (comparatif « équipés / non
   équipés ») : la RLS d'organisation_membres ne laisse lire que sa propre
   ligne, d'où cette RPC réservée à la direction de l'enseigne et à l'AMO. */
create or replace function ppt_membres_enseigne(p_org uuid)
returns table (user_id uuid, nom text, org_role org_role, email text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, m.org_role, u.email::text
  from organisation_membres m
  join profiles p on p.user_id = m.user_id and p.active
  join auth.users u on u.id = m.user_id
  where m.organisation_id = p_org
    and (is_amo() or ppt_is_directeur_org(p_org))
  order by m.org_role, p.full_name;
$$;
revoke execute on function ppt_membres_enseigne(uuid) from anon, public;

/* Mise à la corbeille d'une copro PPT (AMO) - jamais de suppression physique. */
create or replace function ppt_corbeille_copro(p_id uuid, p_restaurer boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_amo() then raise exception 'Réservé à l''équipe Strat Eco'; end if;
  update ppt_coproprietes set deleted_at = case when p_restaurer then null else now() end where id = p_id;
  perform ppt_journaliser(p_id, null, case when p_restaurer then 'restauration' else 'corbeille' end);
end;
$$;
revoke execute on function ppt_corbeille_copro(uuid, boolean) from anon, public;

-- ========== 7. RLS ==========
alter table ppt_parametres_org enable row level security;
alter table ppt_coproprietes enable row level security;
alter table ppt_affectations enable row level security;
alter table ppt_rapports enable row level security;
alter table ppt_analyses enable row level security;
alter table ppt_traitements enable row level security;
alter table ppt_postes enable row level security;
alter table ppt_ag enable row level security;
alter table ppt_resolutions enable row level security;
alter table ppt_remarques enable row level security;
alter table ppt_corrections enable row level security;
alter table ppt_journal enable row level security;

-- paramètres : lecture par l'enseigne, écriture AMO
create policy ppt_param_read on ppt_parametres_org for select to authenticated
  using (is_amo() or ppt_is_membre_org(organisation_id));
create policy ppt_param_amo_write on ppt_parametres_org for all to authenticated
  using (is_amo()) with check (is_amo());

-- copros : portefeuille commun à l'enseigne (0062), ouverture selon ppt_ouvre
create policy ppt_copros_read on ppt_coproprietes for select to authenticated
  using (is_amo() or (deleted_at is null and ppt_is_membre_org(organisation_id)));
create policy ppt_copros_insert on ppt_coproprietes for insert to authenticated
  with check ((is_amo() or ppt_is_membre_org(organisation_id)) and created_by = auth.uid());
create policy ppt_copros_update on ppt_coproprietes for update to authenticated
  using (is_amo() or ppt_ouvre(id)) with check (is_amo() or ppt_ouvre(id));

create policy ppt_affectations_read on ppt_affectations for select to authenticated
  using (is_amo() or ppt_ouvre(ppt_copro_id));

create policy ppt_rapports_read on ppt_rapports for select to authenticated
  using (is_amo() or ppt_ouvre(ppt_copro_id));
create policy ppt_rapports_insert on ppt_rapports for insert to authenticated
  with check (ppt_depose(ppt_copro_id) and depose_par = auth.uid() and statut = 'depose');
create policy ppt_rapports_amo_update on ppt_rapports for update to authenticated
  using (is_amo()) with check (is_amo());

create policy ppt_analyses_amo_read on ppt_analyses for select to authenticated using (is_amo());

create policy ppt_traitements_amo_read on ppt_traitements for select to authenticated using (is_amo());
create policy ppt_traitements_amo_insert on ppt_traitements for insert to authenticated with check (is_amo());

create policy ppt_postes_read on ppt_postes for select to authenticated
  using (is_amo() or ppt_ouvre(ppt_copro_id));
create policy ppt_postes_dirigeant_write on ppt_postes for all to authenticated
  using (is_dirigeant()) with check (is_dirigeant());

create policy ppt_ag_read on ppt_ag for select to authenticated using (ppt_ouvre(ppt_copro_id));
create policy ppt_ag_insert on ppt_ag for insert to authenticated
  with check (ppt_ouvre(ppt_copro_id) and saisi_par = auth.uid());
create policy ppt_ag_update on ppt_ag for update to authenticated
  using (ppt_ouvre(ppt_copro_id)) with check (ppt_ouvre(ppt_copro_id));
create policy ppt_ag_delete on ppt_ag for delete to authenticated using (ppt_ouvre(ppt_copro_id));

create policy ppt_resolutions_all on ppt_resolutions for all to authenticated
  using (ppt_ag_ouvre(ag_id)) with check (ppt_ag_ouvre(ag_id));

create policy ppt_remarques_read on ppt_remarques for select to authenticated
  using (is_amo() or (visible_syndic and ppt_ouvre(ppt_copro_id)));
create policy ppt_remarques_dirigeant_write on ppt_remarques for all to authenticated
  using (is_dirigeant()) with check (is_dirigeant());

create policy ppt_corrections_amo_read on ppt_corrections for select to authenticated using (is_amo());

create policy ppt_journal_read on ppt_journal for select to authenticated
  using (is_amo() or ppt_ouvre(ppt_copro_id));

-- ========== 8. Stockage ==========
insert into storage.buckets (id, name, public)
values ('ppt-files', 'ppt-files', false)
on conflict (id) do nothing;

-- chemin : <organisation_id>/<ppt_copro_id>/<timestamp>-<nom>
create policy storage_ppt_amo_all on storage.objects for all to authenticated
  using (bucket_id = 'ppt-files' and is_amo())
  with check (bucket_id = 'ppt-files' and is_amo());

create policy storage_ppt_membre_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ppt-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_is_membre_org(((storage.foldername(name))[1])::uuid)
    and ppt_org_de(((storage.foldername(name))[2])::uuid) = ((storage.foldername(name))[1])::uuid
  );

create policy storage_ppt_ouvre_read on storage.objects for select to authenticated
  using (
    bucket_id = 'ppt-files'
    and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    and ppt_ouvre(((storage.foldername(name))[2])::uuid)
  );

-- ========== 9. Vue de synthèse par copro (security invoker : filtrée par la RLS) ==========
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
     and m.rapport_id in (select id from ppt_rapports r where r.ppt_copro_id = c.id and r.statut = 'valide'))::int as remarques_ouvertes
from ppt_coproprietes c;
