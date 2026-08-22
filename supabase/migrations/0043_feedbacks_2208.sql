-- 0043 — Feedbacks du 22/08 :
-- 1. Fiche entreprise : site internet, code postal, SIRET/SIREN renseignables
--    par le prestataire ; date de fin de validité sur les documents de
--    certification (agrément RGE, assurance…) avec rappel automatique par
--    e-mail avant échéance (edge function `rappel-agrements`).
--    L'AMO obtient le CRUD complet sur prestataire_docs : un dépôt fait en
--    aperçu AMO était jusqu'ici perdu (fichier dans le bucket, ligne refusée).
-- 2. Retrait de candidature tracé (corbeille) : plus de suppression dure —
--    le prestataire motive son retrait, la candidature reste visible (barrée)
--    des deux côtés, et il peut re-candidater tant que la consultation est
--    en ligne (l'unicité ne porte que sur les candidatures actives).
-- 3. Accusé de lecture des décisions (decision_vue_at) : pastille « vous avez
--    été sélectionné / refusé » dans le menu prestataire.
-- 4. Documents de projet : le prestataire retenu dépose devis, plannings…
--    sur ses opérations ; l'équipe AMO les retrouve dans l'onglet
--    Prestataires du dossier.

-- ========== 1. Fiche entreprise ==========
alter table prestataires add column site_web text;
alter table prestataires add column code_postal text;

-- le prestataire renseigne aussi son site, son code postal et son SIRET/SIREN ;
-- métiers, référencement et raison sociale restent pilotés par l'AMO
create or replace function protege_prestataire_own()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array[
    'email', 'email_secondaire', 'telephone', 'adresse', 'ville',
    'code_postal', 'site_web', 'siret',
    'logo_path', 'contact_nom', 'updated_at'
  ];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Champs réservés à l''équipe AMO (métiers, référencement, raison sociale…)';
  end if;
  return new;
end;
$$;

-- fin de validité d'un document (agrément RGE, assurance décennale…) ;
-- rappel_envoye_at évite de renvoyer le même rappel (remis à zéro quand la
-- date est mise à jour)
alter table prestataire_docs add column expire_le date;
alter table prestataire_docs add column rappel_envoye_at timestamptz;

-- l'AMO gère aussi les lignes de prestataire_docs (le storage l'autorisait
-- déjà depuis 0036, mais l'insert de la ligne était refusé : document perdu)
drop policy presta_docs_amo_read on prestataire_docs;
create policy presta_docs_amo_all on prestataire_docs
  for all to authenticated using (is_amo()) with check (is_amo());

-- ========== 2 & 3. Candidatures : retrait tracé + accusé de décision ==========
alter table candidatures add column retrait_at timestamptz;
alter table candidatures add column retrait_motif text;
alter table candidatures add column decision_vue_at timestamptz;

-- re-candidature possible après retrait : l'unicité ne compte que les actives
drop index uq_candidature_prestataire;
create unique index uq_candidature_prestataire
  on candidatures (consultation_id, prestataire_id)
  where prestataire_id is not null and retrait_at is null;

-- le retrait devient un UPDATE tracé — plus de suppression dure
drop policy candidatures_presta_delete on candidatures;
drop policy candidatures_presta_update on candidatures;
create policy candidatures_presta_update on candidatures
  for update to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (prestataire_id = my_prestataire_id());

-- le trigger borne ce que le prestataire peut toucher :
-- engagement (si retenue), accusé de décision, retrait motivé (si à l'étude
-- sur une consultation encore en ligne) — et rien d'autre
create or replace function protege_candidature_presta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array['engagement_at', 'decision_vue_at', 'retrait_at', 'retrait_motif'];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Seuls l''engagement, l''accusé de décision et le retrait sont modifiables par le prestataire';
  end if;
  if new.engagement_at is distinct from old.engagement_at and old.statut <> 'retenue' then
    raise exception 'L''engagement ne se confirme que sur une candidature retenue';
  end if;
  if new.retrait_at is distinct from old.retrait_at then
    if old.retrait_at is not null then
      raise exception 'Cette candidature est déjà retirée';
    end if;
    if new.retrait_at is null then
      raise exception 'Le retrait d''une candidature est définitif';
    end if;
    if old.statut <> 'recue' then
      raise exception 'Une offre déjà tranchée ne peut plus être retirée — contactez l''équipe Strat Eco';
    end if;
    if not exists (select 1 from consultations c where c.id = new.consultation_id and c.statut = 'en_ligne') then
      raise exception 'La consultation n''est plus en ligne — le retrait n''est plus possible';
    end if;
  elsif new.retrait_motif is distinct from old.retrait_motif then
    raise exception 'Le motif de retrait accompagne le retrait';
  end if;
  return new;
end;
$$;

-- ========== 4. Documents de projet du prestataire ==========
-- Fichiers déposés par une entreprise retenue sur une de ses opérations
-- (devis, plannings, PV…) — bucket presta-docs (dossier du compte), lignes
-- visibles de l'entreprise et de l'équipe AMO.
create table projet_docs (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  path text not null,   -- bucket presta-docs, dossier = uid du compte
  name text not null,
  size bigint,
  uploaded_at timestamptz not null default now()
);
create index idx_projet_docs_copro on projet_docs (copro_id);
create index idx_projet_docs_presta on projet_docs (prestataire_id);
alter table projet_docs enable row level security;
create policy projet_docs_amo_all on projet_docs
  for all to authenticated using (is_amo()) with check (is_amo());
create policy projet_docs_presta_all on projet_docs
  for all to authenticated
  using (prestataire_id = my_prestataire_id())
  with check (prestataire_id = my_prestataire_id() and is_presta_retenu_of(copro_id));
