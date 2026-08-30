-- 0053 - Acceptation des CGU AVANT tout dépôt de pièce justificative, hors
-- parcours d'adhésion (enquête sociale : avis d'imposition notamment). Les CGU
-- v1.6 régissent le dépôt de pièces en général, pas seulement la signature -
-- l'acceptation est personnelle, versionnée et tracée (une ligne par version
-- et par contexte). Dans le parcours d'adhésion, l'acceptation reste portée
-- par signataires.cgu_acceptees_le.
create table cgu_acceptations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coproprietaire_id uuid references coproprietaires (id) on delete set null,
  cgu_version text not null,
  contexte text not null default 'depot_pieces' check (contexte in ('depot_pieces')),
  -- case « j'ai été informé que mon avis d'imposition est transmis intégralement »
  info_avis_imposition boolean not null default false,
  accepte_le timestamptz not null default now(),
  unique (user_id, cgu_version, contexte)
);

alter table cgu_acceptations enable row level security;
create policy cgu_acceptations_own_select on cgu_acceptations
  for select to authenticated using (user_id = auth.uid() or is_amo());
create policy cgu_acceptations_own_insert on cgu_acceptations
  for insert to authenticated with check (user_id = auth.uid());
-- trace de consentement : jamais modifiée ni supprimée par le client
revoke update, delete on cgu_acceptations from anon, authenticated;
