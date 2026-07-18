-- RLS V1 : accès complet pour l'équipe AMO, rien pour les autres.
-- Phase 2 : policies par copro_members (syndic / moe / copropriétaire sur leur périmètre).

-- security definer pour éviter la récursion RLS sur profiles
create or replace function is_amo()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'amo' and active
  );
$$;

-- profiles : chacun lit son propre profil (nécessaire au login), l'AMO lit/gère tout
alter table profiles enable row level security;
create policy profiles_own_read on profiles for select to authenticated
  using (user_id = auth.uid() or is_amo());
create policy profiles_amo_write on profiles for insert to authenticated with check (is_amo());
create policy profiles_amo_update on profiles for update to authenticated using (is_amo()) with check (is_amo());
create policy profiles_amo_delete on profiles for delete to authenticated using (is_amo());

-- barèmes : lecture pour tout utilisateur connecté, écriture AMO
alter table baremes enable row level security;
create policy baremes_read on baremes for select to authenticated using (true);
create policy baremes_amo_write on baremes for insert to authenticated with check (is_amo());
create policy baremes_amo_update on baremes for update to authenticated using (is_amo()) with check (is_amo());
create policy baremes_amo_delete on baremes for delete to authenticated using (is_amo());

-- toutes les autres tables : AMO uniquement
do $$
declare
  t text;
begin
  foreach t in array array[
    'coproprietes', 'copro_members', 'batiments', 'coproprietaires', 'lots',
    'cles_repartition', 'lot_tantiemes', 'taches', 'scenarios_financiers',
    'plans_individuels', 'enquetes', 'enquete_reponses', 'fichiers',
    'checklists', 'checklist_items', 'notes_projet', 'consultations', 'candidatures'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (is_amo()) with check (is_amo())',
      t || '_amo_all', t
    );
  end loop;
end $$;

-- ========== Storage : buckets privés ==========
insert into storage.buckets (id, name, public)
values ('copro-files', 'copro-files', false), ('copro-photos', 'copro-photos', false)
on conflict (id) do nothing;

create policy storage_amo_all on storage.objects for all to authenticated
  using (bucket_id in ('copro-files', 'copro-photos') and is_amo())
  with check (bucket_id in ('copro-files', 'copro-photos') and is_amo());
