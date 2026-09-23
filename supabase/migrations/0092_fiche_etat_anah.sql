-- 0092 - Fiche « État de la copropriété » (ANAH - MaPrimeRénov' Copro)
--
-- Modèle Fiche_Etat_ZORN.docx reçu le 23/09/2026, arbitrages d'Amir : le
-- syndic complète la fiche en ligne (pré-remplie depuis la base), l'AMO la
-- valide, puis le président du conseil syndical et le syndic la signent
-- électroniquement (ordre libre). Une modification après signature ne
-- redemande pas de signature. Feedback du même jour (09:43) : le bouton
-- « Générer le rapport d'enquête sociale » écrit l'occupation dans la fiche.
--
--   1. montage_formulaires admet le type fiche_etat_anah et le statut
--      « valide » (validation AMO - réservée à l'équipe AMO par trigger) ;
--   2. fiche_etat_signatures : une ligne par signataire (président du CS,
--      syndic). Écritures réservées à l'edge function signature-fiche-etat
--      (service role) ; lecture AMO + syndic du dossier, sans les hash du
--      lien ni du code (GRANT colonne par colonne).
--   Journal de preuve : audit_log (chaîné, append-only), bulletin_id = id de
--   la ligne de signature, événements « fiche_etat.* ».

-- ========== 1. montage_formulaires ==========
alter table montage_formulaires drop constraint if exists montage_formulaires_type_check;
alter table montage_formulaires
  add constraint montage_formulaires_type_check
  check (type in ('fiche_avant_ag', 'demande_pret', 'coordonnees_cee', 'fiche_etat_anah'));

alter table montage_formulaires drop constraint if exists montage_formulaires_statut_check;
alter table montage_formulaires
  add constraint montage_formulaires_statut_check
  check (statut in ('brouillon', 'transmis', 'valide'));

-- Le syndic écrit dans montage_formulaires (0011) : il ne doit pas pouvoir
-- valider lui-même. Seuls l'AMO et le service role (edge function) posent ou
-- retirent le statut « valide ».
create or replace function montage_form_protege_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.statut = 'valide') is distinct from (coalesce(old.statut, '') = 'valide')
     and auth.uid() is not null and not is_amo() then
    raise exception 'La validation de la fiche est réservée à l''équipe AMO';
  end if;
  return new;
end;
$$;
revoke execute on function montage_form_protege_validation() from anon, authenticated, public;

drop trigger if exists trg_montage_form_validation on montage_formulaires;
create trigger trg_montage_form_validation
  before insert or update on montage_formulaires
  for each row execute function montage_form_protege_validation();

-- ========== 2. fiche_etat_signatures ==========
create table if not exists fiche_etat_signatures (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  role text not null check (role in ('president_cs', 'syndic')),
  nom text not null default '',
  email text not null default '',
  -- compte du signataire syndic (le président du CS n'a pas de compte)
  user_id uuid references auth.users (id) on delete set null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'signe')),
  -- lien personnel du président : seul le SHA-256 du token est stocké
  token_hash text,
  token_expire_le timestamptz,
  token_consomme_le timestamptz,
  lien_envoye_le timestamptz,
  -- code à usage unique (PBKDF2, jamais en clair)
  otp_hash text,
  otp_expire_le timestamptz,
  otp_tentatives smallint not null default 0,
  otp_envois timestamptz[] not null default '{}',
  -- preuve de signature
  attestation_le timestamptz,
  signe_le timestamptz,
  signe_ip inet,
  signe_user_agent text,
  donnees_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (copro_id, role)
);
create index if not exists idx_fiche_etat_sig_token on fiche_etat_signatures (token_hash);

drop trigger if exists trg_fiche_etat_sig_updated on fiche_etat_signatures;
create trigger trg_fiche_etat_sig_updated before update on fiche_etat_signatures
  for each row execute function set_updated_at();

alter table fiche_etat_signatures enable row level security;

drop policy if exists fiche_etat_sig_read on fiche_etat_signatures;
create policy fiche_etat_sig_read on fiche_etat_signatures
  for select to authenticated
  using (is_amo() or is_syndic_of(copro_id));

-- Aucune écriture côté client ; lecture limitée aux colonnes non sensibles.
revoke all on fiche_etat_signatures from anon, authenticated;
grant select (
  id, copro_id, role, nom, email, statut, token_expire_le, lien_envoye_le,
  attestation_le, signe_le, donnees_hash, created_at, updated_at
) on fiche_etat_signatures to authenticated;

comment on table fiche_etat_signatures is
  'Signatures électroniques de la fiche État ANAH (président du CS, syndic) - écritures par l''edge function signature-fiche-etat uniquement.';
