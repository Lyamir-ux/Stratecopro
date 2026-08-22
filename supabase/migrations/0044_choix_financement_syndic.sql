-- 0044 — Feedback du 22/08 (Amir) : le syndic peut enregistrer ou modifier le
-- mode de financement d'un copropriétaire depuis sa page Financement (il a
-- parfois l'information en direct, ex. paiement sur fonds propres).
-- Traçabilité ajoutée : saisi_par (copro / syndic / amo) + updated_by, pour
-- distinguer un choix transmis par le copropriétaire d'une saisie du
-- gestionnaire — affiché dans les trois espaces.

alter table choix_financement add column saisi_par text not null default 'copro'
  check (saisi_par in ('copro', 'syndic', 'amo'));
alter table choix_financement add column updated_by uuid references auth.users (id) on delete set null;

-- Le syndic écrit sur les copropriétaires de ses copros, tant que le scénario
-- est partagé (mêmes conditions que sa lecture, policy choix_syndic_read).
create policy choix_syndic_insert on choix_financement
  for insert to authenticated
  with check (
    is_scenario_partage(scenario_id)
    and exists (
      select 1 from coproprietaires cp
      where cp.id = coproprietaire_id and is_syndic_of(cp.copro_id)
    )
  );
create policy choix_syndic_update on choix_financement
  for update to authenticated
  using (
    is_scenario_partage(scenario_id)
    and exists (
      select 1 from coproprietaires cp
      where cp.id = coproprietaire_id and is_syndic_of(cp.copro_id)
    )
  )
  with check (
    is_scenario_partage(scenario_id)
    and exists (
      select 1 from coproprietaires cp
      where cp.id = coproprietaire_id and is_syndic_of(cp.copro_id)
    )
  );
