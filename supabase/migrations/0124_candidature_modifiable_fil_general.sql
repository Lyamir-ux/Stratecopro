-- 0124 - Retours de l'espace prestataire du 01/10/2026
--
-- 1. « Offrir la possibilité de modifier la candidature » (Amir, 17:39) :
--    tant que l'offre est « reçue » et la consultation en ligne (mêmes
--    conditions que le retrait), l'entreprise corrige son offre : montant,
--    décomposition du prix, délais, note d'intention, pièce jointe. La date de
--    la dernière modification est posée par la base et montrée à l'équipe.
--
-- 2. « On ne peut pas lancer une discussion » (Pierre Zently, 17:14) : un fil
--    n'existait que sur une opération où l'entreprise était retenue. Choix
--    d'Amir (01/10) :
--    - fil privé avec l'équipe sur toute opération où l'entreprise a une
--      candidature en cours (reçue ou retenue) ou dont elle est le maître
--      d'œuvre saisi ; les messages « à tous les prestataires du projet »
--      restent réservés aux entreprises retenues ;
--    - fil général « Équipe Strat Eco », sans opération (prestataire_messages),
--      lu par l'équipe depuis la Base prestataires.
--    Pas d'alerte e-mail vers l'équipe quand une entreprise écrit (choix
--    d'Amir) : pastilles du menu seulement.

-- ========== 1. Candidature modifiable ==========
alter table candidatures add column if not exists modifiee_le timestamptz;

comment on column candidatures.modifiee_le is
  'Dernière modification de l''offre par l''entreprise (posée par la base, jamais par la saisie).';

create or replace function protege_candidature_presta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  suivi text[] := array['engagement_at', 'decision_vue_at', 'retrait_at', 'retrait_motif'];
  offre text[] := array[
    'montant', 'message', 'fichier_path', 'fichier_name',
    'tarif_diag_avp', 'tarif_pro_dce', 'tarif_pro_dce_mode', 'tarif_chantier', 'tarif_chantier_mode',
    'tarif_options', 'tarif_etancheite_avant', 'tarif_etancheite_apres',
    'tarif_conception', 'tarif_realisation',
    'tarif_pppt', 'tarif_dpe', 'delai_pppt_semaines', 'delai_dpe_semaines'
  ];
  n jsonb := to_jsonb(new) - 'modifiee_le';
  o jsonb := to_jsonb(old) - 'modifiee_le';
begin
  if is_amo() then return new; end if;
  if n - suivi - offre <> o - suivi - offre then
    raise exception 'Seuls l''offre, l''engagement, l''accusé de décision et le retrait sont modifiables par le prestataire';
  end if;

  -- la date de modification suit l'offre, jamais la saisie
  new.modifiee_le := old.modifiee_le;
  if n - suivi <> o - suivi then
    if old.retrait_at is not null then
      raise exception 'Cette candidature est retirée : déposez une nouvelle offre';
    end if;
    if old.statut <> 'recue' then
      raise exception 'Une offre déjà tranchée ne peut plus être modifiée - contactez l''équipe Strat Eco';
    end if;
    if not exists (select 1 from consultations c where c.id = new.consultation_id and c.statut = 'en_ligne') then
      raise exception 'La consultation n''est plus en ligne - l''offre ne peut plus être modifiée';
    end if;
    new.modifiee_le := now();
  end if;

  if new.engagement_at is distinct from old.engagement_at and old.statut <> 'retenue' then
    raise exception 'L''engagement ne se confirme que sur une candidature retenue';
  end if;
  if new.retrait_at is distinct from old.retrait_at then
    if old.retrait_at is not null then
      raise exception 'Cette candidature est déjà retirée';
    end if;
    if new.retrait_at is null then
      raise exception 'Le retrait d''une candidature est définitif';
    end if;
    if old.statut <> 'recue' then
      raise exception 'Une offre déjà tranchée ne peut plus être retirée - contactez l''équipe Strat Eco';
    end if;
    if not exists (select 1 from consultations c where c.id = new.consultation_id and c.statut = 'en_ligne') then
      raise exception 'La consultation n''est plus en ligne - le retrait n''est plus possible';
    end if;
  elsif new.retrait_motif is distinct from old.retrait_motif then
    raise exception 'Le motif de retrait accompagne le retrait';
  end if;
  return new;
end;
$$;

-- fonction de trigger : jamais appelable par l'API (le droit public par défaut compris)
revoke execute on function public.protege_candidature_presta() from public, anon, authenticated;

-- ========== 2a. Fil privé sur les opérations de l'entreprise ==========
-- Opération où l'entreprise connectée peut écrire à l'équipe : retenue,
-- maître d'œuvre saisi sur le dossier, ou candidature en cours (reçue ou
-- retenue, non retirée) sur une consultation de la copropriété.
create or replace function presta_peut_ecrire_sur(p_copro_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_presta_retenu_of(p_copro_id)
    or is_moe_designe_of(p_copro_id)
    or exists (
      select 1 from candidatures ca
      join consultations c on c.id = ca.consultation_id
      where c.copro_id = p_copro_id
        and ca.prestataire_id = my_prestataire_id()
        and ca.statut in ('recue', 'retenue')
        and ca.retrait_at is null
    );
$$;

revoke execute on function public.presta_peut_ecrire_sur(uuid) from anon, public;
grant execute on function public.presta_peut_ecrire_sur(uuid) to authenticated;

-- Lecture : les messages « à tous » restent réservés aux retenues ; le fil
-- privé de l'entreprise (prestataire_id = la sienne) lui reste lisible.
drop policy if exists messages_presta_read on messages_projet;
create policy messages_presta_read on messages_projet
  for select to authenticated
  using (
    canal = 'prestataires'
    and (
      (prestataire_id is null and is_presta_retenu_of(copro_id))
      or prestataire_id = my_prestataire_id()
    )
  );

-- Écriture : toujours dans son fil privé, signée « presta ».
drop policy if exists messages_presta_insert on messages_projet;
create policy messages_presta_insert on messages_projet
  for insert to authenticated
  with check (
    canal = 'prestataires'
    and prestataire_id = my_prestataire_id()
    and user_id = auth.uid()
    and auteur_role = 'presta'
    and presta_peut_ecrire_sur(copro_id)
  );

-- ========== 2b. Fil général « Équipe Strat Eco » ==========
create table if not exists prestataire_messages (
  id uuid primary key default gen_random_uuid(),
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  auteur_nom text not null default '',
  auteur_role text not null check (auteur_role in ('amo', 'presta')),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

comment on table prestataire_messages is
  'Fil général entre une entreprise et l''équipe Strat Eco, sans opération (0124).';

create index if not exists idx_prestataire_messages on prestataire_messages (prestataire_id, created_at);

alter table prestataire_messages enable row level security;

create policy presta_messages_amo_all on prestataire_messages
  for all to authenticated using (is_amo()) with check (is_amo());
create policy presta_messages_own_read on prestataire_messages
  for select to authenticated using (prestataire_id = my_prestataire_id());
create policy presta_messages_own_insert on prestataire_messages
  for insert to authenticated
  with check (prestataire_id = my_prestataire_id() and user_id = auth.uid() and auteur_role = 'presta');

-- Repères de lecture du fil général : un par compte et par entreprise
-- (l'entreprise pour son fil, chaque membre de l'équipe pour chaque fil).
create table if not exists prestataire_messages_lectures (
  user_id uuid not null references auth.users (id) on delete cascade,
  prestataire_id uuid not null references prestataires (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, prestataire_id)
);

alter table prestataire_messages_lectures enable row level security;

create policy presta_messages_lectures_own on prestataire_messages_lectures
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (is_amo() or prestataire_id = my_prestataire_id()));

revoke all on prestataire_messages, prestataire_messages_lectures from anon;
revoke update, truncate on prestataire_messages from authenticated;
grant select, insert, delete on prestataire_messages to authenticated;
grant select, insert, update, delete on prestataire_messages_lectures to authenticated;
