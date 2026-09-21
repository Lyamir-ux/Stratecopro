-- 0084 - Suivi PPT : revenir au mode vérification après validation
--
-- La validation matérialise le JSON corrigé : elle crée les postes et les
-- remarques, archive les postes de la version précédente et ouvre le dossier au
-- syndic. Tant que personne n'a travaillé ces postes, le dirigeant doit pouvoir
-- rouvrir la revue - une relecture, une coquille vue trop tard - sans exiger un
-- nouveau dépôt.
--
-- Le retour défait exactement ce que la validation a fait : postes et remarques
-- de ce rapport supprimés, postes de la version précédente réactivés, rapport
-- remis « à relire » (donc invisible du syndic). L'analyse importée et le
-- journal des corrections restent : c'est la revue qui reprend là où elle
-- s'était arrêtée.
--
-- Deux effets ne sont volontairement pas défaits :
--   - les champs de la fiche copropriété complétés à la validation (adresse,
--     étiquette, DPE…) : ce sont des faits sur l'immeuble, pas des conséquences
--     du rapport, et on ne sait pas lesquels étaient vides ;
--   - le travail du syndic sur les postes. S'il a voté, chiffré ou commenté un
--     poste, le retour est refusé : il faudrait détruire son travail. Dans ce
--     cas, c'est un rejet ou une nouvelle version qui s'impose.

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
  -- commentaire, report de présentation ou résolution d'AG
  select count(*), string_agg(distinct p.libelle, ', ') into v_travailles, v_libelles
    from ppt_postes p
   where p.rapport_id = p_rapport_id
     and (p.statut <> 'programme'
          or p.montant_vote is not null
          or p.montant_syndic is not null
          or p.commentaire_syndic is not null
          or p.annee_prochaine_presentation is not null
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

  -- version précédente remise en service telle qu'elle était avant la validation
  if r.remplace_rapport_id is not null then
    update ppt_postes set actif = true
     where ppt_copro_id = r.ppt_copro_id and rapport_id = r.remplace_rapport_id and not actif;
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
