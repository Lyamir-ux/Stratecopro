-- 0047 — Pilotage de l'espace syndic (préparation de la mise en production syndics) :
-- 1. Tâches du syndic persistées en base : cochables, avec échéance datée, au
--    lieu des repères recalculés côté client (lib/syndicTasks.ts). Le gabarit
--    (13 tâches par dossier) est semé par une fonction SECURITY DEFINER
--    idempotente - jamais par le client, pour qu'un bundle en retard ne puisse
--    pas recréer de doublons (on conflict do nothing sur (copro_id, cle)).
-- 2. Journal des rapports mensuels de portefeuille envoyés aux cabinets
--    (edge function rapport-syndic) : un envoi par enseigne et par mois.

-- ========== 1. Tâches du syndic ==========
create table syndic_taches (
  id uuid primary key default gen_random_uuid(),
  copro_id uuid not null references coproprietes (id) on delete cascade,
  -- clé du gabarit ('registre', 'ag-vote'…) : garantit l'idempotence du semis
  cle text not null,
  titre text not null,
  tag text,
  phase phase_copro not null,
  ordre int not null default 0,
  statut text not null default 'todo' check (statut in ('todo', 'done')),
  echeance date,
  fait_par uuid references profiles (user_id) on delete set null,
  fait_le timestamptz,
  updated_at timestamptz not null default now(),
  unique (copro_id, cle)
);
create index idx_syndic_taches_copro on syndic_taches (copro_id, phase, ordre);

alter table syndic_taches enable row level security;
create policy syndic_taches_amo_all on syndic_taches
  for all to authenticated using (is_amo()) with check (is_amo());
create policy syndic_taches_syndic_read on syndic_taches
  for select to authenticated using (is_syndic_of(copro_id));
create policy syndic_taches_syndic_update on syndic_taches
  for update to authenticated
  using (is_syndic_of(copro_id)) with check (is_syndic_of(copro_id));

-- Le syndic coche et planifie, mais ne réécrit pas le gabarit (titres, phases).
create or replace function protege_syndic_tache()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  modifiables text[] := array['statut', 'echeance', 'fait_par', 'fait_le', 'updated_at'];
begin
  if is_amo() then return new; end if;
  if to_jsonb(new) - modifiables <> to_jsonb(old) - modifiables then
    raise exception 'Seuls le statut et l''échéance sont modifiables par le syndic';
  end if;
  return new;
end;
$$;
create trigger trg_syndic_taches_protege before update on syndic_taches
  for each row execute function protege_syndic_tache();

-- Semis idempotent du gabarit. Les tâches des phases déjà passées sont semées
-- « faites » (le dossier a forcément franchi ces jalons) ; celles de la phase
-- courante et des suivantes restent à cocher.
create or replace function seed_syndic_taches(p_copro_ids uuid[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  rang int;
begin
  for c in
    select id, phase from coproprietes
    where id = any (p_copro_ids) and deleted_at is null
  loop
    if not (is_amo() or is_syndic_of(c.id)) then continue; end if;
    rang := case c.phase when 'diagnostic' then 0 when 'etudes' then 1 else 2 end;
    insert into syndic_taches (copro_id, cle, titre, tag, phase, ordre, statut)
    values
      (c.id, 'registre',       'Mise à jour du registre de copropriété',             null,    'diagnostic', 1, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'comptes-aides',  'Ouverture des comptes sur les plateformes d''aides', 'Aides', 'diagnostic', 2, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'odj-ag',         'Inscription du projet à l''ordre du jour de l''AG',  'AG',    'diagnostic', 3, case when rang > 0 then 'done' else 'todo' end),
      (c.id, 'ag-vote',        'Tenue de l''assemblée générale - vote des travaux',  'AG',    'etudes',     1, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'pv-ag',          'Dressage du PV d''assemblée générale',               null,    'etudes',     2, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'fiche-etat',     'Signature de la fiche État',                         null,    'etudes',     3, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'compte-travaux', 'Ouverture du compte bancaire travaux',               null,    'etudes',     4, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'assurance-do',   'Constitution de l''assurance dommages-ouvrage',      'DO',    'etudes',     5, case when rang > 1 then 'done' else 'todo' end),
      (c.id, 'dossiers-aides', 'Validation des dossiers d''aides',                   'Aides', 'travaux',    1, 'todo'),
      (c.id, 'suivi-chantier', 'Suivi du chantier',                                  null,    'travaux',    2, 'todo'),
      (c.id, 'acomptes',       'Validation des demandes d''acompte',                 null,    'travaux',    3, 'todo'),
      (c.id, 'solde-aides',    'Validation du solde & versement des aides',          'Aides', 'travaux',    4, 'todo'),
      (c.id, 'ag-quitus',      'Tenue de l''AG de clôture & quitus',                 'AG',    'travaux',    5, 'todo')
    on conflict (copro_id, cle) do nothing;
  end loop;
end;
$$;
revoke execute on function seed_syndic_taches(uuid[]) from anon;

-- ========== 2. Journal des rapports mensuels de portefeuille ==========
create table rapport_syndic_envois (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  periode text not null,   -- 'AAAA-MM'
  destinataires jsonb not null default '[]'::jsonb,
  envoyes int not null default 0,
  erreurs int not null default 0,
  created_at timestamptz not null default now(),
  unique (organisation_id, periode)
);
alter table rapport_syndic_envois enable row level security;
-- lecture AMO (panneau Paramètres) ; l'écriture est réservée à l'edge function
-- rapport-syndic (service role)
create policy rapport_envois_amo_read on rapport_syndic_envois
  for select to authenticated using (is_amo());
