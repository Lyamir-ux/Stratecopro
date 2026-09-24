-- 0095 - Suivi PPT : supprimer un document, même validé, pour recommencer
--
-- Feedback Amir 24/09/2026 (08:49, /syndic/ppt/copros) : « offrir la
-- possibilité de supprimer un PPPT, un PPT, un fichier, afin de recommencer en
-- cas de validation ».
--
-- Jusqu'ici (0082) un rapport validé ne se supprimait pas : il fallait le
-- rejeter d'abord, or le rejet est lui aussi refusé sur un rapport validé, et
-- le retour en vérification (0084 / 0087) est refusé dès que le cabinet a
-- travaillé un poste (montant saisi, décalage, vote, retrait). Un plan validé
-- puis retouché ne pouvait donc plus être repris (cas Porte du Soleil).
--
-- Désormais :
--   • un document non validé se supprime comme avant (déposant ou équipe
--     Strat Eco) ;
--   • un rapport validé se supprime par le seul dirigeant, comme la validation
--     qu'il défait. La suppression emporte ses postes (travaillés ou non) et ses
--     remarques ; si c'était le plan en vigueur, la version validée précédente
--     du même type redevient le plan en vigueur (ses postes sont réactivés, sauf
--     les lignes retirées par le syndic) ;
--   • restent : les lignes ajoutées par le syndic (rapport_id null), les AG et
--     leurs résolutions (le lien vers un poste supprimé passe à null), les champs
--     de la fiche complétés à la validation (faits sur l'immeuble, 0084) ;
--   • le journal garde la trace : compteurs, version restaurée, motif.
--
-- Les postes d'un rapport sont supprimés explicitement quel que soit son statut :
-- la clé ppt_postes.rapport_id est en « set null », et un poste orphelin
-- passerait pour une ligne ajoutée par le syndic.

drop function if exists ppt_supprimer_rapport(uuid);

create or replace function ppt_supprimer_rapport(p_rapport_id uuid, p_motif text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_r ppt_rapports;
  v_courant uuid;
  v_prev uuid;
  v_postes int := 0;
  v_travailles int := 0;
  v_votes int := 0;
  v_remarques int := 0;
  v_restaures int := 0;
begin
  select * into v_r from ppt_rapports where id = p_rapport_id;
  if not found then raise exception 'Document introuvable'; end if;

  if v_r.statut = 'valide' then
    if not is_dirigeant() then
      raise exception 'Ce rapport est validé : seul le dirigeant de Strat Eco peut le supprimer (son plan et ses remarques partent avec).';
    end if;
  elsif not (is_amo() or (v_r.depose_par = auth.uid() and ppt_depose(v_r.ppt_copro_id))) then
    raise exception 'Suppression réservée à l''équipe Strat Eco ou au déposant du document';
  end if;

  select count(*),
         count(*) filter (where p.statut <> 'programme'
                             or p.montant_vote is not null
                             or p.montant_syndic is not null
                             or p.commentaire_syndic is not null
                             or p.annee_prochaine_presentation is not null
                             or p.retire_le is not null
                             or exists (select 1 from ppt_resolutions x where x.poste_id = p.id)),
         count(*) filter (where p.statut in ('vote', 'realise'))
    into v_postes, v_travailles, v_votes
    from ppt_postes p
   where p.rapport_id = p_rapport_id;
  select count(*) into v_remarques from ppt_remarques where rapport_id = p_rapport_id;

  if v_r.statut = 'valide' then
    -- plan en vigueur = dernier rapport validé du même type (règle de ppt_valider_rapport)
    select id into v_courant from ppt_rapports
     where ppt_copro_id = v_r.ppt_copro_id and type = v_r.type and statut = 'valide'
     order by valide_le desc nulls last limit 1;
    if v_courant = p_rapport_id then
      select id into v_prev from ppt_rapports
       where ppt_copro_id = v_r.ppt_copro_id and type = v_r.type and statut = 'valide' and id <> p_rapport_id
       order by valide_le desc nulls last limit 1;
    end if;
  end if;

  -- ordre imposé par les clés étrangères en set null : remarques puis postes
  delete from ppt_remarques where rapport_id = p_rapport_id;
  delete from ppt_postes where rapport_id = p_rapport_id;

  -- version précédente remise en service, lignes retirées par le syndic exceptées
  if v_prev is not null then
    update ppt_postes set actif = true
     where ppt_copro_id = v_r.ppt_copro_id and rapport_id = v_prev and not actif and retire_le is null;
    get diagnostics v_restaures = row_count;
  end if;

  -- le journal garde la trace du document supprimé (rapport_id passe à null)
  perform ppt_journaliser(v_r.ppt_copro_id, p_rapport_id, 'suppression',
    jsonb_build_object('name', v_r.name, 'type', v_r.type, 'statut', v_r.statut, 'depose_le', v_r.depose_le,
                       'valide_le', v_r.valide_le, 'postes', v_postes, 'travailles', v_travailles, 'votes', v_votes,
                       'remarques', v_remarques, 'restaure', v_prev, 'restaures', v_restaures,
                       'motif', nullif(btrim(coalesce(p_motif, '')), '')));
  delete from ppt_rapports where id = p_rapport_id;
  return v_r.storage_path;
end;
$$;
revoke execute on function ppt_supprimer_rapport(uuid, text) from anon, public;
grant execute on function ppt_supprimer_rapport(uuid, text) to authenticated;
