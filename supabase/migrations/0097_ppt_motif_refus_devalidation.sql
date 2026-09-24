-- 0097 - Suivi PPT : motif du refus de retour en vérification
--
-- Feedback Amir 24/09/2026 (12:24, revue de Porte du Soleil) : le refus de
-- retour en vérification s'affichait « Retour en vérification refusé - Retour
-- en vérification refusé ». Le motif donné par la base était masqué côté écran
-- (erreur Supabase non reconnue, corrigé par messageErreur) et, en plus, il
-- conseillait de « rejeter le rapport », ce que la base refuse sur un rapport
-- validé. Il renvoie désormais vers « Supprimer le JSON » (0096).

/* 0087 inchangée, seul le motif du refus change. */
create or replace function ppt_devalider_rapport(p_rapport_id uuid, p_motif text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r ppt_rapports%rowtype;
  v_travailles int;
  v_libelles text;
  v_postes int;
  v_remarques int;
  v_restaures int := 0;
begin
  if not is_dirigeant() then raise exception 'Retour en vérification réservé au dirigeant'; end if;
  select * into r from ppt_rapports where id = p_rapport_id;
  if r.id is null then raise exception 'Rapport introuvable'; end if;
  if r.statut <> 'valide' then raise exception 'Ce rapport n''est pas validé : rien à défaire'; end if;
  if not exists (select 1 from ppt_analyses where rapport_id = p_rapport_id) then
    raise exception 'Aucune analyse pour ce rapport : la revue ne peut pas reprendre, déposez une nouvelle version';
  end if;

  -- travail du syndic sur les postes issus de cette validation : vote, montant,
  -- commentaire, report de présentation, retrait ou résolution d'AG
  select count(*), string_agg(distinct p.libelle, ', ') into v_travailles, v_libelles
    from ppt_postes p
   where p.rapport_id = p_rapport_id
     and (p.statut <> 'programme'
          or p.montant_vote is not null
          or p.montant_syndic is not null
          or p.commentaire_syndic is not null
          or p.annee_prochaine_presentation is not null
          or p.retire_le is not null
          or exists (select 1 from ppt_resolutions x where x.poste_id = p.id));
  if v_travailles > 0 then
    raise exception 'Retour impossible : le cabinet a déjà travaillé % poste(s) de ce plan (%). Pour reprendre le plan, supprimez le JSON intégré (bouton « Supprimer le JSON ») : le PDF reste et vous importez une nouvelle analyse.',
      v_travailles, left(coalesce(v_libelles, ''), 160);
  end if;

  select count(*) into v_postes from ppt_postes where rapport_id = p_rapport_id;
  select count(*) into v_remarques from ppt_remarques where rapport_id = p_rapport_id;

  -- ordre imposé par les clés étrangères en set null : remarques puis postes
  delete from ppt_remarques where rapport_id = p_rapport_id;
  delete from ppt_postes where rapport_id = p_rapport_id;

  -- version précédente remise en service telle qu'elle était avant la validation,
  -- lignes retirées par le syndic exceptées
  if r.remplace_rapport_id is not null then
    update ppt_postes set actif = true
     where ppt_copro_id = r.ppt_copro_id and rapport_id = r.remplace_rapport_id and not actif and retire_le is null;
    get diagnostics v_restaures = row_count;
  end if;

  update ppt_rapports
     set statut = 'a_relire', valide_par = null, valide_le = null, remplace_rapport_id = null
   where id = p_rapport_id;

  perform ppt_journaliser(r.ppt_copro_id, p_rapport_id, 'devalidation',
    jsonb_build_object('postes', v_postes, 'remarques', v_remarques, 'restaures', v_restaures,
                       'remplacait', r.remplace_rapport_id,
                       'motif', nullif(btrim(coalesce(p_motif, '')), '')));
end;
$$;
revoke execute on function ppt_devalider_rapport(uuid, text) from anon, public;
grant execute on function ppt_devalider_rapport(uuid, text) to authenticated;
