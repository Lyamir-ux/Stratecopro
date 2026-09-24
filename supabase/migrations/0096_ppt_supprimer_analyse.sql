-- 0096 - Suivi PPT : supprimer le JSON intégré, garder le PDF
--
-- Précision d'Amir (24/09/2026) sur le feedback de 08:49 : Strat Eco analyse un
-- PPPT, importe le JSON, valide ; le syndic retouche ensuite le plan, si bien
-- que le retour en vérification (0084 / 0087) est refusé. Amir veut « carrément
-- supprimer le JSON qui a été intégré » pour en remettre un autre - sans
-- supprimer le document ni le faire redéposer (0095 supprimait tout).
--
-- ppt_supprimer_analyse (dirigeant) :
--   • retire le plan issu du JSON : postes (retouchés, votés compris) et
--     remarques du rapport ; si c'était le plan en vigueur, la version validée
--     précédente du même type le redevient (comme 0095) ;
--   • supprime le JSON (ppt_analyses : sortie brute et version de travail) et le
--     journal des corrections de la revue, qui décrit ce JSON-là ;
--   • remet le rapport « déposé » : résumé du JSON effacé (verdict, scores,
--     auteur, nature), validation effacée. Le PDF, sa date, le taux d'honoraires
--     et le compteur de traitements (coût) restent ;
--   • restent aussi les lignes ajoutées par le syndic, les AG et leurs
--     résolutions, les champs de la fiche complétés à la validation ;
--   • journal « analyse_supprimee » : compteurs, verdict retiré, motif.
-- La revue repart de zéro : « Importer le JSON » réapparaît sur /ppt/rapports/:id.
--
-- Le retrait du plan est commun avec ppt_supprimer_rapport (0095), qui est
-- réécrite pour passer par le même assistant ppt_retirer_plan.

/* Retire le plan matérialisé d'un rapport (postes et remarques) et remet en
   vigueur la version validée précédente si ce rapport portait le plan courant.
   Interne : appelé par les RPC du dirigeant, jamais directement. */
create or replace function ppt_retirer_plan(p_rapport_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not found then raise exception 'Rapport introuvable'; end if;

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

  -- ordre imposé par les clés étrangères en set null : remarques puis postes ;
  -- suppression explicite : un poste orphelin passerait pour une ligne du syndic
  delete from ppt_remarques where rapport_id = p_rapport_id;
  delete from ppt_postes where rapport_id = p_rapport_id;

  -- version précédente remise en service, lignes retirées par le syndic exceptées
  if v_prev is not null then
    update ppt_postes set actif = true
     where ppt_copro_id = v_r.ppt_copro_id and rapport_id = v_prev and not actif and retire_le is null;
    get diagnostics v_restaures = row_count;
  end if;

  return jsonb_build_object('postes', v_postes, 'travailles', v_travailles, 'votes', v_votes,
                            'remarques', v_remarques, 'restaure', v_prev, 'restaures', v_restaures);
end;
$$;
revoke execute on function ppt_retirer_plan(uuid) from anon, authenticated, public;

/* Supprimer le JSON intégré d'un rapport : le PDF reste, la revue repart de zéro. */
create or replace function ppt_supprimer_analyse(p_rapport_id uuid, p_motif text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r ppt_rapports;
  v_detail jsonb;
  v_corrections int;
begin
  if not is_dirigeant() then raise exception 'Suppression du JSON réservée au dirigeant'; end if;
  select * into v_r from ppt_rapports where id = p_rapport_id;
  if not found then raise exception 'Rapport introuvable'; end if;
  if not exists (select 1 from ppt_analyses where rapport_id = p_rapport_id)
     and not exists (select 1 from ppt_postes where rapport_id = p_rapport_id) then
    raise exception 'Aucun JSON intégré pour ce rapport';
  end if;

  v_detail := ppt_retirer_plan(p_rapport_id);
  select count(*) into v_corrections from ppt_corrections where rapport_id = p_rapport_id;
  delete from ppt_corrections where rapport_id = p_rapport_id;
  delete from ppt_analyses where rapport_id = p_rapport_id;

  update ppt_rapports set
    statut = 'depose',
    schema_version = null,
    nature_detectee = null,
    prestataire = null,
    prestataire_type = null,
    verdict = null,
    score_conformite_pct = null,
    score_coherence_pct = null,
    valide_par = null,
    valide_le = null,
    remplace_rapport_id = null,
    motif_rejet = null
  where id = p_rapport_id;

  perform ppt_journaliser(v_r.ppt_copro_id, p_rapport_id, 'analyse_supprimee',
    v_detail || jsonb_build_object('name', v_r.name, 'statut', v_r.statut, 'verdict', v_r.verdict,
                                   'valide_le', v_r.valide_le, 'corrections', v_corrections,
                                   'motif', nullif(btrim(coalesce(p_motif, '')), '')));
end;
$$;
revoke execute on function ppt_supprimer_analyse(uuid, text) from anon, public;
grant execute on function ppt_supprimer_analyse(uuid, text) to authenticated;

/* 0095 réécrite sur l'assistant commun : même comportement. */
create or replace function ppt_supprimer_rapport(p_rapport_id uuid, p_motif text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_r ppt_rapports;
  v_detail jsonb;
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

  v_detail := ppt_retirer_plan(p_rapport_id);

  -- le journal garde la trace du document supprimé (rapport_id passe à null)
  perform ppt_journaliser(v_r.ppt_copro_id, p_rapport_id, 'suppression',
    v_detail || jsonb_build_object('name', v_r.name, 'type', v_r.type, 'statut', v_r.statut, 'depose_le', v_r.depose_le,
                                   'valide_le', v_r.valide_le, 'motif', nullif(btrim(coalesce(p_motif, '')), '')));
  delete from ppt_rapports where id = p_rapport_id;
  return v_r.storage_path;
end;
$$;
revoke execute on function ppt_supprimer_rapport(uuid, text) from anon, public;
grant execute on function ppt_supprimer_rapport(uuid, text) to authenticated;
