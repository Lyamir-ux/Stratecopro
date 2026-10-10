-- 0155 - Pièce d'identité des signataires et RIB des bulletins : validation par
-- l'AMO, consultation et remplacement depuis le portail, nouveau mandat SEPA en
-- cas de changement de compte (retour de A CHELGHAM du 09/10/2026, 22:11 : « on
-- doit pouvoir visualiser et remplacer les pièces déjà fournies au cas où : les
-- pièces d'identité, ainsi que le RIB comme l'avis d'imposition ; elles doivent
-- être validées par l'AMO »).
--
-- Décisions d'Amir du même soir :
--  - un RIB d'un AUTRE compte remplacé après la signature = nouveau mandat SEPA,
--    relu puis signé avec un code reçu par e-mail ; jusque-là le mandat signé
--    reste en vigueur (colonnes *_nouveau_*) ;
--  - la pièce refusée d'un cosignataire se remplace de deux façons : par le
--    cosignataire, depuis un nouveau lien personnel, ou par le signataire
--    principal depuis le portail.
--
-- Validation réservée au niveau 1 (seul à lire ces pièces, CGU art. 7.5.1).
-- Écritures par l'edge function signature-flux (service role) uniquement :
-- les nouvelles colonnes rejoignent les colonnes de preuve verrouillées.

alter table signataires
  add column if not exists piece_statut statut_piece,
  add column if not exists piece_qualification text,
  add column if not exists piece_motif_refus text,
  add column if not exists piece_verifiee_le timestamptz,
  add column if not exists piece_verifiee_par uuid references auth.users(id) on delete set null,
  add column if not exists piece_refus_email_statut text,
  add column if not exists piece_remplacee_le timestamptz;

comment on column signataires.piece_statut is
  'Validation de la pièce d''identité par l''AMO (niveau 1) : a_verifier au dépôt, valide ou refuse (0155).';
comment on column signataires.piece_remplacee_le is
  'Dernier remplacement de la pièce après la signature (par le signataire, ou par le principal pour un cosignataire). Les colonnes piece_deposee_le / attestation_piece_le restent celles de la signature.';

alter table bulletins
  add column if not exists rib_statut statut_piece,
  add column if not exists rib_qualification text,
  add column if not exists rib_motif_refus text,
  add column if not exists rib_verifiee_le timestamptz,
  add column if not exists rib_verifiee_par uuid references auth.users(id) on delete set null,
  add column if not exists rib_refus_email_statut text,
  add column if not exists rib_remplace_le timestamptz,
  add column if not exists rib_nouveau_path text,
  add column if not exists rib_nouveau_hash text,
  add column if not exists iban_nouveau_chiffre bytea,
  add column if not exists iban_nouveau_dernier4 text,
  add column if not exists mandat_nouveau_path text,
  add column if not exists mandat_nouveau_hash text,
  add column if not exists mandat_nouveau_lu_le timestamptz;

comment on column bulletins.rib_statut is
  'Validation du RIB par l''AMO (niveau 1) : a_verifier au dépôt, valide ou refuse (0155).';
comment on column bulletins.rib_nouveau_path is
  'Changement de compte après la signature : RIB du nouveau compte, en attente de la signature du nouveau mandat SEPA (le mandat signé reste en vigueur jusque-là).';
comment on column bulletins.mandat_nouveau_path is
  'Nouveau mandat SEPA pré-rempli (bucket signature-docs) pour le changement de compte, à lire puis signer par code.';

-- pièces déjà déposées : à valider
update signataires set piece_statut = 'a_verifier'
  where piece_identite_path is not null and piece_statut is null;
update bulletins set rib_statut = 'a_verifier'
  where rib_path is not null and rib_statut is null;

-- ========== verrous des colonnes réservées au serveur ==========

create or replace function public.signataires_protege_colonnes()
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
       or new.signe_le is not null or new.document_hash_signature is not null
       or new.piece_statut is not null or new.piece_qualification is not null
       or new.piece_motif_refus is not null or new.piece_verifiee_le is not null
       or new.piece_verifiee_par is not null or new.piece_refus_email_statut is not null
       or new.piece_remplacee_le is not null then
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
     or new.statut is distinct from old.statut
     or new.piece_statut is distinct from old.piece_statut
     or new.piece_qualification is distinct from old.piece_qualification
     or new.piece_motif_refus is distinct from old.piece_motif_refus
     or new.piece_verifiee_le is distinct from old.piece_verifiee_le
     or new.piece_verifiee_par is distinct from old.piece_verifiee_par
     or new.piece_refus_email_statut is distinct from old.piece_refus_email_statut
     or new.piece_remplacee_le is distinct from old.piece_remplacee_le then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;

create or replace function public.bulletins_protege_colonnes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.statut is distinct from 'brouillon'
       or new.document_path is not null or new.document_hash is not null
       or new.document_signe_path is not null or new.document_signe_hash is not null
       or new.sceau_signature is not null or new.certificat_path is not null
       or new.rib_path is not null or new.rib_hash is not null
       or new.iban_chiffre is not null or new.iban_dernier4 is not null
       or new.scelle_le is not null or new.liens_envoyes_le is not null
       or new.mandat_path is not null or new.mandat_hash is not null
       or new.mandat_lu_le is not null or new.mandat_hash_signature is not null
       or new.mandat_signe_le is not null or new.mandat_signe_path is not null
       or new.mandat_signe_hash is not null or new.mandat_sceau is not null
       or new.rib_statut is not null or new.rib_qualification is not null
       or new.rib_motif_refus is not null or new.rib_verifiee_le is not null
       or new.rib_verifiee_par is not null or new.rib_refus_email_statut is not null
       or new.rib_remplace_le is not null or new.rib_nouveau_path is not null
       or new.rib_nouveau_hash is not null or new.iban_nouveau_chiffre is not null
       or new.iban_nouveau_dernier4 is not null or new.mandat_nouveau_path is not null
       or new.mandat_nouveau_hash is not null or new.mandat_nouveau_lu_le is not null then
      raise exception 'Colonnes de preuve réservées au serveur';
    end if;
    return new;
  end if;
  if new.statut is distinct from old.statut
     or new.document_path is distinct from old.document_path
     or new.document_hash is distinct from old.document_hash
     or new.document_signe_path is distinct from old.document_signe_path
     or new.document_signe_hash is distinct from old.document_signe_hash
     or new.sceau_signature is distinct from old.sceau_signature
     or new.certificat_path is distinct from old.certificat_path
     or new.rib_path is distinct from old.rib_path
     or new.rib_hash is distinct from old.rib_hash
     or new.iban_chiffre is distinct from old.iban_chiffre
     or new.iban_dernier4 is distinct from old.iban_dernier4
     or new.scelle_le is distinct from old.scelle_le
     or new.liens_envoyes_le is distinct from old.liens_envoyes_le
     or new.mandat_path is distinct from old.mandat_path
     or new.mandat_hash is distinct from old.mandat_hash
     or new.mandat_lu_le is distinct from old.mandat_lu_le
     or new.mandat_hash_signature is distinct from old.mandat_hash_signature
     or new.mandat_signe_le is distinct from old.mandat_signe_le
     or new.mandat_signe_path is distinct from old.mandat_signe_path
     or new.mandat_signe_hash is distinct from old.mandat_signe_hash
     or new.mandat_sceau is distinct from old.mandat_sceau
     or new.rib_statut is distinct from old.rib_statut
     or new.rib_qualification is distinct from old.rib_qualification
     or new.rib_motif_refus is distinct from old.rib_motif_refus
     or new.rib_verifiee_le is distinct from old.rib_verifiee_le
     or new.rib_verifiee_par is distinct from old.rib_verifiee_par
     or new.rib_refus_email_statut is distinct from old.rib_refus_email_statut
     or new.rib_remplace_le is distinct from old.rib_remplace_le
     or new.rib_nouveau_path is distinct from old.rib_nouveau_path
     or new.rib_nouveau_hash is distinct from old.rib_nouveau_hash
     or new.iban_nouveau_chiffre is distinct from old.iban_nouveau_chiffre
     or new.iban_nouveau_dernier4 is distinct from old.iban_nouveau_dernier4
     or new.mandat_nouveau_path is distinct from old.mandat_nouveau_path
     or new.mandat_nouveau_hash is distinct from old.mandat_nouveau_hash
     or new.mandat_nouveau_lu_le is distinct from old.mandat_nouveau_lu_le then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;
