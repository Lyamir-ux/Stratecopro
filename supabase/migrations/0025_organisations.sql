-- 0025 — Organisations (sociétés de gestion / cabinets de syndic)
-- Jusqu'ici un gestionnaire était rattaché copro par copro (copro_members, rôle
-- 'syndic'). Les cabinets ont une hiérarchie : la direction doit voir TOUT le
-- portefeuille de son enseigne, les gestionnaires seulement leurs immeubles.
-- On introduit donc l'organisation :
--   • directeur    → accès à toutes les copros rattachées à son organisation ;
--   • gestionnaire → accès à ses copros uniquement (copro_members, inchangé).
-- L'accès reste en LECTURE SEULE : on étend is_syndic_of(), toutes les policies
-- de l'espace syndic (0009) et la RPC enquête sans RFR suivent sans modification.

create type org_role as enum ('directeur', 'gestionnaire');

create table organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table organisation_membres (
  organisation_id uuid not null references organisations (id) on delete cascade,
  user_id uuid not null references profiles (user_id) on delete cascade,
  org_role org_role not null default 'gestionnaire',
  primary key (organisation_id, user_id)
);

alter table coproprietes
  add column organisation_id uuid references organisations (id) on delete set null,
  -- nombre de logements déclaré au portefeuille : connu bien avant l'import des
  -- lots (qui reste la source de vérité une fois le tableau importé)
  add column nb_logements int,
  -- chef de projet AMO en clair, même parti pris que gestionnaire_nom (0023) :
  -- la personne n'a pas forcément de compte sur le progiciel
  add column chef_projet text;

create index idx_copros_organisation on coproprietes (organisation_id);
create index idx_org_membres_user on organisation_membres (user_id);

-- ========== Helpers (security definer : évite la récursion RLS) ==========

/* Le directeur d'une organisation voit tout le portefeuille de son enseigne. */
create or replace function is_directeur_of(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from coproprietes c
    join organisation_membres m on m.organisation_id = c.organisation_id
    where c.id = p_copro_id
      and m.user_id = auth.uid()
      and m.org_role = 'directeur'
  );
$$;
revoke execute on function is_directeur_of(uuid) from anon, public;

/* Périmètre syndic = ses copros rattachées OU tout le portefeuille si directeur.
   Redéfinition de la fonction de 0009 : les policies existantes en héritent. */
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
  ) or is_directeur_of(p_copro_id);
$$;
revoke execute on function is_syndic_of(uuid) from anon, public;

-- ========== RLS ==========
alter table organisations enable row level security;
alter table organisation_membres enable row level security;

-- l'AMO gère les organisations et leurs membres
create policy organisations_amo_all on organisations
  for all to authenticated using (is_amo()) with check (is_amo());
create policy org_membres_amo_all on organisation_membres
  for all to authenticated using (is_amo()) with check (is_amo());

-- chaque membre lit son propre rattachement et l'enseigne correspondante
create policy org_membres_own_read on organisation_membres
  for select to authenticated using (user_id = auth.uid());
create policy organisations_membre_read on organisations
  for select to authenticated using (
    exists (
      select 1 from organisation_membres m
      where m.organisation_id = id and m.user_id = auth.uid()
    )
  );
