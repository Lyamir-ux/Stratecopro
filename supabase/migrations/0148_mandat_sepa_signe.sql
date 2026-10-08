-- 0148 - Retour du dossier d'adhésion au prêt collectif dans le portail, avec
-- le mandat de prélèvement SEPA signé électroniquement (demande d'Amir du
-- 08/10/2026 : « le mandat SEPA peut être signé électroniquement également »).
--
-- Le parcours interne (bulletin CEGEE pré-rempli + signature électronique
-- avancée) revient pour les copropriétés sans lien de souscription de la banque.
-- Le mandat SEPA n'est plus à imprimer : il est généré à partir du RIB, déposé
-- sur le bulletin (un mandat par bulletin, comme le RIB), lu par le signataire
-- principal puis signé avec le même code à usage unique que le bulletin. Seul
-- le signataire principal (titulaire du compte) le signe - les cosignataires
-- ne le voient pas, il porte l'IBAN complet.
--
-- Écritures réservées à l'edge function signature-flux (service role), comme
-- les autres colonnes de preuve.

alter table bulletins
  add column if not exists mandat_path text,
  add column if not exists mandat_hash text,
  add column if not exists mandat_lu_le timestamptz,
  add column if not exists mandat_hash_signature text,
  add column if not exists mandat_signe_le timestamptz,
  add column if not exists mandat_signe_path text,
  add column if not exists mandat_signe_hash text,
  add column if not exists mandat_sceau text;

comment on column bulletins.mandat_path is
  'Mandat SEPA pré-rempli (bucket signature-docs), généré depuis le RIB du bulletin (0148).';
comment on column bulletins.mandat_hash is
  'SHA-256 du mandat pré-rempli, calculé côté serveur au dépôt.';
comment on column bulletins.mandat_lu_le is
  'Lecture intégrale du mandat par le signataire principal - préalable au code de signature.';
comment on column bulletins.mandat_hash_signature is
  'SHA-256 du mandat recalculé à l''instant où le code du signataire principal est validé.';
comment on column bulletins.mandat_signe_le is
  'Signature du mandat par le signataire principal (même code que le bulletin).';
comment on column bulletins.mandat_signe_path is
  'Mandat signé : mention de signature dans la case « Signature(s) » + page de preuve.';
comment on column bulletins.mandat_signe_hash is
  'SHA-256 du mandat signé.';
comment on column bulletins.mandat_sceau is
  'Sceau Ed25519 de Strat Eco sur mandat_signe_hash (null si la clé n''est pas configurée).';

-- Verrou serveur des colonnes de preuve du bulletin. Le portail crée le
-- brouillon (insert) et peut le supprimer, mais ne le modifie jamais : tout le
-- reste passe par signature-flux (service role). Même principe que
-- signataires_protege_colonnes (0050).
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
       or new.mandat_signe_hash is not null or new.mandat_sceau is not null then
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
     or new.mandat_sceau is distinct from old.mandat_sceau then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bulletins_protege on bulletins;
create trigger trg_bulletins_protege
  before insert or update on bulletins
  for each row execute function public.bulletins_protege_colonnes();
