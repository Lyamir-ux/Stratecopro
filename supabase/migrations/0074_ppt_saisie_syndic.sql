-- 0074 - Suivi de l'échéancier PPT : saisie du syndic (feedbacks Amir 20/09/2026).
--   • montant_syndic / commentaire_syndic : le gestionnaire clique sur un montant,
--     saisit le montant TTC constaté (devis, vote…) et un commentaire ; la pastille
--     change de couleur, le commentaire s'affiche au survol. Le montant saisi prime
--     sur le TTC actualisé dans le récap, le suivi et les tableaux de bord.
--   • origine : 'rapport' (normalisé depuis le PPPT) ou 'syndic' (ligne ajoutée
--     par le gestionnaire via « Ajouter une ligne » ; rapport_id null, donc elle
--     survit à la validation d'une nouvelle version du rapport).
-- Trois RPC security definer (ppt_ouvre) : la RLS d'écriture reste au dirigeant.

alter table ppt_postes
  add column if not exists montant_syndic numeric,
  add column if not exists commentaire_syndic text,
  add column if not exists origine text not null default 'rapport' check (origine in ('rapport', 'syndic'));

/* Montant saisi à la main (TTC) + commentaire ; p_montant null = retour au calcul. */
create or replace function ppt_saisir_montant_poste(p_poste_id uuid, p_montant numeric, p_commentaire text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p ppt_postes%rowtype;
begin
  select * into p from ppt_postes where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
  if not ppt_ouvre(p.ppt_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if not p.actif then raise exception 'Poste archivé : « % »', p.libelle; end if;
  if p_montant is not null and (p_montant < 0 or p_montant > 1e9) then raise exception 'Montant invalide'; end if;
  update ppt_postes
     set montant_syndic = p_montant,
         commentaire_syndic = nullif(btrim(coalesce(p_commentaire, '')), '')
   where id = p.id;
  perform ppt_journaliser(p.ppt_copro_id, null, 'montant_saisi',
    jsonb_build_object('poste_id', p.id, 'libelle', p.libelle, 'avant', p.montant_syndic, 'montant', p_montant,
                       'commentaire', nullif(btrim(coalesce(p_commentaire, '')), '')));
end;
$$;
revoke execute on function ppt_saisir_montant_poste(uuid, numeric, text) from anon, public;
grant execute on function ppt_saisir_montant_poste(uuid, numeric, text) to authenticated;

/* Ligne ajoutée par le syndic : libellé, nature, année, montant TTC et commentaire facultatifs. */
create or replace function ppt_ajouter_poste(p_copro_id uuid, p_libelle text, p_priorite text, p_annee int, p_montant numeric default null, p_commentaire text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pos int;
begin
  if not ppt_ouvre(p_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if btrim(coalesce(p_libelle, '')) = '' then raise exception 'Libellé requis'; end if;
  if p_priorite not in ('preservation', 'energetique', 'amelioration') then raise exception 'Nature invalide'; end if;
  if p_annee is not null and (p_annee < 2000 or p_annee > 2100) then raise exception 'Année invalide'; end if;
  if p_montant is not null and (p_montant < 0 or p_montant > 1e9) then raise exception 'Montant invalide'; end if;
  select coalesce(max(position), 0) + 1 into v_pos from ppt_postes where ppt_copro_id = p_copro_id;
  insert into ppt_postes (ppt_copro_id, rapport_id, libelle, priorite, annee_prevue, annee_origine, cout_origine,
                          montant_syndic, commentaire_syndic, origine, statut, position, actif)
  values (p_copro_id, null, btrim(p_libelle), p_priorite, p_annee, case when p_annee is null then null else 'source' end, null,
          p_montant, nullif(btrim(coalesce(p_commentaire, '')), ''), 'syndic', 'programme', v_pos, true)
  returning id into v_id;
  perform ppt_journaliser(p_copro_id, null, 'poste_ajoute',
    jsonb_build_object('poste_id', v_id, 'libelle', btrim(p_libelle), 'priorite', p_priorite, 'annee', p_annee, 'montant', p_montant));
  return v_id;
end;
$$;
revoke execute on function ppt_ajouter_poste(uuid, text, text, int, numeric, text) from anon, public;
grant execute on function ppt_ajouter_poste(uuid, text, text, int, numeric, text) to authenticated;

/* Retrait d'une ligne ajoutée par le syndic (archivage, jamais de suppression). */
create or replace function ppt_retirer_poste(p_poste_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p ppt_postes%rowtype;
begin
  select * into p from ppt_postes where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
  if not ppt_ouvre(p.ppt_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if p.origine <> 'syndic' then raise exception 'Seule une ligne ajoutée par le syndic peut être retirée'; end if;
  if p.statut in ('vote', 'realise') then raise exception 'Ligne déjà votée ou réalisée'; end if;
  update ppt_postes set actif = false where id = p.id;
  perform ppt_journaliser(p.ppt_copro_id, null, 'poste_retire', jsonb_build_object('poste_id', p.id, 'libelle', p.libelle));
end;
$$;
revoke execute on function ppt_retirer_poste(uuid) from anon, public;
grant execute on function ppt_retirer_poste(uuid) to authenticated;
