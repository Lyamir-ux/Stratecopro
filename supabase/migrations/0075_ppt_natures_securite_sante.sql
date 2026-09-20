-- 0075 - Natures de poste « Sécurité » et « Santé » (feedback Amir 20/09/2026,
-- fenêtre « Ajouter une ligne »). Cinq natures : préservation du bâti,
-- performance énergétique, amélioration, sécurité, santé. Les deux nouvelles
-- relèvent de l'article 24 (conservation de l'immeuble, préservation de la
-- santé et de la sécurité physique des occupants), comme la préservation.

alter table ppt_postes drop constraint if exists ppt_postes_priorite_check;
alter table ppt_postes add constraint ppt_postes_priorite_check
  check (priorite in ('preservation', 'energetique', 'amelioration', 'securite', 'sante'));

-- codage depuis le JSON du skill : reconnaît aussi sécurité / santé
create or replace function ppt_code_priorite(p text)
returns text language sql immutable as $$
  select case
    when p is null then 'preservation'
    when lower(p) like 'pr%' then 'preservation'
    when lower(p) like '%nerg%' then 'energetique'
    when lower(p) like 'am%' then 'amelioration'
    when lower(p) like 's_cu%' or lower(p) like 'secu%' then 'securite'
    when lower(p) like 'sant%' then 'sante'
    else 'preservation' end;
$$;

-- ajout d'une ligne par le syndic : natures acceptées
create or replace function ppt_ajouter_poste(p_copro_id uuid, p_libelle text, p_priorite text, p_annee int, p_montant numeric default null, p_commentaire text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pos int;
begin
  if not ppt_ouvre(p_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if btrim(coalesce(p_libelle, '')) = '' then raise exception 'Libellé requis'; end if;
  if p_priorite not in ('preservation', 'energetique', 'amelioration', 'securite', 'sante') then raise exception 'Nature invalide'; end if;
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
