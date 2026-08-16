-- 0021 — Plan de financement définitif (nomenclature « chef de projet »)
-- Le classeur Excel de référence (onglets « PF définitif Eco PTZ collectif » /
-- « PF définitif Eco PTZ individuel » + un onglet par lot avec colonne
-- « Retenu » = assiette MaPrimeRénov') est importé puis éditable directement
-- dans le logiciel. La structure complète (infos, lots, MOE, aides, paramètres)
-- vit dans `data` (jsonb, types dans src/lib/finance/planDefinitif.ts) ; le
-- moteur pur recalcule les deux variantes de financement, `resultat` est un
-- instantané du dernier calcul pour l'affichage sans recalcul.
create table plans_definitifs (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  nom text not null default 'Plan de financement définitif',
  data jsonb not null default '{}',
  resultat jsonb,
  -- nom du fichier xlsx importé (traçabilité), null si créé dans le logiciel
  source_fichier text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'partage')),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_plans_definitifs_copro on plans_definitifs (copro_id);
create trigger trg_plans_definitifs_updated before update on plans_definitifs
  for each row execute function set_updated_at();

alter table plans_definitifs enable row level security;
create policy plans_definitifs_amo_all on plans_definitifs
  for all to authenticated using (is_amo()) with check (is_amo());
-- le syndic ne voit que les plans partagés de son portefeuille
create policy plans_definitifs_syndic_read on plans_definitifs
  for select to authenticated using (is_syndic_of(copro_id) and statut = 'partage');
