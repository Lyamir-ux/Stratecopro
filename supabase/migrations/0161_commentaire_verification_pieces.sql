-- 0161 - Idée d'Amir du 12/10/2026 (page Vos tâches) : « à chaque fois qu'on
-- qualifie une pièce, ouvrir un champ sur le côté pour y mettre un commentaire si
-- nécessaire ; envoyer une notification au copropriétaire à chaque fois qu'une
-- pièce est qualifiée, ou si elle n'est pas qualifiée, avec le commentaire ».
--   • commentaire de l'AMO sur la pièce, repris dans l'e-mail et affiché au portail :
--     pieces_justificatives.commentaire_verification, signataires.piece_commentaire,
--     bulletins.rib_commentaire ;
--   • l'e-mail part désormais à la validation comme au refus : les colonnes
--     *refus_email_statut / *refus_email_le tracent l'e-mail de la dernière
--     qualification, quelle qu'elle soit (noms conservés pour l'ancien bundle) ;
--   • correctif : la trace d'envoi écrite par l'edge function (clé de service, sans
--     utilisateur) était annulée par le déclencheur, qui la prenait pour la
--     modification d'un non-AMO - les pièces refusées restaient « e-mail en cours
--     d'envoi » côté AMO.

alter table pieces_justificatives add column if not exists commentaire_verification text;
alter table signataires add column if not exists piece_commentaire text;
alter table bulletins add column if not exists rib_commentaire text;

comment on column pieces_justificatives.commentaire_verification is
  'Commentaire de l''AMO à la qualification (facultatif), repris dans l''e-mail au copropriétaire et affiché au portail (0161).';
comment on column pieces_justificatives.refus_email_statut is
  'E-mail de la dernière qualification (validation ou refus depuis 0161) : envoye | simule | erreur | sans_email.';
comment on column signataires.piece_commentaire is
  'Commentaire de l''AMO à la validation de la pièce d''identité, repris dans l''e-mail (0161).';
comment on column bulletins.rib_commentaire is
  'Commentaire de l''AMO à la validation du RIB, repris dans l''e-mail (0161).';

create or replace function pieces_justificatives_cycle()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nom_courant text;
  nouveau_fichier boolean;
begin
  select full_name into nom_courant from profiles where user_id = auth.uid();

  nouveau_fichier := tg_op = 'INSERT'
    or new.storage_path is distinct from old.storage_path
    or new.sha256 is distinct from old.sha256;

  if nouveau_fichier then
    -- nouveau dépôt (ou remplacement) : repart à vérifier, dépositaire tracé
    new.statut := 'a_verifier';
    new.deposee_par := coalesce(auth.uid(), new.deposee_par);
    new.deposee_par_nom := coalesce(
      nom_courant,
      (select nom from coproprietaires where id = new.coproprietaire_id),
      new.deposee_par_nom
    );
    new.verifiee_par := null;
    new.verifiee_par_nom := null;
    new.verifiee_le := null;
    new.qualification := null;
    new.motif_refus := null;
    new.commentaire_verification := null;
    new.refus_email_statut := null;
    new.refus_email_le := null;
    return new;
  end if;

  -- mise à jour sans nouveau fichier : le dépositaire ne change pas
  new.deposee_par := old.deposee_par;
  new.deposee_par_nom := old.deposee_par_nom;

  -- edge function notifier-piece-refusee (clé de service) : seule la trace de
  -- l'e-mail change, la qualification reste celle de l'AMO
  if auth.role() = 'service_role' then
    new.statut := old.statut;
    new.verifiee_par := old.verifiee_par;
    new.verifiee_par_nom := old.verifiee_par_nom;
    new.verifiee_le := old.verifiee_le;
    new.qualification := old.qualification;
    new.motif_refus := old.motif_refus;
    new.commentaire_verification := old.commentaire_verification;
    return new;
  end if;

  if not is_amo() then
    -- un copropriétaire ne qualifie pas sa propre pièce
    new.statut := old.statut;
    new.verifiee_par := old.verifiee_par;
    new.verifiee_par_nom := old.verifiee_par_nom;
    new.verifiee_le := old.verifiee_le;
    new.qualification := old.qualification;
    new.motif_refus := old.motif_refus;
    new.commentaire_verification := old.commentaire_verification;
    new.refus_email_statut := old.refus_email_statut;
    new.refus_email_le := old.refus_email_le;
    return new;
  end if;

  if new.statut is distinct from old.statut or new.qualification is distinct from old.qualification then
    if new.statut in ('valide', 'refuse') then
      new.verifiee_par := auth.uid();
      new.verifiee_par_nom := nom_courant;
      new.verifiee_le := now();
    else
      new.verifiee_par := null;
      new.verifiee_par_nom := null;
      new.verifiee_le := null;
      new.qualification := null;
      new.motif_refus := null;
      new.commentaire_verification := null;
    end if;
    if new.statut <> 'refuse' then
      new.motif_refus := null;
    end if;
    -- nouvelle qualification : l'e-mail qui va partir remplace la trace précédente
    new.refus_email_statut := null;
    new.refus_email_le := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.pieces_justificatives_cycle() from anon, authenticated;

-- Les commentaires des pièces de la signature ne s'écrivent que par le serveur
-- (signature-flux, action amo_verifier), comme le reste de la validation (0155).
create or replace function public.signataires_protege_commentaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.piece_commentaire is not null)
     or (tg_op = 'UPDATE' and new.piece_commentaire is distinct from old.piece_commentaire) then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;

create or replace function public.bulletins_protege_commentaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.rib_commentaire is not null)
     or (tg_op = 'UPDATE' and new.rib_commentaire is distinct from old.rib_commentaire) then
    raise exception 'Colonnes de preuve réservées au serveur';
  end if;
  return new;
end;
$$;

revoke execute on function public.signataires_protege_commentaire() from anon, authenticated;
revoke execute on function public.bulletins_protege_commentaire() from anon, authenticated;

drop trigger if exists signataires_protege_commentaire on signataires;
create trigger signataires_protege_commentaire
  before insert or update on signataires
  for each row execute function public.signataires_protege_commentaire();

drop trigger if exists bulletins_protege_commentaire on bulletins;
create trigger bulletins_protege_commentaire
  before insert or update on bulletins
  for each row execute function public.bulletins_protege_commentaire();
