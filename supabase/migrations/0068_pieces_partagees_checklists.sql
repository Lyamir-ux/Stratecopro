-- 0068 - Feedback d'Amir du 13/09/2026 : une même pièce (ex. attestation de
-- mise à jour du registre) est attendue par plusieurs dispositifs - checklists
-- MaPrimeRénov' et EMS & Climaxion, dossiers éco-PTZ, ANAH, EMS & Climaxion de
-- la page Documents à produire, assurance. Déposée UNE fois, elle coche la
-- pièce dans toutes les checklists. Le lien entre pièces est le type de
-- document choisi au dépôt (un type par pièce, côté client) ; le client
-- traduit le type en libellés de pièces et appelle la RPC ci-dessous.
--
-- Les checklists sont réservées à l'AMO (RLS 0002) alors que le syndic dépose
-- aussi des pièces (onglet Fichiers, Documents à produire) : d'où deux
-- fonctions security definer, qui vérifient elles-mêmes que l'appelant est de
-- l'équipe AMO ou syndic de la copropriété.

/* Coche les pièces de checklist de la copro dont le libellé est dans p_labels ;
   relie le fichier (table fichiers) si fourni. Renvoie le nombre de pièces
   modifiées. */
create or replace function checklist_cocher_pieces(
  p_copro_id uuid,
  p_labels text[],
  p_fichier_id uuid default null
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not (is_amo() or is_syndic_of(p_copro_id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update checklist_items i
     set done = true,
         fichier_id = coalesce(i.fichier_id, p_fichier_id)
    from checklists c
   where c.id = i.checklist_id
     and c.copro_id = p_copro_id
     and i.label = any (p_labels)
     and (not i.done or (i.fichier_id is null and p_fichier_id is not null));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function checklist_cocher_pieces(uuid, text[], uuid) from anon, public;
grant execute on function checklist_cocher_pieces(uuid, text[], uuid) to authenticated;

/* Avant suppression d'un fichier : décoche les pièces qu'il avait cochées
   (la contrainte FK met déjà fichier_id à null, mais laisserait la case
   cochée). Renvoie le nombre de pièces décochées. */
create or replace function checklist_delier_fichier(p_fichier_id uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_copro uuid;
  n integer;
begin
  select copro_id into v_copro from fichiers where id = p_fichier_id;
  if v_copro is null then
    return 0;
  end if;
  if not (is_amo() or is_syndic_of(v_copro)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update checklist_items i
     set done = false,
         fichier_id = null
    from checklists c
   where c.id = i.checklist_id
     and c.copro_id = v_copro
     and i.fichier_id = p_fichier_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function checklist_delier_fichier(uuid) from anon, public;
grant execute on function checklist_delier_fichier(uuid) to authenticated;
