-- 0034 — Corbeille des projets.
-- L'AMO ne supprime plus un dossier d'un coup : il le met à la corbeille
-- (deleted_at), d'où il peut être restauré ou supprimé définitivement.
-- Un dossier à la corbeille disparaît immédiatement des espaces syndic,
-- copropriétaire et prestataire (policies ci-dessous) ; seule l'équipe AMO
-- le voit encore, dans la corbeille du tableau de bord.
alter table coproprietes add column deleted_at timestamptz;

drop policy coproprietes_syndic_read on coproprietes;
create policy coproprietes_syndic_read on coproprietes
  for select to authenticated using (is_syndic_of(id) and deleted_at is null);

drop policy coproprietes_copro_read on coproprietes;
create policy coproprietes_copro_read on coproprietes
  for select to authenticated using (is_copro_of(id) and deleted_at is null);

drop policy coproprietes_presta_read on coproprietes;
create policy coproprietes_presta_read on coproprietes
  for select to authenticated
  using ((copro_visible_presta(id) or is_moe_retenu_of(id)) and deleted_at is null);
