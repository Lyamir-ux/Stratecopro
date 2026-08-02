-- 0009 — Espace Syndic (phase 2)
-- Rattachement : copro_members avec member_role 'syndic' (prévu au schéma V1).
-- Le gestionnaire de copropriété a un accès en LECTURE SEULE sur ses copros :
-- données de la copro, enquête sociale (SANS le RFR — donnée sensible réservée
-- à l'AMO et à l'intéressé), scénarios partagés, choix de financement des
-- copropriétaires, fichiers partagés. Aucune écriture côté syndic.

-- ========== Helper (security definer : évite la récursion RLS) ==========
create or replace function is_syndic_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from copro_members
    where user_id = auth.uid()
      and copro_id = p_copro_id
      and member_role = 'syndic'
  );
$$;
revoke execute on function is_syndic_of(uuid) from anon, public;

-- chaque utilisateur lit ses propres rattachements (liste de ses copros gérées)
create policy copro_members_own_read on copro_members
  for select to authenticated using (user_id = auth.uid());

-- ========== RLS : lecture du périmètre du syndic ==========
-- (policies additives : les accès AMO / copropriétaire restent inchangés)

create policy coproprietes_syndic_read on coproprietes
  for select to authenticated using (is_syndic_of(id));

create policy batiments_syndic_read on batiments
  for select to authenticated using (is_syndic_of(copro_id));

create policy cles_syndic_read on cles_repartition
  for select to authenticated using (is_syndic_of(copro_id));

create policy coproprietaires_syndic_read on coproprietaires
  for select to authenticated using (is_syndic_of(copro_id));

create policy lots_syndic_read on lots
  for select to authenticated using (is_syndic_of(copro_id));

create policy lot_tantiemes_syndic_read on lot_tantiemes
  for select to authenticated using (
    exists (select 1 from lots l where l.id = lot_id and is_syndic_of(l.copro_id))
  );

-- enquête : questionnaire et statut de campagne lisibles ; les réponses passent
-- par enquete_reponses_syndic() qui exclut le RFR (pas de policy sur la table)
create policy enquetes_syndic_read on enquetes
  for select to authenticated using (is_syndic_of(copro_id));

-- scénarios : uniquement ceux partagés par l'AMO
create policy scenarios_syndic_read on scenarios_financiers
  for select to authenticated
  using (statut = 'partage' and is_syndic_of(copro_id));

-- choix de financement des copropriétaires (fonds propres / collectif / individuel)
create policy choix_syndic_read on choix_financement
  for select to authenticated
  using (
    is_scenario_partage(scenario_id)
    and exists (
      select 1 from coproprietaires cp
      where cp.id = coproprietaire_id and is_syndic_of(cp.copro_id)
    )
  );

-- config du prêt collectif (banque, durée votée en AG)
create policy fin_config_syndic_read on copro_financement_config
  for select to authenticated using (is_syndic_of(copro_id));

-- fichiers projet : seulement ceux marqués partagés
create policy fichiers_syndic_read on fichiers
  for select to authenticated
  using (partage_copro and is_syndic_of(copro_id));

-- ========== Réponses d'enquête sans RFR ==========
-- Le syndic voit qui a répondu, la composition du foyer, l'occupation et le
-- profil MPR — jamais le revenu fiscal de référence ni les réponses libres.
create or replace function enquete_reponses_syndic(p_copro_id uuid)
returns table (
  coproprietaire_id uuid,
  nb_personnes int,
  statut_occupation text,
  profil_mpr text,
  updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select r.coproprietaire_id, r.nb_personnes, r.statut_occupation, r.profil_mpr, r.updated_at
  from enquete_reponses r
  join enquetes e on e.id = r.enquete_id
  where e.copro_id = p_copro_id
    and is_syndic_of(p_copro_id);
$$;
revoke execute on function enquete_reponses_syndic(uuid) from anon, public;

-- ========== Storage ==========
-- photo du dossier (hero du détail copro)
create policy storage_photos_syndic_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-photos'
    and exists (
      select 1 from public.coproprietes c
      where c.photo_path = name and is_syndic_of(c.id)
    )
  );

-- téléchargement des fichiers projet partagés
create policy storage_files_syndic_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'copro-files'
    and exists (
      select 1 from public.fichiers f
      where f.storage_path = name and f.partage_copro and is_syndic_of(f.copro_id)
    )
  );
