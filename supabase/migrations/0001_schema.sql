-- Strat Eco Pro — schéma V1 (espace AMO, rôles syndic/moe/copro anticipés)

-- ========== Enums ==========
create type app_role as enum ('amo', 'syndic', 'moe', 'copro');
create type phase_copro as enum ('diagnostic', 'etudes', 'travaux');
create type member_role as enum ('amo_referent', 'syndic', 'moe', 'coproprietaire');
create type usage_lot as enum ('habitation', 'garage', 'caves', 'autres');
create type statut_tache as enum ('todo', 'doing', 'done');
create type statut_scenario as enum ('brouillon', 'partage', 'importe');
create type statut_enquete as enum ('brouillon', 'prete', 'envoyee');
create type statut_consultation as enum ('en_ligne', 'cloturee');
create type type_consultation as enum ('moe', 'diag', 'ct', 'sps', 'autre');
create type statut_candidature as enum ('recue', 'retenue', 'non_retenue');

-- ========== Identité & accès ==========
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  initials text not null,
  role app_role not null default 'amo',
  job_title text,
  avatar_color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========== Cœur métier ==========
create table coproprietes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  city text,
  quartier text,
  adresse text,
  phase phase_copro not null default 'diagnostic',
  fragile boolean not null default false,
  energy_before char(1) check (energy_before in ('A','B','C','D','E','F','G')),
  energy_after char(1) check (energy_after in ('A','B','C','D','E','F','G')),
  gain_pct numeric,
  progress int not null default 0 check (progress between 0 and 100),
  syndic_name text,
  photo_path text,
  tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table copro_members (
  copro_id uuid not null references coproprietes (id) on delete cascade,
  user_id uuid not null references profiles (user_id) on delete cascade,
  member_role member_role not null default 'amo_referent',
  primary key (copro_id, user_id)
);

create table batiments (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  code text not null,
  label text,
  position int not null default 0,
  unique (copro_id, code)
);

create table coproprietaires (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  nom text not null,
  email text,
  type text check (type in ('occupant', 'bailleur')),
  user_id uuid references profiles (user_id) on delete set null, -- portail copropriétaire (phase 2)
  created_at timestamptz not null default now()
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  batiment_id uuid references batiments (id) on delete set null,
  coproprietaire_id uuid references coproprietaires (id) on delete set null,
  num text not null,
  usage usage_lot not null default 'habitation',
  created_at timestamptz not null default now(),
  unique (copro_id, num)
);

create table cles_repartition (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  code text not null,       -- 'MUN', 'ESC-A', 'BAT-B'…
  label text,
  is_default boolean not null default false,
  unique (copro_id, code)
);

create table lot_tantiemes (
  lot_id uuid not null references lots (id) on delete cascade,
  cle_id uuid not null references cles_repartition (id) on delete cascade,
  tantiemes numeric not null check (tantiemes >= 0), -- en millièmes (‰)
  primary key (lot_id, cle_id)
);

-- ========== Projet & tâches ==========
create table taches (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  phase phase_copro not null,
  title text not null,
  status statut_tache not null default 'todo',
  assignee_user_id uuid references profiles (user_id) on delete set null,
  due_date date,
  due_label text,            -- libellés libres du prototype (« En cours », « Sem. 24 »)
  tag text,                  -- DPE | MPR | CEE | Finance | Éco-PTZ…
  jalon text,                -- jalons de facturation P1a…P2c
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ========== Financier ==========
create table baremes (
  id uuid primary key default gen_random_uuid(),
  millesime int not null,
  zone text not null check (zone in ('hors_idf', 'idf')),
  params jsonb not null,     -- objet Bareme complet (src/lib/finance/types.ts)
  actif boolean not null default false,
  created_at timestamptz not null default now(),
  unique (millesime, zone)
);

create table scenarios_financiers (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  name text not null,
  statut statut_scenario not null default 'brouillon',
  locked boolean not null default false,  -- scénario importé : lecture seule, dupliquer pour éditer
  bareme_millesime int,
  params jsonb not null,                  -- FinanceParams
  resultat jsonb,                         -- snapshot FinanceResult figé à la validation
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plans_individuels (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios_financiers (id) on delete cascade,
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  tantiemes numeric not null default 0,
  quote_part numeric not null default 0,
  mpr_indiv numeric not null default 0,
  cee_part numeric not null default 0,
  subv_coll_part numeric not null default 0,
  eco_ptz_part numeric not null default 0,
  avance_part numeric not null default 0,
  reste numeric not null default 0,
  mensualite numeric not null default 0,
  detail jsonb,              -- décomposition par lot (colonnes étendues)
  unique (scenario_id, coproprietaire_id)
);

-- ========== Enquête sociale (données sensibles — RLS stricte) ==========
create table enquetes (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  questions jsonb not null default '[]',
  statut statut_enquete not null default 'brouillon',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table enquete_reponses (
  id uuid primary key default gen_random_uuid(),
  enquete_id uuid not null references enquetes (id) on delete cascade,
  coproprietaire_id uuid not null references coproprietaires (id) on delete cascade,
  nb_personnes int,
  statut_occupation text,
  rfr numeric,               -- revenu fiscal de référence : ne jamais exposer hors AMO / intéressé
  reponses jsonb,
  profil_mpr text check (profil_mpr in ('Bleu', 'Jaune', 'Violet', 'Rose')),
  updated_at timestamptz not null default now(),
  unique (enquete_id, coproprietaire_id)
);

-- ========== Fichiers, checklists, notes ==========
create table fichiers (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  dossier text not null default 'Général',
  name text not null,
  storage_path text not null,
  size bigint,
  mime text,
  uploaded_by uuid references profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  dispositif text not null,  -- cee_avant | cee_apres | mpr_copro_2024 | eco_ptz_2024
  label text not null,
  unique (copro_id, dispositif)
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists (id) on delete cascade,
  label text not null,
  done boolean not null default false,
  fichier_id uuid references fichiers (id) on delete set null,
  position int not null default 0
);

create table notes_projet (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  author_user_id uuid references profiles (user_id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ========== Consultations (marketplace) ==========
create table consultations (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  type type_consultation not null,
  mission text not null,
  date_limite date,
  budget numeric,
  statut statut_consultation not null default 'en_ligne',
  published_at timestamptz not null default now()
);

create table candidatures (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations (id) on delete cascade,
  org_name text not null,
  received_at timestamptz not null default now(),
  statut statut_candidature not null default 'recue'
);

-- ========== updated_at automatique ==========
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_coproprietes_updated before update on coproprietes
  for each row execute function set_updated_at();
create trigger trg_scenarios_updated before update on scenarios_financiers
  for each row execute function set_updated_at();
create trigger trg_reponses_updated before update on enquete_reponses
  for each row execute function set_updated_at();

-- ========== Vue de synthèse (source unique des compteurs du dashboard) ==========
create view copro_stats with (security_invoker = true) as
select
  c.id,
  (select count(*) from lots l where l.copro_id = c.id)::int as lots,
  (select count(*) from lots l where l.copro_id = c.id and l.usage = 'habitation')::int as lots_hab,
  (select count(*) from coproprietaires cp where cp.copro_id = c.id)::int as coproprietaires,
  (select count(*) from batiments b where b.copro_id = c.id)::int as batiments,
  s.name as scenario,
  (s.resultat ->> 'coutTotal')::numeric as montant_ttc,
  (s.resultat ->> 'resteACharge')::numeric as reste_a_charge,
  (s.resultat ->> 'tauxAides')::numeric as taux_aides,
  (select t.title from taches t
     where t.copro_id = c.id and t.status <> 'done' and t.phase = c.phase
     order by t.position limit 1) as next_task
from coproprietes c
left join lateral (
  select name, resultat from scenarios_financiers sf
  where sf.copro_id = c.id and sf.statut = 'partage'
  order by sf.updated_at desc limit 1
) s on true;

-- ========== Index ==========
create index idx_lots_copro on lots (copro_id);
create index idx_coproprietaires_copro on coproprietaires (copro_id);
create index idx_taches_copro_phase on taches (copro_id, phase);
create index idx_scenarios_copro on scenarios_financiers (copro_id);
create index idx_plans_scenario on plans_individuels (scenario_id);
create index idx_reponses_enquete on enquete_reponses (enquete_id);
create index idx_fichiers_copro on fichiers (copro_id);
create index idx_notes_copro on notes_projet (copro_id);
