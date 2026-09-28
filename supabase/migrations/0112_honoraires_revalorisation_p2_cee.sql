-- 0112 - Revalorisation de la P2 et honoraires CEE depuis le bloc « Honoraires AMO »
--
-- Idée d'Amir 28/09/2026 (15:50) : deux boutons dans le bloc Honoraires de
-- l'onglet Projet.
--   - « Revaloriser la P2 » : l'AMO saisit les honoraires HT de la phase
--     travaux, répartis 50 % en P2a, 30 % en P2b, 20 % en P2c (règlement du
--     contrat AMO) ;
--   - « Honoraires CEE » : l'AMO saisit le volume de CEE en kWh cumac ;
--     FCEE 1 = FCEE 2 = kWh cumac / 1 000 000 × 250 € HT.
-- Le calcul est fait ici, côté serveur, pour qu'une seule règle fasse foi. Les
-- états (à facturer / facturé / encaissé) des jalons ne changent pas. La base
-- saisie (montant P2, kWh cumac), la date et l'auteur restent sur le dossier.

alter table honoraires_dossiers
  add column if not exists p2_montant_ht numeric(12, 2) check (p2_montant_ht is null or p2_montant_ht > 0),
  add column if not exists p2_saisi_le timestamptz,
  add column if not exists p2_saisi_par uuid references profiles(user_id) on delete set null,
  add column if not exists cee_kwhc numeric(16, 0) check (cee_kwhc is null or cee_kwhc > 0),
  add column if not exists cee_saisi_le timestamptz,
  add column if not exists cee_saisi_par uuid references profiles(user_id) on delete set null;

-- un dossier peut désormais naître d'une saisie dans l'application, pas d'un import
alter table honoraires_dossiers alter column importe_le drop not null, alter column importe_le drop default;

alter table honoraires_jalons
  add column if not exists updated_by uuid references profiles(user_id) on delete set null;

comment on column honoraires_dossiers.p2_montant_ht is 'Honoraires HT de la phase travaux saisis par « Revaloriser la P2 » (0112) : 50 % P2a, 30 % P2b, 20 % P2c.';
comment on column honoraires_dossiers.cee_kwhc is 'Volume de CEE en kWh cumac saisi par « Honoraires CEE » (0112) : FCEE 1 = FCEE 2 = kWh cumac / 1 000 000 × 250 € HT.';

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
end;
$$;

revoke execute on function honoraires_revaloriser_p2(uuid, numeric) from public, anon;
revoke execute on function honoraires_saisir_cee(uuid, numeric) from public, anon;
grant execute on function honoraires_revaloriser_p2(uuid, numeric) to authenticated;
grant execute on function honoraires_saisir_cee(uuid, numeric) to authenticated;
