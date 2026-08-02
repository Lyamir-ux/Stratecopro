-- 0006 — Adhésion au prêt collectif éco-PTZ (CEGEE) depuis le portail copropriétaire.
-- Config AMO par copro (banque + durée votée en AG) ; adhésions avec formulaire,
-- IBAN/BIC (sensibles — RLS stricte), bulletins générés et signés, mandat SEPA.

create table copro_financement_config (
  copro_id uuid primary key references coproprietes (id) on delete cascade,
  banque text not null default 'CEGEE' check (banque in ('CEGEE', 'DOMOFINANCE')),
  duree_annees int not null default 15 check (duree_annees between 3 and 20),
  -- ouvre le parcours d'adhésion au prêt collectif sur le portail
  adhesion_ouverte boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger trg_fin_config_updated before update on copro_financement_config
  for each row execute function set_updated_at();

create table adhesions_pret (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  scenario_id uuid references scenarios_financiers (id) on delete set null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'signee')),
  -- formulaire d'adhésion : adhérents 1/2, adresse, téléphones, e-mail, montant…
  form jsonb not null default '{}',
  iban text,                                -- sensible : jamais exposé hors AMO / intéressé
  bic text,
  lieu_signature text,
  signed_at timestamptz,
  bulletins jsonb not null default '[]',    -- [{ lotNum, path }] PDF générés (Storage pieces-copro)
  sepa_path text,                           -- mandat SEPA pré-rempli (Storage)
  rib_concordance text check (rib_concordance in ('concordant', 'discordant', 'non_verifie')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (copro_id, coproprietaire_id)
);
create index idx_adhesions_copro on adhesions_pret (copro_id);
create trigger trg_adhesions_updated before update on adhesions_pret
  for each row execute function set_updated_at();

-- ========== RLS ==========
alter table copro_financement_config enable row level security;
create policy fin_config_amo_all on copro_financement_config
  for all to authenticated using (is_amo()) with check (is_amo());
create policy fin_config_copro_read on copro_financement_config
  for select to authenticated using (is_copro_of(copro_id));

alter table adhesions_pret enable row level security;
create policy adhesions_amo_all on adhesions_pret
  for all to authenticated using (is_amo()) with check (is_amo());
create policy adhesions_own_all on adhesions_pret
  for all to authenticated
  using (coproprietaire_id in (select my_coproprietaire_ids()))
  with check (
    coproprietaire_id in (select my_coproprietaire_ids())
    and is_copro_of(copro_id)
  );
