-- 0134 - Honoraires du contrat : nouvelle formule ou jalons saisis à la main
--
-- Demande d'Amir du 03/10/2026 : « Lorsqu'on crée une copropriété, on doit
-- avoir le choix entre P1, P2 nouvelle formule, c'est-à-dire avec les
-- répartitions 50-25-25 et 50-30-20, ou l'ancienne formule, où on inscrit les
-- jalons à la main. »
--
--   - nouvelle formule : honoraires_saisir_p1 (0121) et
--     honoraires_revaloriser_p2 (0112), inchangées sauf la formule notée sur le
--     dossier ;
--   - ancienne formule : honoraires_saisir_jalons écrit les trois jalons d'une
--     phase tels que saisis (P1a, P1b, P1c ou P2a, P2b, P2c), garde leur total
--     comme base de la phase et journalise la saisie sous le type de la phase
--     ('p1' ou 'p2') : « Annuler » du bloc Honoraires la défait comme une
--     saisie répartie ;
--   - honoraires_dossiers.p1_formule / p2_formule : formule de la dernière
--     saisie de la phase, rétablie par l'annulation.

alter table honoraires_dossiers
  add column if not exists p1_formule text check (p1_formule in ('nouvelle', 'ancienne')),
  add column if not exists p2_formule text check (p2_formule in ('nouvelle', 'ancienne'));

comment on column honoraires_dossiers.p1_formule is
  'Formule de la dernière saisie de la phase études (0134) : nouvelle = 50/25/25, ancienne = jalons saisis à la main.';
comment on column honoraires_dossiers.p2_formule is
  'Formule de la dernière saisie de la phase travaux (0134) : nouvelle = 50/30/20, ancienne = jalons saisis à la main.';

-- Saisies faites avant 0134 : toutes réparties
update honoraires_dossiers set p1_formule = 'nouvelle' where p1_montant_ht is not null and p1_formule is null;
update honoraires_dossiers set p2_formule = 'nouvelle' where p2_montant_ht is not null and p2_formule is null;

-- Photographie avant écriture : la base de la phase garde aussi sa formule
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
        when 'p1' then jsonb_build_object('valeur', d.p1_montant_ht, 'saisi_le', d.p1_saisi_le, 'saisi_par', d.p1_saisi_par, 'formule', d.p1_formule)
        when 'p2' then jsonb_build_object('valeur', d.p2_montant_ht, 'saisi_le', d.p2_saisi_le, 'saisi_par', d.p2_saisi_par, 'formule', d.p2_formule)
        else jsonb_build_object('valeur', d.cee_kwhc, 'saisi_le', d.cee_saisi_le, 'saisi_par', d.cee_saisi_par)
      end
      from (select 1) as un
      left join honoraires_dossiers d on d.copro_id = p_copro_id
    )
  );
$$;
revoke execute on function honoraires_photo_avant(uuid, text, text[]) from public, anon, authenticated;

-- Nouvelle formule, phase études (0121) : la formule est notée sur le dossier
create or replace function honoraires_saisir_p1(p_copro_id uuid, p_montant_ht numeric)
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
    raise exception 'Indiquez un montant HT positif pour la phase études';
  end if;
  if not exists (select 1 from coproprietes where id = p_copro_id and deleted_at is null) then
    raise exception 'Dossier introuvable';
  end if;

  total := round(p_montant_ht, 2);
  a := round(total * 0.5, 2);
  b := round(total * 0.25, 2);
  photo := honoraires_photo_avant(p_copro_id, 'p1', array['P1a', 'P1b', 'P1c']);

  -- P1c prend le reste : la somme des trois jalons égale toujours le montant saisi
  insert into honoraires_jalons (copro_id, jalon, montant_ht, updated_at, updated_by)
  values
    (p_copro_id, 'P1a', a, now(), auth.uid()),
    (p_copro_id, 'P1b', b, now(), auth.uid()),
    (p_copro_id, 'P1c', total - a - b, now(), auth.uid())
  on conflict (copro_id, jalon) do update
    set montant_ht = excluded.montant_ht, updated_at = now(), updated_by = auth.uid();

  insert into honoraires_dossiers (copro_id, p1_montant_ht, p1_saisi_le, p1_saisi_par, p1_formule)
  values (p_copro_id, total, now(), auth.uid(), 'nouvelle')
  on conflict (copro_id) do update
    set p1_montant_ht = excluded.p1_montant_ht, p1_saisi_le = now(), p1_saisi_par = auth.uid(), p1_formule = 'nouvelle';

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, 'p1', total, photo, jsonb_build_object('P1a', a, 'P1b', b, 'P1c', total - a - b), now(), auth.uid());
end;
$$;

revoke execute on function honoraires_saisir_p1(uuid, numeric) from public, anon;
grant execute on function honoraires_saisir_p1(uuid, numeric) to authenticated;

-- Nouvelle formule, phase travaux (0112) : la formule est notée sur le dossier
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

  insert into honoraires_dossiers (copro_id, p2_montant_ht, p2_saisi_le, p2_saisi_par, p2_formule)
  values (p_copro_id, total, now(), auth.uid(), 'nouvelle')
  on conflict (copro_id) do update
    set p2_montant_ht = excluded.p2_montant_ht, p2_saisi_le = now(), p2_saisi_par = auth.uid(), p2_formule = 'nouvelle';

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, 'p2', total, photo, jsonb_build_object('P2a', a, 'P2b', b, 'P2c', total - a - b), now(), auth.uid());
end;
$$;

revoke execute on function honoraires_revaloriser_p2(uuid, numeric) from public, anon;
grant execute on function honoraires_revaloriser_p2(uuid, numeric) to authenticated;

-- Ancienne formule : les trois jalons d'une phase saisis à la main.
-- p_montants = {"P1a": 3000, "P1b": 3000, "P1c": null} ; un jalon vide (ou à
-- 0) n'a pas de montant : son montant est retiré s'il en avait un, sauf s'il
-- est déjà facturé ou encaissé.
create or replace function honoraires_saisir_jalons(p_copro_id uuid, p_phase text, p_montants jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  codes text[];
  code text;
  brut jsonb;
  v numeric(12, 2);
  montants jsonb := '{}'::jsonb;
  total numeric(12, 2) := 0;
  photo jsonb;
  j honoraires_jalons%rowtype;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_phase = 'p1' then
    codes := array['P1a', 'P1b', 'P1c'];
  elsif p_phase = 'p2' then
    codes := array['P2a', 'P2b', 'P2c'];
  else
    raise exception 'Phase inconnue : p1 ou p2 attendu';
  end if;
  if p_montants is null or jsonb_typeof(p_montants) <> 'object' then
    raise exception 'Montants des jalons manquants';
  end if;
  if exists (select 1 from jsonb_object_keys(p_montants) k where k <> all (codes)) then
    raise exception 'Jalon inconnu pour cette phase (attendus : %)', array_to_string(codes, ', ');
  end if;
  if not exists (select 1 from coproprietes where id = p_copro_id and deleted_at is null) then
    raise exception 'Dossier introuvable';
  end if;

  foreach code in array codes loop
    brut := p_montants -> code;
    if brut is null or jsonb_typeof(brut) = 'null' then
      continue;
    end if;
    if jsonb_typeof(brut) <> 'number' then
      raise exception 'Montant de % illisible', code;
    end if;
    v := round((brut #>> '{}')::numeric, 2);
    if v < 0 then
      raise exception 'Montant de % négatif', code;
    end if;
    if v > 0 then
      montants := montants || jsonb_build_object(code, v);
      total := total + v;
    end if;
  end loop;
  if total <= 0 then
    raise exception 'Indiquez le montant HT d''au moins un jalon';
  end if;

  photo := honoraires_photo_avant(p_copro_id, p_phase, codes);

  foreach code in array codes loop
    if montants ? code then
      insert into honoraires_jalons (copro_id, jalon, montant_ht, updated_at, updated_by)
      values (p_copro_id, code, (montants ->> code)::numeric, now(), auth.uid())
      on conflict (copro_id, jalon) do update
        set montant_ht = excluded.montant_ht, updated_at = now(), updated_by = auth.uid();
    else
      select * into j from honoraires_jalons where copro_id = p_copro_id and jalon = code for update;
      if found and coalesce(j.montant_ht, 0) > 0 then
        if j.etat <> 'a_facturer' then
          raise exception '% est déjà facturé : son montant ne peut pas être retiré', code;
        end if;
        update honoraires_jalons set montant_ht = null, updated_at = now(), updated_by = auth.uid()
        where copro_id = p_copro_id and jalon = code;
      end if;
    end if;
  end loop;

  if p_phase = 'p1' then
    insert into honoraires_dossiers (copro_id, p1_montant_ht, p1_saisi_le, p1_saisi_par, p1_formule)
    values (p_copro_id, total, now(), auth.uid(), 'ancienne')
    on conflict (copro_id) do update
      set p1_montant_ht = excluded.p1_montant_ht, p1_saisi_le = now(), p1_saisi_par = auth.uid(), p1_formule = 'ancienne';
  else
    insert into honoraires_dossiers (copro_id, p2_montant_ht, p2_saisi_le, p2_saisi_par, p2_formule)
    values (p_copro_id, total, now(), auth.uid(), 'ancienne')
    on conflict (copro_id) do update
      set p2_montant_ht = excluded.p2_montant_ht, p2_saisi_le = now(), p2_saisi_par = auth.uid(), p2_formule = 'ancienne';
  end if;

  insert into honoraires_saisies (copro_id, type, valeur, avant, apres, saisi_le, saisi_par)
  values (p_copro_id, p_phase, total, photo, montants, now(), auth.uid());
end;
$$;

revoke execute on function honoraires_saisir_jalons(uuid, text, jsonb) from public, anon;
grant execute on function honoraires_saisir_jalons(uuid, text, jsonb) to authenticated;

-- Annulation (0113, 0121) : la formule d'avant est rétablie avec la base
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
  formule text;
begin
  if not is_amo() then
    raise exception 'Réservé à l''équipe AMO' using errcode = '42501';
  end if;
  if p_type not in ('p1', 'p2', 'cee') then
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
  -- photo d'avant 0134 : une base saisie était forcément répartie
  formule := case when base ->> 'valeur' is null then null else coalesce(base ->> 'formule', 'nouvelle') end;
  if p_type = 'p1' then
    update honoraires_dossiers
      set p1_montant_ht = (base ->> 'valeur')::numeric,
          p1_saisi_le = (base ->> 'saisi_le')::timestamptz,
          p1_saisi_par = (base ->> 'saisi_par')::uuid,
          p1_formule = formule
    where copro_id = p_copro_id;
  elsif p_type = 'p2' then
    update honoraires_dossiers
      set p2_montant_ht = (base ->> 'valeur')::numeric,
          p2_saisi_le = (base ->> 'saisi_le')::timestamptz,
          p2_saisi_par = (base ->> 'saisi_par')::uuid,
          p2_formule = formule
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
