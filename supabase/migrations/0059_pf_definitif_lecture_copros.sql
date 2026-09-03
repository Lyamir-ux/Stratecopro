-- 0059 - Le plan de financement global du portail copropriétaire détaille les
-- lots de travaux (entreprises), les honoraires et chaque aide (feedback Amir
-- 03/09/2026). Ce détail vit dans le PF définitif validé : un copropriétaire
-- peut lire celui de sa copropriété dès qu'il est partagé, c'est-à-dire relié
-- à un scénario financier « pont » au statut partage (0031). Le PF ne contient
-- aucune donnée nominative (lots de devis, MOE, aides, exemples par tantièmes).

drop policy if exists plans_definitifs_copro_read on plans_definitifs;
create policy plans_definitifs_copro_read on plans_definitifs
  for select to authenticated
  using (
    is_copro_of(copro_id)
    and statut = 'valide'
    and exists (
      select 1 from scenarios_financiers s
      where s.plan_definitif_id = plans_definitifs.id and s.statut = 'partage'
    )
  );
