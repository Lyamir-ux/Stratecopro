-- 0050 - Signature électronique avancée (AES, eIDAS art. 26) des bulletins
-- d'adhésion à l'éco-PTZ, selon SPEC_signature_bulletins_adhesion.md et les
-- CGU v1.6 (convention de preuve art. 5.2, purge art. 7.4, niveaux art. 7.5.1).
-- Un bulletin = un lot ; le principal (compte portail) déclare les
-- cosignataires, qui signent sans compte via un lien tokenisé + OTP.
-- Toutes les écritures sensibles (tokens, OTP, signatures, audit) passent par
-- les edge functions en service role - jamais par le client.

-- ========== Enums ==========
create type bulletin_statut as enum (
  'brouillon',          -- principal en cours de saisie
  'en_signature',       -- liens envoyés, signatures en cours
  'complet',            -- tous ont signé, document scellé
  'expire',             -- délai dépassé
  'annule'
);

create type signataire_role as enum ('principal', 'cosignataire');

create type signataire_statut as enum (
  'en_attente',         -- lien envoyé, rien fait
  'identite_deposee',   -- pièce déposée, pas encore signé
  'signe',
  'expire'
);

-- ========== bulletins ==========
create table bulletins (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  -- fiche copropriétaire du signataire principal (rattachement portail)
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  -- dossier d'adhésion (formulaire CEGEE) dont est issu le PDF du bulletin
  adhesion_id uuid references adhesions_pret (id) on delete set null,
  lot_id uuid references lots (id) on delete set null,
  lot_reference text not null,                -- ex. "Lot 12 - Bât A"
  tantiemes integer,
  statut bulletin_statut not null default 'brouillon',
  cgu_version text not null,                  -- version acceptée, ex. "1.6"
  document_path text,                         -- PDF non signé (bucket signature-docs)
  document_hash text,                         -- SHA-256 du PDF non signé
  document_signe_path text,                   -- PDF final scellé
  document_signe_hash text,
  sceau_signature text,                       -- signature Ed25519 du hash final (si clé configurée)
  certificat_path text,                       -- certificat de preuve (bucket signature-certificats)
  rib_path text,                              -- déposé par le principal (bucket signature-pieces)
  rib_hash text,
  iban_chiffre bytea,                         -- AES-256-GCM, jamais en clair
  iban_dernier4 text,                         -- seuls caractères affichables
  notification_anah_le timestamptz,           -- déclencheur de purge (saisi par l'AMO)
  transmission_banque_le timestamptz,         -- déclencheur de purge (saisi par l'AMO)
  eco_ptz_demande boolean not null default true, -- false : la seule notification Anah déclenche la purge
  purge_effectuee_le timestamptz,
  alerte_j25_le timestamptz,                  -- alerte expiration proche déjà envoyée
  cree_par uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  scelle_le timestamptz
);
create index idx_bulletins_copro on bulletins (copro_id);
create index idx_bulletins_coproprietaire on bulletins (coproprietaire_id);
create index idx_bulletins_statut on bulletins (statut);

-- ========== signataires ==========
create table signataires (
  id uuid primary key default gen_random_uuid(),
  bulletin_id uuid not null references bulletins (id) on delete cascade,
  role signataire_role not null,
  ordre smallint not null,                    -- 1 = principal

  -- déclaré par le principal
  civilite text,
  nom text not null,
  prenom text not null,
  email text not null,
  telephone text not null,                    -- format E.164 : +33612345678
  adresse_ligne1 text,
  adresse_ligne2 text,
  code_postal text,
  ville text,
  pays text default 'FR',
  date_naissance date,
  lieu_naissance text,

  -- accès sans compte ; renseigné à l'envoi des liens (edge function), le
  -- token en clair n'est jamais stocké - une relance régénère le token
  token_hash text unique,
  token_expire_le timestamptz,
  token_consomme_le timestamptz,

  -- pièce d'identité (déposée par le signataire lui-même)
  piece_identite_path text,
  piece_identite_hash text,
  piece_identite_type text check (piece_identite_type in ('cni', 'passeport', 'titre_sejour')),
  piece_deposee_le timestamptz,
  piece_deposee_ip inet,

  -- consentement et signature
  cgu_acceptees_le timestamptz,
  attestation_piece_le timestamptz,           -- case "cette pièce est la mienne"
  attestation_honneur_le timestamptz,         -- principal : coordonnées certifiées exactes
  document_lu_le timestamptz,                 -- défilement complet du bulletin
  signe_le timestamptz,
  signe_ip inet,
  signe_user_agent text,
  document_hash_signature text,               -- hash du doc à l'instant de sa signature

  relance1_le timestamptz,
  relance2_le timestamptz,

  statut signataire_statut not null default 'en_attente',
  created_at timestamptz not null default now()
);
create index idx_signataires_bulletin on signataires (bulletin_id);
-- Garde-fou anti auto-signature : jamais deux signataires d'un même bulletin
-- avec le même e-mail ou le même téléphone. Erreur métier explicite côté UI.
create unique index uq_email_par_bulletin on signataires (bulletin_id, lower(email));
create unique index uq_tel_par_bulletin on signataires (bulletin_id, telephone);

-- ========== otp_codes ==========
create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  signataire_id uuid not null references signataires (id) on delete cascade,
  code_hash text not null,                    -- dérivation PBKDF2, jamais le code en clair
  expire_le timestamptz not null,             -- +10 min
  tentatives smallint not null default 0,     -- max 3
  valide_le timestamptz,
  created_at timestamptz not null default now()
);
create index idx_otp_signataire on otp_codes (signataire_id, created_at desc);

-- ========== audit_log (append-only, chaîné) ==========
create table audit_log (
  id bigserial primary key,
  bulletin_id uuid not null,
  signataire_id uuid,
  evenement text not null,
  payload jsonb,                              -- jamais de donnée sensible en clair
  ip inet,
  user_agent text,
  horodatage timestamptz not null default now(),
  hash_precedent text,                        -- chaînage par bulletin
  hash_courant text not null default ''       -- calculé par trigger
);
create index idx_audit_bulletin on audit_log (bulletin_id, id desc);

-- Chaînage : hash_courant = SHA256(hash_precedent || bulletin_id || evenement
-- || payload || horodatage). Toute modification rétroactive casse la chaîne.
create or replace function audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prev text;
begin
  -- sérialise les insertions concurrentes d'un même bulletin
  perform pg_advisory_xact_lock(hashtext(new.bulletin_id::text));
  select hash_courant into prev
    from audit_log
    where bulletin_id = new.bulletin_id
    order by id desc
    limit 1;
  new.hash_precedent := prev;
  new.horodatage := coalesce(new.horodatage, now());
  new.hash_courant := encode(
    extensions.digest(
      coalesce(prev, '') || new.bulletin_id::text || new.evenement
        || coalesce(new.payload::text, '') || new.horodatage::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create trigger trg_audit_chain before insert on audit_log
  for each row execute function audit_log_chain();

-- Append-only verrouillé par les droits Postgres, pas seulement par le code :
-- même le service role ne peut ni modifier ni supprimer une entrée.
revoke all on audit_log from anon, authenticated;
revoke update, delete, truncate on audit_log from anon, authenticated, service_role;
grant select on audit_log to authenticated;   -- filtré par RLS (AMO uniquement)

-- ========== Niveaux d'accès aux pièces (CGU art. 7.5.1) ==========
-- 1 = service administratif (lecture des pièces, chaque consultation
-- journalisée) ; 2 = chef de projet (aucune lecture du contenu, transmission
-- et métadonnées uniquement). Défaut 2 : le plus restrictif.
alter table profiles
  add column niveau_pieces smallint not null default 2 check (niveau_pieces in (1, 2));

create or replace function is_amo_niveau1()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'amo' and active and niveau_pieces = 1
  );
$$;
revoke execute on function is_amo_niveau1() from anon, public;

-- Empreinte des pièces justificatives existantes, calculée au dépôt (la purge
-- ne conserve que le hash : impossible de le recalculer après suppression).
alter table pieces_justificatives add column sha256 text;

-- ========== RLS ==========
alter table bulletins enable row level security;
create policy bulletins_amo_all on bulletins
  for all to authenticated using (is_amo()) with check (is_amo());
create policy bulletins_own_select on bulletins
  for select to authenticated using (cree_par = auth.uid());
create policy bulletins_own_insert on bulletins
  for insert to authenticated
  with check (
    cree_par = auth.uid()
    and is_copro_of(copro_id)
    and coproprietaire_id in (select my_coproprietaire_ids())
  );
-- le principal ne modifie/supprime que ses brouillons ; ensuite tout passe
-- par les edge functions (service role)
create policy bulletins_own_update on bulletins
  for update to authenticated
  using (cree_par = auth.uid() and statut = 'brouillon')
  with check (cree_par = auth.uid());
create policy bulletins_own_delete on bulletins
  for delete to authenticated
  using (cree_par = auth.uid() and statut = 'brouillon');

alter table signataires enable row level security;
create policy signataires_amo_read on signataires
  for select to authenticated using (is_amo());
create policy signataires_own_select on signataires
  for select to authenticated
  using (exists (select 1 from bulletins b where b.id = bulletin_id and b.cree_par = auth.uid()));
create policy signataires_own_insert on signataires
  for insert to authenticated
  with check (exists (
    select 1 from bulletins b
    where b.id = bulletin_id and b.cree_par = auth.uid() and b.statut = 'brouillon'
  ));
create policy signataires_own_update on signataires
  for update to authenticated
  using (exists (
    select 1 from bulletins b
    where b.id = bulletin_id and b.cree_par = auth.uid() and b.statut = 'brouillon'
  ));
create policy signataires_own_delete on signataires
  for delete to authenticated
  using (exists (
    select 1 from bulletins b
    where b.id = bulletin_id and b.cree_par = auth.uid() and b.statut = 'brouillon'
  ));

-- Les colonnes de preuve (token, OTP, signature, horodatages serveur) ne sont
-- jamais modifiables par le client, même sur un brouillon.
create or replace function signataires_protege_colonnes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.token_hash is not null or new.token_expire_le is not null
       or new.token_consomme_le is not null or new.piece_identite_path is not null
       or new.piece_identite_hash is not null or new.piece_deposee_le is not null
       or new.signe_le is not null or new.document_hash_signature is not null then
      raise exception 'Colonnes de preuve réservées au serveur';
    end if;
    return new;
  end if;
  if new.token_hash is distinct from old.token_hash
     or new.token_expire_le is distinct from old.token_expire_le
     or new.token_consomme_le is distinct from old.token_consomme_le
     or new.piece_identite_path is distinct from old.piece_identite_path
     or new.piece_identite_hash is distinct from old.piece_identite_hash
     or new.piece_deposee_le is distinct from old.piece_deposee_le
     or new.signe_le is distinct from old.signe_le
     or new.signe_ip is distinct from old.signe_ip
     or new.document_hash_signature is distinct from old.document_hash_signature
     or new.statut is distinct from old.statut then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;
create trigger trg_signataires_protege before insert or update on signataires
  for each row execute function signataires_protege_colonnes();

-- otp_codes : service role uniquement (aucune policy pour les autres rôles)
alter table otp_codes enable row level security;
revoke all on otp_codes from anon, authenticated;

alter table audit_log enable row level security;
create policy audit_amo_read on audit_log
  for select to authenticated using (is_amo());

-- ========== Storage : buckets dédiés, service role uniquement ==========
-- Aucune policy pour authenticated : tout accès (dépôt par URL d'upload
-- signée, lecture par URL signée 60 s) passe par les edge functions, qui
-- journalisent chaque consultation. PDF signé et certificat dans deux buckets
-- distincts (une compromission du premier n'emporte pas le second).
insert into storage.buckets (id, name, public)
values
  ('signature-pieces', 'signature-pieces', false),
  ('signature-docs', 'signature-docs', false),
  ('signature-certificats', 'signature-certificats', false)
on conflict (id) do nothing;
