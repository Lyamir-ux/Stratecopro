-- 0079 - Feedback Amir 10/09/2026 (portail, Mes documents) : circuit de
-- vérification des pièces justificatives déposées par les copropriétaires.
--   • Toute pièce déposée passe « à vérifier » ; on trace qui l'a déposée
--     (copropriétaire lui-même, ou membre AMO depuis l'aperçu du portail) et quand.
--   • L'administratif Strat Eco la qualifie depuis l'app (menu déroulant :
--     conforme, illisible, incomplet, mauvaise année, mauvais document…) :
--     statut « validée » ou « refusée » + motif ; vérificateur et date tracés.
--   • Refus → e-mail automatique au copropriétaire (edge notifier-piece-refusee),
--     statut d'envoi tracé sur la ligne.
-- Le copropriétaire garde ses droits RLS (dépôt / remplacement) mais ne peut
-- pas changer lui-même le statut : le trigger neutralise toute modification
-- des colonnes de vérification faite par un non-AMO.

create type statut_piece as enum ('a_verifier', 'valide', 'refuse');

alter table pieces_justificatives
  add column statut statut_piece not null default 'a_verifier',
  add column deposee_par uuid references auth.users (id) on delete set null,
  add column deposee_par_nom text,
  add column verifiee_par uuid references auth.users (id) on delete set null,
  add column verifiee_par_nom text,
  add column verifiee_le timestamptz,
  -- conforme | illisible | incomplet | mauvaise_annee | mauvais_document | perime | autre
  add column qualification text,
  add column motif_refus text,
  -- envoye | simule | erreur | sans_email
  add column refus_email_statut text,
  add column refus_email_le timestamptz;

create index idx_pieces_a_verifier on pieces_justificatives (uploaded_at) where statut = 'a_verifier';

-- Pièces déjà en base : déposées par leur copropriétaire, à vérifier.
update pieces_justificatives p
set deposee_par = cp.user_id,
    deposee_par_nom = cp.nom
from coproprietaires cp
where cp.id = p.coproprietaire_id and p.deposee_par_nom is null;

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
    new.refus_email_statut := null;
    new.refus_email_le := null;
    return new;
  end if;

  -- mise à jour sans nouveau fichier : le dépositaire ne change pas
  new.deposee_par := old.deposee_par;
  new.deposee_par_nom := old.deposee_par_nom;

  if not is_amo() then
    -- un copropriétaire ne qualifie pas sa propre pièce
    new.statut := old.statut;
    new.verifiee_par := old.verifiee_par;
    new.verifiee_par_nom := old.verifiee_par_nom;
    new.verifiee_le := old.verifiee_le;
    new.qualification := old.qualification;
    new.motif_refus := old.motif_refus;
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
    end if;
    if new.statut <> 'refuse' then
      new.motif_refus := null;
      new.refus_email_statut := null;
      new.refus_email_le := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.pieces_justificatives_cycle() from anon, authenticated;

drop trigger if exists pieces_justificatives_cycle on pieces_justificatives;
create trigger pieces_justificatives_cycle
  before insert or update on pieces_justificatives
  for each row execute function pieces_justificatives_cycle();
