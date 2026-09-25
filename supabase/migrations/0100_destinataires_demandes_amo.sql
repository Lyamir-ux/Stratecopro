-- 0100 - Feedback d'Amir du 24/09/2026 (page /demandes) : les nouvelles
-- demandes de rénovation énergétique déposées par les syndics ne partent plus
-- à toute l'équipe AMO, seulement à Louis, Cyrielle, Ryan et Amir.
-- La liste n'est pas figée dans le code : un drapeau par collaborateur,
-- réglé par le seul dirigeant depuis /collaborateurs (même verrou que
-- niveau_pieces, 0054). L'edge function notifier-demande-amo lit ce drapeau ;
-- sans aucun destinataire coché, l'alerte revient au dirigeant.
alter table profiles add column if not exists recoit_demandes_amo boolean not null default false;

update profiles p
   set recoit_demandes_amo = true
  from auth.users u
 where u.id = p.user_id
   and p.role = 'amo'
   and lower(u.email) in ('louis@strateco.fr', 'cyrielle@strateco.fr', 'ryan@strateco.fr', 'amir@strateco.fr');

create or replace function profiles_protege_habilitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if new.dirigeant is distinct from old.dirigeant then
    raise exception 'Le statut de dirigeant ne se modifie pas depuis l''application';
  end if;
  if new.niveau_pieces is distinct from old.niveau_pieces and not is_dirigeant() then
    raise exception 'Seul le dirigeant peut modifier le niveau d''accès aux pièces';
  end if;
  if new.recoit_demandes_amo is distinct from old.recoit_demandes_amo and not is_dirigeant() then
    raise exception 'Seul le dirigeant choisit qui reçoit les demandes des syndics';
  end if;
  return new;
end;
$$;
revoke execute on function profiles_protege_habilitations() from anon, authenticated, public;
