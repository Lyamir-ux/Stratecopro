-- 0113 - Annuler la dernière revalorisation de la P2 ou la dernière saisie CEE
--
-- Retour d'Amir 28/09/2026 (16:04) : « faire un bouton pour annuler la
-- dernière revalorisation ou le dernier honoraire CEE ». Chaque saisie faite
-- par les boutons du bloc Honoraires (0112) est désormais journalisée avec les
-- montants qu'elle remplace ; « Annuler » rétablit exactement l'état d'avant
-- (montants, date et auteur de mise à jour des jalons, base saisie du dossier)
-- et marque la saisie annulée. Les annulations s'empilent : annuler encore
-- revient à la saisie précédente. L'état des jalons (à facturer / facturé /
-- encaissé) n'est jamais touché.

create table if not exists honoraires_saisies (
  id uuid primary key default gen_random_uuid(),
  -- ordre strict des saisies (deux saisies d'une même transaction ont la même heure)
  ordre bigint generated always as identity,
  copro_id uuid not null references coproprietes(id) on delete cascade,
  type text not null check (type in ('p2', 'cee')),
  -- montant HT de la phase travaux (p2) ou kWh cumac (cee) saisis
  valeur numeric not null,
  -- { "jalons": { "P2a": { "existe": true, "montant": 2400, "updated_at": "...", "updated_by": null }, ... },
  --   "base": { "valeur": null, "saisi_le": null, "saisi_par": null } }
  avant jsonb not null,
  -- { "P2a": 2000, "P2b": 1200, "P2c": 800 }
  apres jsonb not null,
  saisi_le timestamptz not null default now(),
  saisi_par uuid references profiles(user_id) on delete set null,
  annule_le timestamptz,
  annule_par uuid references profiles(user_id) on delete set null
);

create index if not exists honoraires_saisies_copro_idx on honoraires_saisies (copro_id, type, ordre desc);

comment on table honoraires_saisies is
  'Journal des saisies du bloc Honoraires (0113) : revalorisation de la P2 et honoraires CEE, avec les montants remplacés pour pouvoir annuler.';

alter table honoraires_saisies enable row level security;
create policy honoraires_saisies_amo_lecture on honoraires_saisies
  for select to authenticated using (is_amo());
revoke all on honoraires_saisies from anon;
revoke insert, update, delete, truncate on honoraires_saisies from authenticated;
grant select on honoraires_saisies to authenticated;

-- Photographie des jalons touchés et de la base du dossier, avant écriture
create or replace function honoraires_photo_avant(p_copro_id uuid, p_type text, p_codes text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'jalons', (
      select jsonb_object_agg(
        c.code,
        case when j.jalon is null then jsonb_build_object('existe', false)
             else jsonb_build_object('existe', true, 'montant', j.montant_ht, 'updated_at', j.updated_at, 'updated_by', j.updated_by)
        end)
      from unnest(p_codes) as c(code)
      left join honoraires_jalons j on j.copro_id = p_copro_id and j.jalon = c.code
    ),
    'base', (
      select case p_type
        when 'p2' then jsonb_build_object('valeur', d.p2_montant_ht, 'saisi_le', d.p2_saisi_le, 'saisi_par', d.p2_saisi_par)
        else jsonb_build_object('valeur', d.cee_kwhc, 'saisi_le', d.cee_saisi_le, 'saisi_par', d.cee_saisi_par)
      end
      from (select 1) as un
      left join honoraires_dossiers d on d.copro_id = p_copro_id
    )
  );
$$;
revoke execute on function honoraires_photo_avant(uuid, text, text[]) from public, anon, authenticated;

create or replace function honoraires_revaloriser_p2(p_copro_id uuid, p_montant_ht numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric(12, 2);
  a numeric(12, 2);
  b numeric(12, 2);
  photo jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_montant_ht is null or p_montant_ht <= 0 then
    raise exception 'Indiquez un montant HT positif pour la phase travaux';
  end if;
  if not exists (select 1 from coproprietes where id = p_copro_id and deleted_at is null) then
    raise exception 'Dossier introuvable';
  end if;

  total := round(p_montant_ht, 2);
  a := round(total * 0.5, 2);
  b := round(total * 0.3, 2);
  photo := honoraires_photo_avant(p_copro_id, 'p2', array['P2a', 'P2b', 'P2c']);

  -- P2c prend le reste : la somme des trois jalons égale toujours le montant saisi
  insert into honoraires_jalons (copro_id, jalon, montant_ht, updated_at, updated_by)
  values
    (p_copro_id, 'P2a', a, now(), auth.uid()),
    (p_copro_id, 'P2b', b, now(), auth.uid()),
    (p_copro_id, 'P2c', total - a - b, now(), auth.uid())
  on conflict (copro_id, jalon) do update
    set montant_ht = excluded.montant_ht, updated_at = now(), updated_by = auth.uid();

  insert into honoraires_dossiers (copro_id, p2_montant_ht, p2_saisi_le, p2_saisi_par)
  values (p_copro_id, total, now(), auth.uid())
  on conflict (copro_id) do update
    set p2_montant_ht = excluded.p2_montant_ht, p2_saisi_le = now(), p2_saisi_par = auth.uid();

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, 'p2', total, photo, jsonb_build_object('P2a', a, 'P2b', b, 'P2c', total - a - b), now(), auth.uid());
end;
$$;

create or replace function honoraires_saisir_cee(p_copro_id uuid, p_kwhc numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kwhc numeric(16, 0);
  m numeric(12, 2);
  photo jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_kwhc is null or p_kwhc <= 0 then
    raise exception 'Indiquez un volume de CEE positif en kWh cumac';
  end if;
  if not exists (select 1 from coproprietes where id = p_copro_id and deleted_at is null) then
    raise exception 'Dossier introuvable';
  end if;

  kwhc := round(p_kwhc);
  m := round(kwhc / 1000000 * 250, 2);
  photo := honoraires_photo_avant(p_copro_id, 'cee', array['FCEE1', 'FCEE2']);

  insert into honoraires_jalons (copro_id, jalon, montant_ht, updated_at, updated_by)
  values
    (p_copro_id, 'FCEE1', m, now(), auth.uid()),
    (p_copro_id, 'FCEE2', m, now(), auth.uid())
  on conflict (copro_id, jalon) do update
    set montant_ht = excluded.montant_ht, updated_at = now(), updated_by = auth.uid();

  insert into honoraires_dossiers (copro_id, cee_kwhc, cee_saisi_le, cee_saisi_par)
  values (p_copro_id, kwhc, now(), auth.uid())
  on conflict (copro_id) do update
    set cee_kwhc = excluded.cee_kwhc, cee_saisi_le = now(), cee_saisi_par = auth.uid();

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, 'cee', kwhc, photo, jsonb_build_object('FCEE1', m, 'FCEE2', m), now(), auth.uid());
end;
$$;

-- Annule la dernière saisie non annulée du type demandé
create or replace function honoraires_annuler_saisie(p_copro_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s honoraires_saisies%rowtype;
  code text;
  j jsonb;
  base jsonb;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_type not in ('p2', 'cee') then
    raise exception 'Type de saisie inconnu';
  end if;

  select * into s from honoraires_saisies
  where copro_id = p_copro_id and type = p_type and annule_le is null
  order by ordre desc
  limit 1
  for update;
  if not found then
    raise exception 'Aucune saisie à annuler pour ce dossier';
  end if;

  for code, j in select * from jsonb_each(s.avant -> 'jalons') loop
    if (j ->> 'existe')::boolean then
      update honoraires_jalons
        set montant_ht = (j ->> 'montant')::numeric,
            updated_at = coalesce((j ->> 'updated_at')::timestamptz, now()),
            updated_by = (j ->> 'updated_by')::uuid
      where copro_id = p_copro_id and jalon = code;
    else
      -- jalon créé par la saisie : retiré, sauf s'il a été facturé entre-temps
      delete from honoraires_jalons where copro_id = p_copro_id and jalon = code and etat = 'a_facturer';
      update honoraires_jalons set montant_ht = null, updated_at = now(), updated_by = auth.uid()
      where copro_id = p_copro_id and jalon = code;
    end if;
  end loop;

  base := s.avant -> 'base';
  if p_type = 'p2' then
    update honoraires_dossiers
      set p2_montant_ht = (base ->> 'valeur')::numeric,
          p2_saisi_le = (base ->> 'saisi_le')::timestamptz,
          p2_saisi_par = (base ->> 'saisi_par')::uuid
    where copro_id = p_copro_id;
  else
    update honoraires_dossiers
      set cee_kwhc = (base ->> 'valeur')::numeric,
          cee_saisi_le = (base ->> 'saisi_le')::timestamptz,
          cee_saisi_par = (base ->> 'saisi_par')::uuid
    where copro_id = p_copro_id;
  end if;

  update honoraires_saisies set annule_le = now(), annule_par = auth.uid() where id = s.id;
end;
$$;

revoke execute on function honoraires_annuler_saisie(uuid, text) from public, anon;
grant execute on function honoraires_annuler_saisie(uuid, text) to authenticated;
