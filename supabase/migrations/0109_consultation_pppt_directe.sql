-- 0109 - Consultation PPPT + DPE collectif publiée directement par le syndic,
--        offres et analyse restituées sur sa fiche PPT
--
-- Idée d'Amir 27/09/2026 (18:13, page /syndic/ppt) : « la demande part
-- directement à des bureaux d'études référencés locaux, vous récupérerez les
-- documents directement sur la plateforme ainsi qu'une analyse des offres à
-- présenter en assemblée générale ». Choix d'Amir le même jour :
--   • le syndic ne voit les offres qu'avec l'analyse : pendant la
--     consultation, seulement « en cours, N offres reçues, date limite » ;
--   • l'analyse = comparatif des offres + avis de l'équipe (offre recommandée)
--     + PDF pour l'assemblée générale (généré côté client).
--
-- Chantier 1 : le « Oui » du syndic appelle ppt_demander_consultation_pppt :
-- la consultation (métier pppt_dpe, copropriété hors plateforme, date limite
-- à 3 semaines) est publiée tout de suite et la demande (demandes_amo, 0107)
-- la trace, à traiter par l'équipe jusqu'à la publication de l'analyse.
-- L'alerte des bureaux d'études (notifier-consultation) accepte désormais
-- l'auteur de la demande liée.
-- Chantier 2 : lecture de la consultation par ceux qui ouvrent le dossier PPT,
-- offres et pièces seulement une fois l'analyse publiée (ppt_publier_analyse).

-- ========== 1. Colonnes ==========

alter table consultations
  add column if not exists ppt_copro_id uuid references ppt_coproprietes (id) on delete set null,
  add column if not exists analyse_avis text,
  add column if not exists analyse_candidature_id uuid references candidatures (id) on delete set null,
  add column if not exists analyse_publiee_le timestamptz,
  add column if not exists analyse_publiee_par uuid references profiles (user_id) on delete set null;

comment on column consultations.ppt_copro_id is
  'Copropriété du suivi PPT pour laquelle le syndic a demandé la consultation PPPT + DPE collectif (0109).';
comment on column consultations.analyse_avis is
  'Avis de l''équipe Strat Eco sur les offres, restitué au syndic avec le comparatif (0109).';
comment on column consultations.analyse_candidature_id is
  'Offre recommandée par l''équipe dans son analyse (0109).';
comment on column consultations.analyse_publiee_le is
  'Publication de l''analyse au syndic : les offres et leurs pièces deviennent visibles sur sa fiche PPT (0109).';

create index if not exists idx_consultations_ppt_copro on consultations (ppt_copro_id) where ppt_copro_id is not null;

alter table demandes_amo
  add column if not exists consultation_id uuid references consultations (id) on delete set null;

comment on column demandes_amo.consultation_id is
  'Consultation publiée pour cette demande (consultation PPPT + DPE collectif publiée directement, 0109).';

-- ========== 2. Visibilité côté syndic ==========

/* Offres d'une consultation visibles du syndic : consultation PPT dont l'analyse est publiée et dossier qu'il ouvre. */
create or replace function ppt_offres_visibles(p_consultation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from consultations c
    where c.id = p_consultation
      and c.ppt_copro_id is not null
      and c.analyse_publiee_le is not null
      and ppt_ouvre(c.ppt_copro_id)
  );
$$;
revoke execute on function ppt_offres_visibles(uuid) from anon, public;
grant execute on function ppt_offres_visibles(uuid) to authenticated;

/* Pièce d'une offre (bucket offres-presta) lisible du syndic : offre non retirée d'une consultation visible. */
create or replace function ppt_offre_fichier_visible(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from candidatures ca
    where ca.fichier_path = p_path
      and ca.retrait_at is null
      and ppt_offres_visibles(ca.consultation_id)
  );
$$;
revoke execute on function ppt_offre_fichier_visible(text) from anon, public;
grant execute on function ppt_offre_fichier_visible(text) to authenticated;

drop policy if exists consultations_ppt_read on consultations;
create policy consultations_ppt_read on consultations
  for select to authenticated
  using (ppt_copro_id is not null and ppt_ouvre(ppt_copro_id));

drop policy if exists candidatures_ppt_read on candidatures;
create policy candidatures_ppt_read on candidatures
  for select to authenticated
  using (retrait_at is null and ppt_offres_visibles(consultation_id));

drop policy if exists storage_offres_ppt_read on storage.objects;
create policy storage_offres_ppt_read on storage.objects
  for select to authenticated
  using (bucket_id = 'offres-presta' and ppt_offre_fichier_visible(name));

-- ========== 3. Chantier 1 : demande = consultation publiée ==========

create or replace function ppt_demander_consultation_pppt(p_ppt_copro uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c ppt_coproprietes;
  v_nom text;
  v_email text;
  v_enseigne text;
  v_lots int;
  v_ville text;
  v_chauffage text;
  v_precisions text;
  v_mission text;
  v_limite date := current_date + 21;
  v_consult uuid;
  v_demande uuid;
begin
  if v_uid is null then raise exception 'Authentification requise'; end if;
  if is_amo() then raise exception 'La demande se fait depuis le compte du syndic'; end if;

  select * into c from ppt_coproprietes where id = p_ppt_copro and deleted_at is null;
  if c.id is null then raise exception 'Copropriété introuvable'; end if;
  if not ppt_ouvre(c.id) then raise exception 'Vous n''avez pas accès à cette copropriété'; end if;

  -- une consultation à la fois : une demande classée sans suite peut être refaite
  if exists (
    select 1 from demandes_amo d
    where d.objet = 'consultation_pppt_dpe' and d.ppt_copro_id = c.id and d.statut <> 'classee'
  ) then
    raise exception 'Une consultation PPPT + DPE collectif est déjà en cours pour cette copropriété';
  end if;

  select p.full_name, lower(u.email) into v_nom, v_email
    from profiles p join auth.users u on u.id = p.user_id
   where p.user_id = v_uid;
  select nom into v_enseigne from organisations where id = c.organisation_id;

  v_lots := coalesce(c.nb_lots, c.nb_logements);
  v_ville := nullif(btrim(concat_ws(' ', c.code_postal, c.commune)), '');
  v_chauffage := nullif(btrim(concat_ws(' ', c.chauffage, c.energie_chauffage)), '');
  v_precisions := concat_ws(', ',
    case when v_lots is not null then v_lots || ' lots' end,
    case when c.nb_batiments > 1 then c.nb_batiments || ' bâtiments' end,
    case when c.annee_construction is not null then 'construction ' || c.annee_construction end,
    case when v_chauffage is not null then 'chauffage ' || lower(v_chauffage) end);
  v_mission := 'Réalisation du projet de plan pluriannuel de travaux (PPPT, article 14-2 de la loi du 10 juillet 1965) '
    || 'et du diagnostic de performance énergétique (DPE) collectif de la copropriété'
    || case when v_precisions <> '' then ' (' || v_precisions || ')' else '' end
    || '. Visite des parties communes et d''un échantillon de logements, rapports remis au syndic pour présentation en assemblée générale.';

  insert into consultations
    (type, mission, date_limite, statut, copro_externe_nom, copro_externe_adresse, copro_externe_ville,
     copro_externe_lots, nb_logements, nb_batiments, ppt_copro_id)
  values
    ('pppt_dpe', v_mission, v_limite, 'en_ligne', c.nom, nullif(btrim(c.adresse), ''), v_ville,
     v_lots, c.nb_logements, c.nb_batiments, c.id)
  returning id into v_consult;

  insert into demandes_amo
    (objet, ppt_copro_id, consultation_id, copro_nom, adresse, nb_lots, chauffage,
     demandeur_user_id, demandeur_nom, demandeur_email, organisation_id, syndic_name)
  values
    ('consultation_pppt_dpe', c.id, v_consult, c.nom, concat_ws(', ', nullif(btrim(c.adresse), ''), v_ville), v_lots,
     case when v_chauffage is not null then upper(left(v_chauffage, 1)) || substr(v_chauffage, 2) end,
     v_uid, coalesce(v_nom, ''), v_email, c.organisation_id, v_enseigne)
  returning id into v_demande;

  perform ppt_journaliser(c.id, null, 'consultation_pppt',
    jsonb_build_object('consultation_id', v_consult, 'demande_id', v_demande, 'date_limite', v_limite));

  return jsonb_build_object('demande_id', v_demande, 'consultation_id', v_consult, 'date_limite', v_limite);
end;
$$;
revoke execute on function ppt_demander_consultation_pppt(uuid) from anon, public;
grant execute on function ppt_demander_consultation_pppt(uuid) to authenticated;

/* Suivi des consultations d'un dossier PPT pour le syndic : compteurs sans exposer les offres avant l'analyse. */
create or replace function ppt_consultations_suivi(p_ppt_copro uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'consultation_id', c.id,
      'statut', c.statut,
      'published_at', c.published_at,
      'date_limite', c.date_limite,
      'analyse_publiee_le', c.analyse_publiee_le,
      'bureaux_consultes', (select count(*) from consultation_notifications n where n.consultation_id = c.id and n.statut <> 'erreur'),
      'offres_recues', (select count(*) from candidatures ca where ca.consultation_id = c.id and ca.retrait_at is null)
    ) order by c.published_at desc), '[]'::jsonb)
  from consultations c
  where c.ppt_copro_id = p_ppt_copro and ppt_ouvre(p_ppt_copro);
$$;
revoke execute on function ppt_consultations_suivi(uuid) from anon, public;
grant execute on function ppt_consultations_suivi(uuid) to authenticated;

-- ========== 4. Chantier 2 : publication de l'analyse (équipe AMO) ==========

create or replace function ppt_publier_analyse(p_consultation uuid, p_avis text, p_candidature uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c consultations;
begin
  if not is_amo() then raise exception 'Réservé à l''équipe Strat Eco'; end if;
  select * into c from consultations where id = p_consultation;
  if c.id is null then raise exception 'Consultation introuvable'; end if;
  if c.ppt_copro_id is null then raise exception 'Cette consultation n''est pas rattachée à un suivi PPT'; end if;
  if nullif(btrim(coalesce(p_avis, '')), '') is null then raise exception 'L''avis de l''équipe est obligatoire'; end if;
  if not exists (select 1 from candidatures ca where ca.consultation_id = c.id and ca.retrait_at is null) then
    raise exception 'Aucune offre à analyser';
  end if;
  if p_candidature is not null and not exists (
    select 1 from candidatures ca where ca.id = p_candidature and ca.consultation_id = c.id and ca.retrait_at is null
  ) then
    raise exception 'L''offre recommandée n''appartient pas à cette consultation';
  end if;

  -- publier l'analyse clôt la consultation : plus d'offre après la restitution au syndic
  update consultations set
    analyse_avis = btrim(p_avis),
    analyse_candidature_id = p_candidature,
    analyse_publiee_le = now(),
    analyse_publiee_par = auth.uid(),
    statut = 'cloturee'
  where id = c.id;

  update demandes_amo set
    statut = 'traitee',
    traite_par = auth.uid(),
    traite_le = now(),
    commentaire_amo = coalesce(commentaire_amo, 'Analyse des offres publiée le ' || to_char(now(), 'DD/MM/YYYY') || '.')
  where consultation_id = c.id and statut = 'nouvelle';

  perform ppt_journaliser(c.ppt_copro_id, null, 'analyse_offres_publiee',
    jsonb_build_object('consultation_id', c.id, 'offre_recommandee', p_candidature));
end;
$$;
revoke execute on function ppt_publier_analyse(uuid, text, uuid) from anon, public;
grant execute on function ppt_publier_analyse(uuid, text, uuid) to authenticated;

/* Retrait de la publication (erreur, offre à ajouter) : les offres redeviennent invisibles du syndic, la demande repasse à traiter. */
create or replace function ppt_retirer_analyse(p_consultation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c consultations;
begin
  if not is_amo() then raise exception 'Réservé à l''équipe Strat Eco'; end if;
  select * into c from consultations where id = p_consultation;
  if c.id is null or c.ppt_copro_id is null then raise exception 'Consultation introuvable'; end if;
  update consultations set analyse_publiee_le = null, analyse_publiee_par = null where id = c.id;
  update demandes_amo set statut = 'nouvelle', traite_par = null, traite_le = null,
    commentaire_amo = case when commentaire_amo like 'Analyse des offres publiée le %' then null else commentaire_amo end
   where consultation_id = c.id and statut = 'traitee';
  perform ppt_journaliser(c.ppt_copro_id, null, 'analyse_offres_retiree', jsonb_build_object('consultation_id', c.id));
end;
$$;
revoke execute on function ppt_retirer_analyse(uuid) from anon, public;
grant execute on function ppt_retirer_analyse(uuid) to authenticated;
