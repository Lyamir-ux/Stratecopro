-- Éco-PTZ individuel : CERFA Annexe 3.1 et attestation des montants éligibles,
-- signés électroniquement dans Strat Eco Pro (demande d'Amir, 02/10/2026).
--
-- 1. ecoptz_dossiers : données du CERFA propres à la copropriété, demandées au
--    dépôt (ou redépôt) de l'audit réglementaire et des devis / CCTP / DPGF,
--    par l'AMO, le syndic ou le maître d'œuvre. L'auditeur et les entreprises
--    rejoignent la base prestataires (ecoptz_entreprise_upsert). Les montants,
--    eux, viennent du PF définitif validé (lignes « Retenu » + TVA) : ils ne
--    sont pas stockés ici.
-- 2. Signature électronique de documents par des signataires sans compte
--    (entreprises, auditeur, syndic) : un envoi = des documents + des
--    participants ; un lien personnel par participant et par envoi, avec lequel
--    il signe en une fois tous les documents où il figure (choix d'Amir).
--    Signature électronique simple : documents lus, attestation sur l'honneur,
--    code à usage unique reçu par e-mail, journal chaîné (audit_log, chaîne par
--    envoi), PDF scellé par l'edge function signature-documents. Aucune
--    écriture côté client sur ces tables : service role uniquement.

-- ========== 1. Données du dossier ==========

create table if not exists ecoptz_dossiers (
  copro_id uuid primary key references coproprietes (id) on delete cascade,
  -- référence, date, scénario, coût, classes et consommations, gain, auditeur
  audit jsonb not null default '{}'::jsonb,
  audit_statut text not null default 'a_completer'
    check (audit_statut in ('a_completer', 'a_verifier', 'valide')),
  audit_saisi_par uuid references auth.users (id) on delete set null,
  audit_saisi_le timestamptz,
  audit_valide_par uuid references auth.users (id) on delete set null,
  audit_valide_le timestamptz,
  -- entreprise de chaque lot de travaux du PF : { "<numéro de lot>": {...} }
  postes jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ecoptz_dossiers_updated on ecoptz_dossiers;
create trigger trg_ecoptz_dossiers_updated before update on ecoptz_dossiers
  for each row execute function set_updated_at();

alter table ecoptz_dossiers enable row level security;

drop policy if exists ecoptz_dossiers_amo_all on ecoptz_dossiers;
create policy ecoptz_dossiers_amo_all on ecoptz_dossiers
  for all to authenticated
  using (( select is_amo() )) with check (( select is_amo() ));

drop policy if exists ecoptz_dossiers_partenaires_read on ecoptz_dossiers;
create policy ecoptz_dossiers_partenaires_read on ecoptz_dossiers
  for select to authenticated
  using (
    copro_id = any (( select copros_syndic() )::uuid[])
    or copro_id = any (( select copros_moe_cite() )::uuid[])
    or copro_id = any (( select copros_moe_retenu() )::uuid[])
  );

comment on table ecoptz_dossiers is
  'Données du CERFA éco-PTZ (audit, entreprise de chaque lot du PF) - saisies au dépôt par l''AMO, le syndic ou le MOE via ecoptz_saisir_audit / ecoptz_saisir_postes, validées par l''AMO.';

-- Rôle de l'appelant sur le dossier (null = aucun droit).
create or replace function ecoptz_role_appelant(p_copro_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when is_amo() then 'amo'
    when is_syndic_of(p_copro_id) then 'syndic'
    when p_copro_id = any (copros_moe_cite()) or p_copro_id = any (copros_moe_retenu()) then 'moe'
    else null
  end;
$$;
revoke all on function ecoptz_role_appelant(uuid) from public, anon;
grant execute on function ecoptz_role_appelant(uuid) to authenticated;

-- Fiche de la base prestataires : rapprochée par SIRET, puis par e-mail, puis
-- par raison sociale ; créée sinon. Une fiche existante n'est que complétée
-- (jamais écrasée). Le contact signataire rejoint ses contacts.
create or replace function ecoptz_entreprise_upsert(p jsonb, p_metier type_consultation)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_nom text := btrim(coalesce(p ->> 'raison_sociale', ''));
  v_siret_brut text := btrim(coalesce(p ->> 'siret', ''));
  v_siret text := regexp_replace(coalesce(p ->> 'siret', ''), '\D', '', 'g');
  v_contact text := btrim(coalesce(p ->> 'contact_nom', ''));
  v_email text := lower(btrim(coalesce(p ->> 'contact_email', '')));
  v_tel text := btrim(coalesce(p ->> 'contact_telephone', ''));
begin
  if v_nom = '' then
    return null;
  end if;
  if length(v_siret) = 14 then
    select id into v_id from prestataires
      where regexp_replace(coalesce(siret, ''), '\D', '', 'g') = v_siret limit 1;
  end if;
  if v_id is null and v_email <> '' then
    select id into v_id from prestataires where lower(email) = v_email limit 1;
  end if;
  if v_id is null then
    select id into v_id from prestataires where lower(btrim(raison_sociale)) = lower(v_nom) limit 1;
  end if;

  if v_id is null then
    insert into prestataires (raison_sociale, siret, email, contact_nom, telephone, types, actif, notes)
    values (
      v_nom,
      nullif(v_siret_brut, ''),
      case when v_email <> '' and not exists (select 1 from prestataires where lower(email) = v_email) then v_email end,
      nullif(v_contact, ''),
      nullif(v_tel, ''),
      array[p_metier],
      true,
      'Fiche créée depuis le dossier éco-PTZ individuel.'
    )
    returning id into v_id;
  else
    update prestataires set
      siret = coalesce(nullif(btrim(siret), ''), nullif(v_siret_brut, '')),
      contact_nom = coalesce(nullif(btrim(contact_nom), ''), nullif(v_contact, '')),
      telephone = coalesce(nullif(btrim(telephone), ''), nullif(v_tel, '')),
      types = case when p_metier = any (types) then types else types || p_metier end
    where id = v_id;
  end if;

  if v_contact <> '' or v_email <> '' then
    if not exists (
      select 1 from prestataire_contacts c
      where c.prestataire_id = v_id
        and ((v_email <> '' and lower(c.email) = v_email) or (v_email = '' and lower(c.nom) = lower(v_contact)))
    ) then
      insert into prestataire_contacts (prestataire_id, nom, role, email, telephone)
      values (v_id, coalesce(nullif(v_contact, ''), v_email), 'Signataire éco-PTZ', nullif(v_email, ''), nullif(v_tel, ''));
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function ecoptz_entreprise_upsert(jsonb, type_consultation) from public, anon, authenticated;

-- Données de l'audit (questionnaire au dépôt ou depuis le dossier AMO).
-- Toute saisie repasse l'audit « à vérifier » ; seule l'AMO valide.
create or replace function ecoptz_saisir_audit(p_copro_id uuid, p_audit jsonb, p_valider boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := ecoptz_role_appelant(p_copro_id);
  v_presta uuid;
  v_audit jsonb;
begin
  if v_role is null then
    raise exception 'Accès refusé au dossier' using errcode = '42501';
  end if;
  if p_valider and v_role <> 'amo' then
    raise exception 'Validation réservée à Strat Eco' using errcode = '42501';
  end if;
  if jsonb_typeof(p_audit) <> 'object' then
    raise exception 'Données d''audit invalides';
  end if;
  v_presta := ecoptz_entreprise_upsert(p_audit, 'be');
  v_audit := (p_audit - 'prestataire_id' - 'saisi_par_role' - 'saisi_le')
    || jsonb_build_object('prestataire_id', v_presta, 'saisi_par_role', v_role, 'saisi_le', now());
  insert into ecoptz_dossiers as d (copro_id, audit, audit_statut, audit_saisi_par, audit_saisi_le,
                                    audit_valide_par, audit_valide_le, updated_by)
  values (p_copro_id, v_audit, case when p_valider then 'valide' else 'a_verifier' end, auth.uid(), now(),
          case when p_valider then auth.uid() end, case when p_valider then now() end, auth.uid())
  on conflict (copro_id) do update set
    audit = excluded.audit,
    audit_statut = excluded.audit_statut,
    audit_saisi_par = excluded.audit_saisi_par,
    audit_saisi_le = excluded.audit_saisi_le,
    audit_valide_par = excluded.audit_valide_par,
    audit_valide_le = excluded.audit_valide_le,
    updated_by = excluded.updated_by;
  return v_audit;
end;
$$;
revoke all on function ecoptz_saisir_audit(uuid, jsonb, boolean) from public, anon;
grant execute on function ecoptz_saisir_audit(uuid, jsonb, boolean) to authenticated;

-- Entreprise de chaque lot de travaux (questionnaire au dépôt d'un devis ou
-- d'un CCTP / DPGF, ou depuis le dossier AMO). p_postes : tableau de
-- { lot_numero, titre, designation, raison_sociale, siret, contact_nom,
--   contact_email, contact_telephone, supprimer }.
create or replace function ecoptz_saisir_postes(p_copro_id uuid, p_postes jsonb, p_valider boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := ecoptz_role_appelant(p_copro_id);
  v_postes jsonb;
  v_p jsonb;
  v_cle text;
  v_presta uuid;
begin
  if v_role is null then
    raise exception 'Accès refusé au dossier' using errcode = '42501';
  end if;
  if p_valider and v_role <> 'amo' then
    raise exception 'Validation réservée à Strat Eco' using errcode = '42501';
  end if;
  if jsonb_typeof(p_postes) <> 'array' then
    raise exception 'Postes invalides';
  end if;
  insert into ecoptz_dossiers (copro_id, updated_by) values (p_copro_id, auth.uid())
    on conflict (copro_id) do nothing;
  select postes into v_postes from ecoptz_dossiers where copro_id = p_copro_id for update;

  for v_p in select * from jsonb_array_elements(p_postes) loop
    v_cle := btrim(coalesce(v_p ->> 'lot_numero', ''));
    continue when v_cle !~ '^\d+$';
    if coalesce((v_p ->> 'supprimer')::boolean, false) then
      v_postes := v_postes - v_cle;
      continue;
    end if;
    continue when btrim(coalesce(v_p ->> 'raison_sociale', '')) = '';
    v_presta := ecoptz_entreprise_upsert(v_p, 'travaux');
    v_postes := jsonb_set(
      v_postes, array[v_cle],
      (v_p - 'supprimer' - 'prestataire_id' - 'statut' - 'saisi_par_role' - 'saisi_le')
        || jsonb_build_object(
          'prestataire_id', v_presta,
          'statut', case when p_valider then 'valide' else 'a_verifier' end,
          'saisi_par_role', v_role,
          'saisi_le', now()
        ),
      true
    );
  end loop;

  update ecoptz_dossiers set postes = v_postes, updated_by = auth.uid() where copro_id = p_copro_id;
  return v_postes;
end;
$$;
revoke all on function ecoptz_saisir_postes(uuid, jsonb, boolean) from public, anon;
grant execute on function ecoptz_saisir_postes(uuid, jsonb, boolean) to authenticated;

-- ========== 2. Signature électronique de documents ==========

create table if not exists signature_envois (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  objet text not null default 'ecoptz_individuel' check (objet in ('ecoptz_individuel')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'en_cours', 'complet', 'annule')),
  cree_par uuid references auth.users (id) on delete set null,
  cree_par_nom text,
  envoye_le timestamptz,
  complet_le timestamptz,
  annule_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_signature_envois_copro on signature_envois (copro_id, created_at desc);

create table if not exists signature_participants (
  id uuid primary key default gen_random_uuid(),
  envoi_id uuid not null references signature_envois (id) on delete cascade,
  copro_id uuid not null references coproprietes (id) on delete cascade,
  role text not null check (role in ('entreprise', 'auditeur', 'syndic')),
  prestataire_id uuid references prestataires (id) on delete set null,
  societe text not null default '',
  siret text not null default '',
  nom text not null default '',
  email text not null default '',
  ordre int not null default 0,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'signe', 'annule')),
  -- lien personnel : seul le SHA-256 du token est stocké
  token_hash text,
  token_expire_le timestamptz,
  lien_envoye_le timestamptz,
  nb_envois int not null default 0,
  -- code à usage unique (PBKDF2, jamais en clair)
  otp_hash text,
  otp_expire_le timestamptz,
  otp_tentatives smallint not null default 0,
  otp_envois timestamptz[] not null default '{}',
  -- preuve
  attestation_le timestamptz,
  fait_a text,
  signe_le timestamptz,
  signe_ip inet,
  signe_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_signature_participants_envoi on signature_participants (envoi_id);
create index if not exists idx_signature_participants_token on signature_participants (token_hash);

create table if not exists signature_documents (
  id uuid primary key default gen_random_uuid(),
  envoi_id uuid not null references signature_envois (id) on delete cascade,
  copro_id uuid not null references coproprietes (id) on delete cascade,
  type text not null check (type in ('cerfa_ecoptz', 'attestation_ecoptz')),
  coproprietaire_id uuid references coproprietaires (id) on delete set null,
  lot_id uuid references lots (id) on delete set null,
  libelle text not null,
  -- instantané des montants et données utilisés pour le document
  donnees jsonb not null default '{}'::jsonb,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'en_attente', 'signe', 'annule')),
  document_path text,
  document_hash text,
  document_signe_path text,
  document_signe_hash text,
  sceau_signature text,
  scelle_le timestamptz,
  fichier_id uuid references fichiers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_signature_documents_envoi on signature_documents (envoi_id);
create index if not exists idx_signature_documents_copro on signature_documents (copro_id, coproprietaire_id);

-- Qui signe quel document, et où (cases relevées à la génération du PDF).
create table if not exists signature_document_signataires (
  document_id uuid not null references signature_documents (id) on delete cascade,
  participant_id uuid not null references signature_participants (id) on delete cascade,
  emplacements jsonb not null default '[]'::jsonb,
  lu_le timestamptz,
  signe_le timestamptz,
  -- empreinte du document recalculée depuis le stockage au moment de la signature
  document_hash text,
  primary key (document_id, participant_id)
);
create index if not exists idx_signature_doc_sig_participant on signature_document_signataires (participant_id);

drop trigger if exists trg_signature_envois_updated on signature_envois;
create trigger trg_signature_envois_updated before update on signature_envois
  for each row execute function set_updated_at();
drop trigger if exists trg_signature_participants_updated on signature_participants;
create trigger trg_signature_participants_updated before update on signature_participants
  for each row execute function set_updated_at();
drop trigger if exists trg_signature_documents_updated on signature_documents;
create trigger trg_signature_documents_updated before update on signature_documents
  for each row execute function set_updated_at();

alter table signature_envois enable row level security;
alter table signature_participants enable row level security;
alter table signature_documents enable row level security;
alter table signature_document_signataires enable row level security;

drop policy if exists signature_envois_read on signature_envois;
create policy signature_envois_read on signature_envois
  for select to authenticated
  using (( select is_amo() ) or copro_id = any (( select copros_syndic() )::uuid[]));

drop policy if exists signature_participants_read on signature_participants;
create policy signature_participants_read on signature_participants
  for select to authenticated
  using (( select is_amo() ) or copro_id = any (( select copros_syndic() )::uuid[]));

-- Le copropriétaire voit ses propres documents (statut et téléchargement de la
-- version signée par l'edge function), jamais ceux des autres.
drop policy if exists signature_documents_read on signature_documents;
create policy signature_documents_read on signature_documents
  for select to authenticated
  using (
    ( select is_amo() )
    or copro_id = any (( select copros_syndic() )::uuid[])
    or (statut <> 'brouillon' and coproprietaire_id in ( select my_coproprietaire_ids() ))
  );

drop policy if exists signature_doc_sig_read on signature_document_signataires;
create policy signature_doc_sig_read on signature_document_signataires
  for select to authenticated
  using (
    ( select is_amo() )
    or exists (
      select 1 from signature_documents d
      where d.id = document_id and d.copro_id = any (( select copros_syndic() )::uuid[])
    )
  );

-- Aucune écriture côté client ; colonnes de preuve et de lien illisibles.
revoke all on signature_envois, signature_participants, signature_documents, signature_document_signataires
  from anon, authenticated;
grant select on signature_envois, signature_documents, signature_document_signataires to authenticated;
grant select (
  id, envoi_id, copro_id, role, prestataire_id, societe, siret, nom, email, ordre, statut,
  token_expire_le, lien_envoye_le, nb_envois, attestation_le, fait_a, signe_le, created_at, updated_at
) on signature_participants to authenticated;

comment on table signature_envois is
  'Envoi en signature électronique (éco-PTZ individuel : CERFA + attestations) - écritures par l''edge function signature-documents uniquement.';
comment on table signature_participants is
  'Signataires d''un envoi (entreprises, auditeur, syndic), un lien personnel chacun - token et code jamais en clair.';
