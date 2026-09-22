-- 0087 - Suivi PPT : retrait d'une ligne par le syndic, motivé et réversible
--
-- Feedback Amir 22/09/2026 (10:28) : le syndic doit pouvoir retirer une ligne
-- de l'échéancier en cliquant sur son montant, en justifiant systématiquement
-- la raison, et retrouver les lignes retirées dans un tableau dédié (bouton
-- « Lignes retirées » à côté de « Ajouter une ligne »).
--
-- Jusqu'ici seule une ligne ajoutée par le syndic pouvait être retirée, sans
-- motif (0074). Désormais :
--   • toute ligne vivante (ni votée ni réalisée) se retire, qu'elle vienne du
--     rapport ou du syndic ; le motif est obligatoire ;
--   • le retrait est un archivage (actif = false) daté, signé et motivé :
--     motif_retrait / retire_le / retire_par. Ces colonnes distinguent une
--     ligne retirée par le syndic d'un poste archivé par une nouvelle version
--     du rapport (actif = false sans retire_le) ;
--   • une ligne retirée se rétablit (ppt_retablir_poste), sauf si elle
--     appartient à une version du rapport remplacée depuis ;
--   • le retour en vérification (0084) ne réactive plus une ligne retirée par
--     le syndic : sa décision est conservée.

alter table ppt_postes
  add column if not exists motif_retrait text,
  add column if not exists retire_le timestamptz,
  add column if not exists retire_par uuid references profiles (user_id) on delete set null;

-- la signature change (motif obligatoire) : l'ancienne surcharge disparaît
drop function if exists ppt_retirer_poste(uuid);

/* Retrait d'une ligne par le syndic : motif obligatoire, archivage daté et signé. */
create or replace function ppt_retirer_poste(p_poste_id uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p ppt_postes%rowtype;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  select * into p from ppt_postes where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
  if not ppt_ouvre(p.ppt_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if not p.actif then raise exception 'Ligne déjà retirée ou archivée : « % »', p.libelle; end if;
  if p.statut in ('vote', 'realise') then raise exception 'Ligne déjà votée ou réalisée : elle ne peut pas être retirée'; end if;
  if v_motif is null then raise exception 'Le motif du retrait est obligatoire'; end if;
  update ppt_postes
     set actif = false, motif_retrait = v_motif, retire_le = now(), retire_par = auth.uid()
   where id = p.id;
  perform ppt_journaliser(p.ppt_copro_id, null, 'poste_retire',
    jsonb_build_object('poste_id', p.id, 'libelle', p.libelle, 'origine', p.origine,
                       'annee', coalesce(p.annee_prochaine_presentation, p.annee_prevue), 'motif', v_motif));
end;
$$;
revoke execute on function ppt_retirer_poste(uuid, text) from anon, public;
grant execute on function ppt_retirer_poste(uuid, text) to authenticated;

/* Rétablissement d'une ligne retirée par le syndic. */
create or replace function ppt_retablir_poste(p_poste_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p ppt_postes%rowtype;
begin
  select * into p from ppt_postes where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
  if not ppt_ouvre(p.ppt_copro_id) then raise exception 'Accès refusé à cette copropriété'; end if;
  if p.actif or p.retire_le is null then raise exception 'Cette ligne n''a pas été retirée par le syndic'; end if;
  -- une ligne d'une version du rapport remplacée depuis ne revient pas dans le plan courant
  if p.rapport_id is not null and exists (
       select 1 from ppt_rapports r2 where r2.remplace_rapport_id = p.rapport_id and r2.statut = 'valide') then
    raise exception 'Cette ligne appartient à une version du rapport remplacée depuis : elle ne peut pas être rétablie';
  end if;
  update ppt_postes set actif = true, motif_retrait = null, retire_le = null, retire_par = null where id = p.id;
  perform ppt_journaliser(p.ppt_copro_id, null, 'poste_retabli',
    jsonb_build_object('poste_id', p.id, 'libelle', p.libelle, 'motif_retrait', p.motif_retrait));
end;
$$;
revoke execute on function ppt_retablir_poste(uuid) from anon, public;
grant execute on function ppt_retablir_poste(uuid) to authenticated;

/* 0084 revu : le retour en vérification ne réactive pas une ligne retirée par le syndic. */
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
    raise exception 'Retour impossible : le syndic a déjà travaillé % poste(s) de ce plan (%). Rejetez le rapport ou faites déposer une nouvelle version.',
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
