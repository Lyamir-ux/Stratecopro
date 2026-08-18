-- 0033 — Suivi financier du chantier (onglet syndic « Suivi financier »).
-- Reprend ligne à ligne le PF définitif validé (lots de travaux avec leur
-- entreprise, MOE et frais annexes) avec le montant voté ; le syndic saisit
-- les paiements par situation (1 à 10), le total payé et le restant se
-- déduisent. `paiements` : { "<ligne>": [s1, s2, … s10] } — clés
-- « lot:<numero> » / « moe:<index> », mêmes conventions que repartitionCles
-- (src/lib/finance/repartitionPf.ts).
create table suivi_financier (
  copro_id uuid primary key references coproprietes (id) on delete cascade,
  paiements jsonb not null default '{}',
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_suivi_financier_updated before update on suivi_financier
  for each row execute function set_updated_at();

alter table suivi_financier enable row level security;
create policy suivi_financier_amo_all on suivi_financier
  for all to authenticated using (is_amo()) with check (is_amo());
-- le syndic règle les situations des entreprises : comme pour le montage
-- bancaire, il lit ET saisit sur les copros de son portefeuille
create policy suivi_financier_syndic_read on suivi_financier
  for select to authenticated using (is_syndic_of(copro_id));
create policy suivi_financier_syndic_insert on suivi_financier
  for insert to authenticated with check (is_syndic_of(copro_id));
create policy suivi_financier_syndic_update on suivi_financier
  for update to authenticated
  using (is_syndic_of(copro_id)) with check (is_syndic_of(copro_id));
